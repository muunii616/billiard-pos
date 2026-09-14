<?php

namespace App\Http\Controllers;

use App\Models\GameSession;
use App\Models\Receipt;
use App\Support\PosDate;
use App\Support\ProductCategory;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class OverviewController extends Controller
{
    public function download(Request $request)
    {
        $data = $request->validate([
            'period' => ['required', 'in:daily,range,monthly'],
            'date' => ['required_if:period,daily', 'date_format:Y-m-d'],
            'from' => ['required_if:period,range', 'date_format:Y-m-d'],
            'to' => ['required_if:period,range', 'date_format:Y-m-d', 'after_or_equal:from'],
            'month' => ['required_if:period,monthly', 'date_format:Y-m'],
        ]);
        [$start, $end] = PosDate::reportRange($request, 'period');
        $timezone = PosDate::timezone();
        $receipts = Receipt::with('payments')
            ->where('status', 'paid')
            ->whereBetween('paid_at', [$start->copy()->utc(), $end->copy()->utc()])
            ->orderBy('paid_at')->get();
        $payments = $receipts->flatMap->payments->groupBy('method')
            ->map(fn ($items) => $items->sum('amount'));

        return Pdf::loadView('pdf.overview', [
            'receipts' => $receipts, 'payments' => $payments,
            'start' => $start, 'end' => $end, 'timezone' => $timezone,
            'period' => $data['period'],
        ])->setPaper('a4')->download('overview-'.$start->format('Y-m-d').'-'.$end->format('Y-m-d').'.pdf');
    }

    public function __invoke(Request $request): Response
    {
        $isAdmin = $request->user()?->role === 'admin';
        [$localStart, $localEnd, $mode, $date, $month] = PosDate::reportRange($request);
        $start = $localStart->utc();
        $end = $localEnd->utc();

        $receipts = Receipt::with(['payments', 'lineItems'])
            ->whereBetween('paid_at', [$start, $end])
            ->paid()
            ->orderByDesc('paid_at')
            ->get();

        if ($receipts->contains(fn (Receipt $receipt) => $receipt->lineItems->isEmpty())) {
            $receipts->load([
                'session.items',
                'checkoutSession.items',
                'checkoutSession.gameSessions.items',
            ]);
        }

        $totalRevenue = $receipts->sum('grand_total');
        $receiptsCount = $receipts->count();

        $sessionsCount = GameSession::where('status', 'completed')
            ->whereBetween('ended_at', [$start, $end])
            ->count();

        $cancelledSessions = GameSession::with(['table', 'cancelledBy'])
            ->where('status', 'cancelled')
            ->whereBetween('ended_at', [$start, $end])
            ->orderByDesc('ended_at')
            ->get()
            ->map(fn (GameSession $session) => [
                'id' => $session->id,
                'table_name' => $session->table->name ?? 'Table',
                'cancelled_at' => $session->ended_at?->toIso8601String(),
                'cancelled_by' => $session->cancelledBy?->name ?? 'Unknown',
                'reason' => $session->cancel_reason,
            ])
            ->values()
            ->all();

        $payments = $receipts->flatMap->payments->groupBy('method')
            ->map(fn ($rows) => (float) $rows->sum('amount'))->all();

        $sales = [
            'Table time' => round((float) $receipts->sum('time_total'), 2),
            'Snacks' => 0.0,
            'Drinks' => 0.0,
            'Sets' => 0.0,
            'Other' => 0.0,
        ];

        foreach ($receipts as $receipt) {
            if ($receipt->lineItems->isNotEmpty()) {
                $originalItems = collect($receipt->session?->items ?? [])
                    ->concat($receipt->checkoutSession?->items ?? [])
                    ->concat($receipt->checkoutSession?->gameSessions->flatMap->items ?? []);
                $legacyCategories = $originalItems->groupBy('product_name')->map(fn ($items) => $items->pluck('product_category')->filter()->unique()->count() === 1 ? $items->first()->product_category : null
                );
                foreach ($receipt->lineItems->whereIn('type', ['product', 'adjustment']) as $item) {
                    $category = ProductCategory::normalize($item->meta['product_category'] ?? $legacyCategories[$item->description] ?? null);
                    $sales[$category] = round(($sales[$category] ?? 0) + (float) $item->subtotal, 2);
                }

                continue;
            }
            if ($receipt->session) {
                foreach ($receipt->session->items as $item) {
                    $category = ProductCategory::normalize($item->product_category ?? $item->product?->category);
                    $sales[$category] = round(($sales[$category] ?? 0) + (float) $item->total_price, 2);
                }
            }

            if ($receipt->checkoutSession) {
                foreach ($receipt->checkoutSession->items as $item) {
                    $category = ProductCategory::normalize($item->product_category ?? $item->product?->category);
                    $sales[$category] = round(($sales[$category] ?? 0) + (float) $item->total_price, 2);
                }
                foreach ($receipt->checkoutSession->gameSessions as $session) {
                    foreach ($session->items as $item) {
                        $category = ProductCategory::normalize($item->product_category ?? $item->product?->category);
                        $sales[$category] = round(($sales[$category] ?? 0) + (float) $item->total_price, 2);
                    }
                }
            }
        }

        $chartPayments = [];
        foreach ($payments as $method => $amount) {
            $label = Str::of((string) $method)->replace('_', ' ')->title()->toString();
            $chartPayments[$label] = round((float) $amount, 2);
        }

        $selectedYear = (int) substr($month, 0, 4);
        $yearStart = PosDate::month($selectedYear.'-01');
        $incomeQuery = Receipt::paid()->whereBetween('paid_at', [$yearStart->utc(), $yearStart->endOfYear()->utc()]);
        for ($m = 1; $m <= 12; $m++) {
            $monthStart = $yearStart->addMonths($m - 1);
            $incomeQuery->selectRaw('COALESCE(SUM(CASE WHEN paid_at >= ? AND paid_at < ? THEN grand_total ELSE 0 END), 0) as month_'.$m,
                [$monthStart->utc(), $monthStart->addMonth()->utc()]);
        }
        $income = $incomeQuery->first();
        $monthlyIncome = collect(range(1, 12))->map(fn (int $m) => [
            'month' => $yearStart->addMonths($m - 1)->format('M'),
            'income' => round((float) $income->{'month_'.$m}, 2),
        ])->all();

        $invoices = $receipts
            ->map(function (Receipt $receipt) {
                $methods = $receipt->payments
                    ->pluck('method')
                    ->filter()
                    ->map(fn ($method) => Str::of((string) $method)->replace('_', ' ')->title()->toString())
                    ->unique()
                    ->values()
                    ->all();

                return [
                    'id' => $receipt->id,
                    'invoice' => $receipt->receipt_number,
                    'status' => $receipt->paid_at ? 'Paid' : 'Unpaid',
                    'method' => empty($methods) ? '—' : implode(', ', $methods),
                    'amount' => (float) $receipt->grand_total,
                    'paid_at' => $receipt->paid_at?->toIso8601String(),
                ];
            })
            ->values()
            ->all();

        return Inertia::render('overview', [
            'isAdmin' => $isAdmin,
            'mode' => $mode,
            'date' => $date,
            'month' => $month,
            'summary' => [
                'total_revenue' => $totalRevenue,
                'sessions_count' => $sessionsCount,
                'receipts_count' => $receiptsCount,
                'payments' => $payments,
            ],
            'charts' => [
                'sales' => $sales,
                'payments' => $chartPayments,
                'monthly_income' => $monthlyIncome,
            ],
            'invoices' => $invoices,
            'cancelled_sessions' => $cancelledSessions,
            'selected_year' => $selectedYear,
        ]);
    }
}
