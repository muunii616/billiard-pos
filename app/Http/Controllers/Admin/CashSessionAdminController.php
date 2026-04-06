<?php

namespace App\Http\Controllers\Admin;

use Barryvdh\DomPDF\Facade\Pdf;
use App\Http\Controllers\Controller;
use App\Models\CashSession;
use App\Models\Receipt;
use App\Models\ReceiptPayment;
use Illuminate\Http\Request;

class CashSessionAdminController extends Controller
{
    private function inRangeReceiptQuery(\DateTimeInterface $from, \DateTimeInterface $to)
    {
        return Receipt::query()
            ->whereBetween('paid_at', [$from, $to])
            ->whereNull('deleted_at')
            ->where('status', '!=', 'voided');
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
        $summary = $this->summarizeBetween($session->opened_at ?? $session->created_at, $asOf);
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
            'opened_at' => optional($session->opened_at)->toIso8601String(),
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
            'closed_by' => $session->closedBy?->name,
        ];
    }

    public function current()
    {
        $open = CashSession::query()->where('status', 'open')->latest('id')->first();
        $latestClosed = CashSession::query()->where('status', 'closed')->latest('closed_at')->first();

        return response()->json([
            'open_session' => $this->presentSession($open),
            'latest_closed_session' => $this->presentSession($latestClosed),
        ]);
    }

    public function open(Request $request)
    {
        $existingOpen = CashSession::query()->where('status', 'open')->first();
        if ($existingOpen) {
            return response()->json(['message' => 'There is already an open shift. Close it first.'], 422);
        }

        $data = $request->validate([
            'opening_cash' => ['required', 'numeric', 'min:0'],
        ]);

        $session = CashSession::query()->create([
            'status' => 'open',
            'opening_cash' => round((float) $data['opening_cash'], 2),
            'opened_at' => now(),
            'opened_by_user_id' => $request->user()?->id,
        ]);

        return response()->json([
            'message' => 'Shift opened.',
            'session' => $this->presentSession($session->fresh(['openedBy', 'closedBy'])),
        ]);
    }

    public function close(Request $request)
    {
        $session = CashSession::query()->where('status', 'open')->latest('id')->first();
        if (! $session) {
            return response()->json(['message' => 'No open shift to close.'], 422);
        }

        $data = $request->validate([
            'counted_cash' => ['required', 'numeric', 'min:0'],
            'variance_reason' => ['nullable', 'string', 'max:2000'],
        ]);

        $closedAt = now();
        $summary = $this->summarizeBetween($session->opened_at ?? $session->created_at, $closedAt);
        $expectedCash = round((float) $session->opening_cash + $summary['cash_sales'], 2);
        $countedCash = round((float) $data['counted_cash'], 2);
        $variance = round($countedCash - $expectedCash, 2);
        $reason = trim((string) ($data['variance_reason'] ?? ''));

        if (abs($variance) > 0.0001 && $reason === '') {
            return response()->json(['message' => 'Reason is required when variance is not zero.'], 422);
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

        return response()->json([
            'message' => 'Shift closed.',
            'session' => $this->presentSession($session->fresh(['openedBy', 'closedBy'])),
            'receipt_url' => route('admin.cash.receipt', ['cashSession' => $session->id]),
        ]);
    }

    public function receipt(CashSession $cashSession)
    {
        if ($cashSession->status !== 'closed') {
            abort(404);
        }

        // Prefer SVG (works without GD). Use PNG only when GD is available.
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

        $pdf = Pdf::loadView('pdf.cash-session-receipt', [
            'session' => $cashSession->loadMissing(['openedBy', 'closedBy']),
            'appName' => config('app.name', 'Lox Billiard'),
            'logoDataUri' => $logoDataUri,
        ])->setPaper('a4', 'portrait');

        return $pdf->stream('register-shift-'.$cashSession->id.'.pdf');
    }
}
