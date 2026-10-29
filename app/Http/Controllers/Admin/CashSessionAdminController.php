<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\CashSession;
use App\Models\CashSessionProductStock;
use App\Models\Product;
use App\Models\Receipt;
use App\Models\ReceiptPayment;
use App\Models\StockAdjustment;
use App\Models\StockUsage;
use App\Support\PosDate;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CashSessionAdminController extends Controller
{
    private function inRangeReceiptQuery(\DateTimeInterface $from, \DateTimeInterface $to)
    {
        return Receipt::paid()
            ->where('paid_at', '>=', $from)
            ->where('paid_at', '<', $to);
    }

    private function summarizeBetween(\DateTimeInterface $from, \DateTimeInterface $to): array
    {
        $receiptQuery = $this->inRangeReceiptQuery($from, $to);
        $receiptIds = (clone $receiptQuery)->pluck('id');

        $receiptsCount = (int) $receiptQuery->count();
        $totalSales = round((float) $receiptQuery->sum('grand_total'), 2);

        $paymentTotals = ReceiptPayment::query()
            ->whereIn('receipt_id', $receiptIds)
            ->selectRaw('method, SUM(amount) as total')
            ->groupBy('method')
            ->pluck('total', 'method');

        $cashSales = round((float) ($paymentTotals['cash'] ?? 0), 2);
        $cardSales = round((float) ($paymentTotals['card'] ?? 0), 2);
        $transferSales = round((float) ($paymentTotals['transfer_qr'] ?? 0), 2);

        return [
            'receipts_count' => $receiptsCount,
            'total_sales' => $totalSales,
            'cash_sales' => $cashSales,
            'card_sales' => $cardSales,
            'transfer_sales' => $transferSales,
        ];
    }

    private function presentSession(?CashSession $session): ?array
    {
        if (! $session) {
            return null;
        }

        $asOf = $session->status === 'open' ? now() : ($session->closed_at ?? now());
        $summary = $session->status === 'closed'
            ? [
                'receipts_count' => (int) $session->receipts_count,
                'total_sales' => (float) $session->total_sales,
                'cash_sales' => (float) $session->cash_sales,
                'card_sales' => (float) $session->card_sales,
                'transfer_sales' => (float) $session->transfer_sales,
            ]
            : $this->summarizeBetween($session->opened_at ?? $session->created_at, $asOf);
        $expectedCash = round((float) $session->opening_cash + $summary['cash_sales'], 2);
        $variance = $session->status === 'closed'
            ? round((float) $session->variance, 2)
            : ($session->counted_cash !== null
                ? round((float) $session->counted_cash - $expectedCash, 2)
                : null);

        return [
            'id' => $session->id,
            'status' => $session->status,
            'opening_cash' => (float) $session->opening_cash,
            'opened_at' => ($session->opened_at ?? $session->created_at)?->toIso8601String(),
            'closed_at' => optional($session->closed_at)->toIso8601String(),
            'counted_cash' => $session->counted_cash !== null ? (float) $session->counted_cash : null,
            'expected_cash' => $expectedCash,
            'variance' => $variance,
            'variance_reason' => $session->variance_reason,
            'receipts_count' => $summary['receipts_count'],
            'total_sales' => $summary['total_sales'],
            'cash_sales' => $summary['cash_sales'],
            'card_sales' => $summary['card_sales'],
            'transfer_sales' => $summary['transfer_sales'],
            'opened_by' => $session->openedBy?->name,
            'opened_by_user_id' => $session->opened_by_user_id,
            'closed_by' => $session->closedBy?->name,
        ];
    }

    public function current(Request $request)
    {
        $open = CashSession::query()->where('status', 'open')->latest('id')->first();
        $query = CashSession::query()->with(['openedBy', 'closedBy'])->where('status', 'closed');
        if ($user = request('user')) {
            $query->whereHas('openedBy', fn ($q) => $q->where('name', $user));
        }
        if ($month = request('month')) {
            if (preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $month)) {
                [$year, $monthNumber] = array_map('intval', explode('-', $month));
                $start = PosDate::month(sprintf('%04d-%02d', $year, $monthNumber));
                $query->whereRaw('COALESCE(opened_at, created_at) >= ?', [$start->utc()])
                    ->whereRaw('COALESCE(opened_at, created_at) < ?', [$start->addMonth()->utc()]);
            }
        }
        $history = $query->orderByRaw('COALESCE(opened_at, created_at) DESC')->orderByDesc('id')->paginate(10)->withQueryString();
        $users = CashSession::query()->where('status', 'closed')->with('openedBy')->get()->pluck('openedBy.name')->filter()->unique()->sort()->values();

        return response()->json([
            'open_session' => $this->presentSession($open),
            'needs_handover' => $open
                && (int) $open->opened_by_user_id !== (int) $request->user()->id
                && $request->session()->get('register.continued') !== [$request->user()->id, $open->id],
            'history' => [
                'data' => $history->getCollection()->map(fn ($session) => $this->presentSession($session))->values(),
                'current_page' => $history->currentPage(),
                'last_page' => $history->lastPage(),
                'total' => $history->total(),
            ],
            'users' => $users,
        ]);
    }

    public function open(Request $request)
    {
        $data = $request->validate([
            'opening_cash' => ['required', 'numeric', 'min:0'],
        ]);

        try {
            $session = $this->transition(function () use ($request, $data) {
                $existingOpen = CashSession::query()->where('status', 'open')->lockForUpdate()->first();
                if ($existingOpen) {
                    throw ValidationException::withMessages([
                        'shift' => 'There is already an open shift. Close it first.',
                    ]);
                }

                return $this->createShift($request, (float) $data['opening_cash'], now('UTC')->startOfSecond());
            });
        } catch (ValidationException $e) {
            return response()->json([
                'message' => collect($e->errors())->flatten()->first() ?: 'There is already an open shift. Close it first.',
            ], 422);
        }

        return response()->json([
            'message' => 'Shift opened.',
            'session' => $this->presentSession($session->fresh(['openedBy', 'closedBy'])),
        ]);
    }

    public function close(Request $request)
    {
        $data = $request->validate([
            'session_id' => ['required', 'integer'],
            'counted_cash' => ['required', 'numeric', 'min:0'],
            'variance_reason' => ['nullable', 'string', 'max:2000'],
        ]);

        $session = $this->transition(function () use ($request, $data) {
            $session = $this->lockedShift((int) $data['session_id']);
            $this->closeShift($request, $session, $data, now('UTC')->startOfSecond());

            return $session;
        });

        return response()->json([
            'message' => 'Shift closed.',
            'session' => $this->presentSession($session->fresh(['openedBy', 'closedBy'])),
            'receipt_url' => route('admin.cash.receipt', ['cashSession' => $session->id]),
        ]);
    }

    public function continueShift(Request $request)
    {
        $data = $request->validate(['session_id' => ['required', 'integer']]);
        $session = $this->transition(fn () => $this->lockedShift((int) $data['session_id']));
        $request->session()->put('register.continued', [$request->user()->id, $session->id]);

        return response()->json(['message' => 'Continuing the current shift.']);
    }

    public function handover(Request $request)
    {
        $data = $request->validate([
            'session_id' => ['required', 'integer'],
            'counted_cash' => ['required', 'numeric', 'min:0'],
            'opening_cash' => ['required', 'numeric', 'min:0'],
            'variance_reason' => ['nullable', 'string', 'max:2000'],
        ]);

        [$closed, $opened] = $this->transition(function () use ($request, $data) {
            $closed = $this->lockedShift((int) $data['session_id']);
            $at = now('UTC')->startOfSecond();
            $this->closeShift($request, $closed, $data, $at);
            $opened = $this->createShift($request, (float) $data['opening_cash'], $at);

            return [$closed, $opened];
        });
        $request->session()->forget('register.continued');

        return response()->json([
            'message' => 'Previous shift closed. Your shift is open.',
            'session' => $this->presentSession($opened->fresh(['openedBy', 'closedBy'])),
            'receipt_url' => route('admin.cash.receipt', ['cashSession' => $closed->id]),
        ]);
    }

    /** Serialize opening as well as closing, including when there is no open row to lock. */
    private function transition(callable $action): mixed
    {
        try {
            return Cache::lock('cash-register-transition', 60)->block(5, fn () => DB::transaction($action, 3));
        } catch (LockTimeoutException) {
            throw ValidationException::withMessages(['shift' => 'The register is being updated. Please try again.']);
        }
    }

    private function lockedShift(int $id): CashSession
    {
        $session = CashSession::query()->where('status', 'open')->lockForUpdate()->find($id);
        if (! $session) {
            throw ValidationException::withMessages(['shift' => 'This shift has changed. Refresh the register and try again.']);
        }

        return $session;
    }

    private function createShift(Request $request, float $cash, \DateTimeInterface $at): CashSession
    {
        $session = CashSession::create([
            'status' => 'open', 'opening_cash' => round($cash, 2),
            'opened_at' => $at, 'opened_by_user_id' => $request->user()->id,
        ]);
        foreach (Product::query()->get(['id', 'stock_quantity']) as $product) {
            CashSessionProductStock::create([
                'cash_session_id' => $session->id, 'product_id' => $product->id,
                'opening_stock' => $product->stock_quantity,
            ]);
        }

        return $session;
    }

    private function closeShift(Request $request, CashSession $session, array $data, \DateTimeInterface $closedAt): void
    {
        $summary = $this->summarizeBetween($session->opened_at ?? $session->created_at, $closedAt);
        $expectedCash = round((float) $session->opening_cash + $summary['cash_sales'], 2);
        $countedCash = round((float) $data['counted_cash'], 2);
        $variance = round($countedCash - $expectedCash, 2);
        $reason = trim((string) ($data['variance_reason'] ?? ''));

        if (abs($variance) > 0.0001 && $reason === '') {
            throw ValidationException::withMessages(['variance_reason' => 'Reason is required when variance is not zero.']);
        }

        $session->update([
            'status' => 'closed',
            'closed_at' => $closedAt,
            'closed_by_user_id' => $request->user()?->id,
            'counted_cash' => $countedCash,
            'expected_cash' => $expectedCash,
            'variance' => $variance,
            'variance_reason' => $reason !== '' ? $reason : null,
            'receipts_count' => $summary['receipts_count'],
            'total_sales' => $summary['total_sales'],
            'cash_sales' => $summary['cash_sales'],
            'card_sales' => $summary['card_sales'],
            'transfer_sales' => $summary['transfer_sales'],
        ]);
        foreach (CashSessionProductStock::query()->where('cash_session_id', $session->id)->get() as $snapshot) {
            $snapshot->update(['closing_stock' => Product::find($snapshot->product_id)?->stock_quantity ?? 0]);
        }

    }

    public function receipt(CashSession $cashSession)
    {
        if ($cashSession->status !== 'closed') {
            abort(404);
        }

        $logoPath = public_path('logo.svg');
        $logoDataUri = null;
        if (is_file($logoPath)) {
            $mime = mime_content_type($logoPath) ?: 'image/svg+xml';
            $logoDataUri = 'data:'.$mime.';base64,'.base64_encode((string) file_get_contents($logoPath));
        } elseif (extension_loaded('gd')) {
            $pngPath = public_path('logo.png');
            if (is_file($pngPath)) {
                $mime = mime_content_type($pngPath) ?: 'image/png';
                $logoDataUri = 'data:'.$mime.';base64,'.base64_encode((string) file_get_contents($pngPath));
            }
        }

        $from = $cashSession->opened_at ?? $cashSession->created_at;
        $to = $cashSession->closed_at ?? now();
        $receipts = $this->inRangeReceiptQuery($from, $to)->with('lineItems')->get();
        $productSales = $receipts->flatMap->lineItems
            ->where('type', 'product')
            ->groupBy('description')
            ->map(fn ($items, $description) => [
                'description' => $description,
                'quantity' => $items->sum('quantity'),
                'total' => $items->sum('subtotal'),
            ])->values();
        $tableTimeTotal = $receipts->sum('time_total');
        $externalUsages = StockUsage::query()->with(['product', 'user'])
            ->where('used_at', '>=', $from)->where('used_at', '<', $to)
            ->orderBy('used_at')
            ->get();
        $stockAdjustments = StockAdjustment::query()->with(['product', 'user'])
            ->where('adjusted_at', '>=', $from)->where('adjusted_at', '<', $to)->orderBy('adjusted_at')->get();
        $stockSnapshots = CashSessionProductStock::query()->with('product')->where('cash_session_id', $cashSession->id)->get();
        $soldByProduct = $receipts->flatMap->lineItems->where('type', 'product')->groupBy('description')->map(fn ($items) => $items->sum('quantity'));
        $usedByProduct = $externalUsages->groupBy('product_id')->map(fn ($items) => $items->sum('quantity'));
        $adjustedByProduct = $stockAdjustments->groupBy('product_id')->map(fn ($items) => $items->sum('quantity_change'));
        $stockReport = $stockSnapshots->map(function ($snapshot) use ($soldByProduct, $usedByProduct, $adjustedByProduct) {
            $name = $snapshot->product->name;
            $sold = (int) ($soldByProduct[$name] ?? 0);
            $used = (int) ($usedByProduct[$snapshot->product_id] ?? 0);
            $adjusted = (int) ($adjustedByProduct[$snapshot->product_id] ?? 0);

            return ['product' => $name, 'opening' => $snapshot->opening_stock, 'adjusted' => $adjusted, 'sold' => $sold, 'external' => $used, 'expected' => $snapshot->opening_stock + $adjusted - $sold - $used, 'closing' => $snapshot->closing_stock ?? $snapshot->product->stock_quantity];
        });

        $shiftDate = ($cashSession->opened_at ?? $cashSession->created_at)->copy()->timezone(PosDate::timezone())->toDateString();
        $pdf = Pdf::loadView('pdf.cash-session-receipt', [
            'shiftDate' => $shiftDate,
            'session' => $cashSession->loadMissing(['openedBy', 'closedBy']),
            'productSales' => $productSales,
            'tableTimeTotal' => $tableTimeTotal,
            'externalUsages' => $externalUsages,
            'stockAdjustments' => $stockAdjustments,
            'stockReport' => $stockReport,
            'appName' => config('app.name', 'Lox Billiard'),
            'logoDataUri' => $logoDataUri,
        ])->setPaper('a4', 'portrait');

        return $pdf->stream('shift-'.$cashSession->id.'-'.$shiftDate.'.pdf');
    }
}
