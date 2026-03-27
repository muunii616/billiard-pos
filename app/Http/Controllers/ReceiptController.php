<?php

namespace App\Http\Controllers;

use App\Mail\ReceiptMail;
use App\Models\Receipt;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;

class ReceiptController extends Controller
{
    public function sendEmail(Request $request, Receipt $receipt)
    {
        $receipt->load(['session.table', 'session.items', 'checkoutSession.gameSessions.table', 'checkoutSession.gameSessions.items', 'checkoutSession.items', 'payments']);

        if (empty($receipt->customer_email)) {
            return response()->json(['message' => 'No customer email on this receipt.'], 422);
        }

        $lineItems = [];
        $tableLabel = 'Open tab';

        if ($receipt->session) {
            $session = $receipt->session;
            $tableLabel = $session->table->name ?? 'Table';
            if ($session->started_at && $session->ended_at) {
                $durationSeconds = max(0, (int) $session->started_at->diffInSeconds($session->ended_at, true));
                $lineItems[] = [
                    'description' => 'Table time (' . gmdate('H:i:s', $durationSeconds) . ')',
                    'quantity' => 1,
                    'subtotal' => (float) $receipt->time_total,
                ];
            }
            foreach ($session->items as $item) {
                $lineItems[] = [
                    'description' => ($item->product_name ?? $item->product?->name ?? 'Deleted product') . ' x' . $item->quantity,
                    'quantity' => $item->quantity,
                    'subtotal' => (float) $item->total_price,
                ];
            }
        } elseif ($receipt->checkoutSession) {
            $cs = $receipt->checkoutSession;
            $tableLabel = $cs->gameSessions->map(fn ($s) => $s->table->name ?? '')->filter()->unique()->implode(', ');
            foreach ($cs->gameSessions as $session) {
                if ($session->time_total > 0 && $session->started_at && $session->ended_at) {
                    $dur = max(0, (int) $session->started_at->diffInSeconds($session->ended_at, true));
                    $lineItems[] = [
                        'description' => 'Table ' . ($session->table->name ?? '') . ' — time (' . gmdate('H:i:s', $dur) . ')',
                        'quantity' => 1,
                        'subtotal' => (float) $session->time_total,
                    ];
                }
                foreach ($session->items as $item) {
                    $lineItems[] = [
                        'description' => ($item->product_name ?? $item->product?->name ?? 'Deleted product') . ' x' . $item->quantity,
                        'quantity' => $item->quantity,
                        'subtotal' => (float) $item->total_price,
                    ];
                }
            }
            foreach ($cs->items as $item) {
                $lineItems[] = [
                    'description' => ($item->product_name ?? $item->product?->name ?? 'Deleted product') . ' x' . $item->quantity,
                    'quantity' => $item->quantity,
                    'subtotal' => (float) $item->total_price,
                ];
            }
        }

        Mail::to($receipt->customer_email)->send(new ReceiptMail(
            $receipt->receipt_number,
            $receipt->paid_at?->format('d-m-Y') ?? now()->format('d-m-Y'),
            $receipt->paid_at?->format('h:i:s A') ?? now()->format('h:i:s A'),
            $tableLabel,
            $receipt->customer_email,
            $lineItems,
            (float) $receipt->grand_total
        ));

        return response()->json(['message' => 'Receipt sent to ' . $receipt->customer_email]);
    }
}
