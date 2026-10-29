<?php

namespace App\Support;

use App\Models\CheckoutSession;
use App\Models\Receipt;

final class ReceiptPresenter
{
    public static function payload(Receipt $receipt): array
    {
        $receipt->loadMissing(['lineItems', 'payments', 'session.table', 'session.items', 'checkoutSession.gameSessions.table', 'checkoutSession.gameSessions.items', 'checkoutSession.items']);
        $sessions = $receipt->session ? collect([$receipt->session]) : ($receipt->checkoutSession?->gameSessions ?? collect());
        $lineItems = [];
        foreach ($sessions as $session) {
            foreach (self::sessionTimeLines($session) as $line) {
                $lineItems[] = $line;
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
        ];
    }

    /**
     * Time lines for a specific set of blocks, used when only part of a session is being paid.
     *
     * @param  array<string|int, mixed>  $counts
     * @return array<int, array<string, mixed>>
     */
    public static function timeLinesFor(object $session, array $counts): array
    {
        return self::sessionTimeLines($session, $counts);
    }

    /**
     * Table time and products currently on a tab, for invoices that only stored the payment line.
     *
     * @return array<int, array<string, mixed>>
     */
    public static function checkoutComponents(CheckoutSession $checkout): array
    {
        $checkout->loadMissing(['items', 'gameSessions.table', 'gameSessions.items']);
        $lines = [];

        foreach ($checkout->gameSessions as $session) {
            foreach (self::sessionTimeLines($session) as $line) {
                $lines[] = self::componentRow($line);
            }

            $tableLabel = self::tableLabel($session->table?->name);
            foreach ($session->items as $item) {
                $lines[] = self::componentRow([
                    'type' => 'product',
                    'description' => $tableLabel.' · '.($item->product_name ?? 'Item'),
                    'quantity' => (int) $item->quantity,
                    'unit_price' => (float) $item->unit_price,
                    'subtotal' => (float) $item->total_price,
                ]);
            }
        }

        foreach ($checkout->items as $item) {
            $lines[] = self::componentRow([
                'type' => 'product',
                'description' => $item->product_name ?? 'Item',
                'quantity' => (int) $item->quantity,
                'unit_price' => (float) $item->unit_price,
                'subtotal' => (float) $item->total_price,
            ]);
        }

        return $lines;
    }

    /**
     * @param  array<string|int, mixed>|null  $counts
     * @return array<int, array<string, mixed>>
     */
    private static function sessionTimeLines(object $session, ?array $counts = null): array
    {
        $seconds = (int) $session->total_played_seconds;
        $blockCounts = $counts ?? (is_array($session->time_blocks) ? $session->time_blocks : []);
        $blockLines = TableTimeBilling::lineItemsForBlocks(
            TableTimeBilling::normalizeCounts($blockCounts)
        );
        $timing = [
            'from' => $session->started_at?->copy()->setTimezone(PosDate::timezone())->format('d-m-Y h:i:s A'),
            'to' => $session->ended_at?->copy()->setTimezone(PosDate::timezone())->format('d-m-Y h:i:s A'),
            'duration' => sprintf('%02d:%02d:%02d', intdiv($seconds, 3600), intdiv($seconds % 3600, 60), $seconds % 60),
        ];
        $tableLabel = self::tableLabel($session->table?->name);

        if ($blockLines !== []) {
            return array_map(fn (array $blockLine) => [
                ...$blockLine,
                'description' => $tableLabel.' · '.$blockLine['description'],
                ...$timing,
            ], $blockLines);
        }

        if ($seconds > 0 || $session->time_total > 0) {
            return [[
                'type' => 'time',
                'description' => $tableLabel.' · time',
                'quantity' => 1,
                'unit_price' => (float) $session->time_total,
                'subtotal' => (float) $session->time_total,
                ...$timing,
            ]];
        }

        return [];
    }

    /**
     * @param  array<string, mixed>  $line
     * @return array<string, mixed>
     */
    private static function componentRow(array $line): array
    {
        $meta = array_filter([
            'from' => $line['from'] ?? null,
            'to' => $line['to'] ?? null,
            'duration' => $line['duration'] ?? null,
        ], fn ($value) => $value !== null && $value !== '');

        return [
            'type' => $line['type'],
            'description' => $line['description'],
            'quantity' => (float) ($line['quantity'] ?? 1),
            'unit_price' => (float) ($line['unit_price'] ?? 0),
            'subtotal' => (float) ($line['subtotal'] ?? 0),
            'meta' => $meta === [] ? null : $meta,
        ];
    }

    private static function tableLabel(?string $tableName): string
    {
        $label = trim((string) $tableName);

        if ($label === '') {
            return 'Table';
        }

        if (! preg_match('/^table\b/i', $label)) {
            return 'Table '.$label;
        }

        return $label;
    }
}
