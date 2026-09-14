<?php

namespace App\Support;

use App\Models\Receipt;

final class ReceiptPresenter
{
    public static function payload(Receipt $receipt): array
    {
        $receipt->loadMissing(['lineItems', 'payments', 'session.table', 'session.items', 'checkoutSession.gameSessions.table', 'checkoutSession.gameSessions.items', 'checkoutSession.items']);
        $sessions = $receipt->session ? collect([$receipt->session]) : ($receipt->checkoutSession?->gameSessions ?? collect());
        $lineItems = [];
        foreach ($sessions as $session) {
            $seconds = (int) $session->total_played_seconds;
            if ($seconds > 0 || $session->time_total > 0) {
                $lineItems[] = [
                    'type' => 'time',
                    'description' => 'Table '.($session->table?->name ?? '').' — time',
                    'from' => $session->started_at?->copy()->setTimezone(PosDate::timezone())->format('d-m-Y h:i:s A'),
                    'to' => $session->ended_at?->copy()->setTimezone(PosDate::timezone())->format('d-m-Y h:i:s A'),
                    'duration' => sprintf('%02d:%02d:%02d', intdiv($seconds, 3600), intdiv($seconds % 3600, 60), $seconds % 60),
                    'rate' => TableTimeBilling::ratePerMinute(),
                    'quantity' => TableTimeBilling::chargedMinutesForSeconds($seconds),
                    'subtotal' => (float) $session->time_total,
                ];
            }
        }
        $products = $sessions->flatMap->items->concat($receipt->checkoutSession?->items ?? []);
        foreach ($products as $item) {
            $lineItems[] = [
                'type' => 'product',
                'description' => $item->product_name ?? 'Deleted product',
                'product_id' => $item->product_id,
                'product_category' => ProductCategory::normalize($item->product_category),
                'quantity' => (int) $item->quantity,
                'unit_price' => (float) $item->unit_price,
                'subtotal' => (float) $item->total_price,
            ];
        }
        if ($receipt->lineItems->isNotEmpty()) {
            $lineItems = $receipt->lineItems->map(fn ($item) => [
                ...($item->meta ?? []),
                'type' => $item->type,
                'description' => $item->description,
                'quantity' => (float) $item->quantity,
                'unit_price' => (float) $item->unit_price,
                'subtotal' => (float) $item->subtotal,
            ])->all();
        }
        $date = $receipt->paid_at?->copy()->setTimezone(PosDate::timezone()) ?? PosDate::now();

        return [
            'id' => $receipt->id,
            'receipt_number' => $receipt->receipt_number,
            'date' => $date->format('d-m-Y'),
            'time' => $date->format('h:i:s A'),
            'table_name' => $sessions->map(fn ($session) => $session->table?->name)->filter()->unique()->implode(', ') ?: 'Open tab',
            'customer_email' => $receipt->customer_email,
            'time_total' => (float) $receipt->time_total,
            'products_total' => (float) $receipt->products_total,
            'grand_total' => (float) $receipt->grand_total,
            'started_at' => $receipt->session?->started_at?->copy()->setTimezone(PosDate::timezone())->format('d-m-Y h:i:s A'),
            'ended_at' => $receipt->session?->ended_at?->copy()->setTimezone(PosDate::timezone())->format('d-m-Y h:i:s A'),
            'line_items' => $lineItems,
            'payments' => $receipt->payments->map(fn ($payment) => ['method' => $payment->method, 'amount' => (float) $payment->amount])->all(),
        ];
    }
}
