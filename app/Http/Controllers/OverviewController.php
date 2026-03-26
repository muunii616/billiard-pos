<?php

namespace App\Http\Controllers;

use App\Models\GameSession;
use App\Models\Receipt;
use App\Models\ReceiptPayment;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class OverviewController extends Controller
{
    private function normalizeCategory(?string $category): string
    {
        $key = strtolower(trim((string) $category));

        return match ($key) {
            'drink', 'drinks' => 'Drinks',
            'snack', 'snacks' => 'Snacks',
            'set', 'sets', 'combo', 'combos' => 'Sets',
            default => 'Other',
        };
    }

    public function __invoke(Request $request): Response
    {
        $mode = $request->query('mode', 'daily'); // daily or monthly
        $dateInput = (string) $request->query('date', now()->toDateString());
        try {
            $dailyDate = Carbon::createFromFormat('Y-m-d', $dateInput)->toDateString();
        } catch (\Throwable $e) {
            $dailyDate = now()->toDateString();
        }

        if ($mode === 'monthly') {
            $month = $request->query('month', now()->format('Y-m'));
            $start = Carbon::createFromFormat('Y-m', $month)->startOfMonth();
            $endOfMonth = (clone $start)->endOfMonth();
            $end = $start->isSameMonth(now()) ? now() : $endOfMonth;
            $date = $dailyDate; // preserve user's last daily date while browsing monthly view
        } else {
            $date = $dailyDate;
            $start = Carbon::createFromFormat('Y-m-d', $date)->startOfDay();
            $end = (clone $start)->endOfDay();
            $month = $start->format('Y-m');
        }

        $receipts = Receipt::with([
            'payments',
            'session.items.product',
            'checkoutSession.items.product',
            'checkoutSession.gameSessions.items.product',
        ])
            ->whereBetween('paid_at', [$start, $end])
            ->orderByDesc('paid_at')
            ->get();
        $totalRevenue = $receipts->sum('grand_total');
        $receiptsCount = $receipts->count();

        $sessionsCount = GameSession::where('status', 'completed')
            ->whereBetween('ended_at', [$start, $end])
            ->count();

        $payments = ReceiptPayment::whereHas('receipt', function ($query) use ($start, $end) {
            $query->whereBetween('paid_at', [$start, $end]);
        })
            ->selectRaw('method, SUM(amount) as total')
            ->groupBy('method')
            ->pluck('total', 'method')
            ->toArray();

        $sales = [
            'Table time' => round((float) $receipts->sum('time_total'), 2),
            'Snacks' => 0.0,
            'Drinks' => 0.0,
            'Sets' => 0.0,
            'Other' => 0.0,
        ];

        foreach ($receipts as $receipt) {
            // Session-only receipt items
            if ($receipt->session) {
                foreach ($receipt->session->items as $item) {
                    $category = $this->normalizeCategory($item->product?->category);
                    $sales[$category] = round(($sales[$category] ?? 0) + (float) $item->total_price, 2);
                }
            }

            // Checkout receipt includes tab items and game session items
            if ($receipt->checkoutSession) {
                foreach ($receipt->checkoutSession->items as $item) {
                    $category = $this->normalizeCategory($item->product?->category);
                    $sales[$category] = round(($sales[$category] ?? 0) + (float) $item->total_price, 2);
                }
                foreach ($receipt->checkoutSession->gameSessions as $session) {
                    foreach ($session->items as $item) {
                        $category = $this->normalizeCategory($item->product?->category);
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

        $selectedYear = (int) Carbon::createFromFormat('Y-m', $month)->year;
        $monthIncomeMap = Receipt::query()
            ->whereYear('paid_at', $selectedYear)
            ->selectRaw('MONTH(paid_at) as month_no, SUM(grand_total) as total')
            ->groupBy('month_no')
            ->pluck('total', 'month_no');
        $monthlyIncome = collect(range(1, 12))->map(function (int $m) use ($monthIncomeMap) {
            return [
                'month' => Carbon::create()->month($m)->format('M'),
                'income' => round((float) ($monthIncomeMap[$m] ?? 0), 2),
            ];
        })->all();

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
                    'invoice' => $receipt->receipt_number,
                    'status' => $receipt->paid_at ? 'Paid' : 'Unpaid',
                    'method' => empty($methods) ? '—' : implode(', ', $methods),
                    'amount' => (float) $receipt->grand_total,
                ];
            })
            ->values()
            ->all();

        return Inertia::render('overview', [
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
            'selected_year' => $selectedYear,
        ]);
    }
}
