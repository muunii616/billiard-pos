<?php

namespace App\Support;

use App\Models\Receipt;

final class ReceiptLineItemSnapshot
{
    /**
     * Persist receipt snapshot line items if they do not yet exist.
     *
     * @param  array<int, array<string, mixed>>  $lineItems
     */
    public static function ensureFromPayload(Receipt $receipt, array $lineItems): void
    {
        if ($receipt->lineItems()->count() > 0) {
            return;
        }

        $rows = collect($lineItems)->map(function (array $lineItem) {
            $type = (string) ($lineItem['type'] ?? 'product');
            $quantity = (float) ($lineItem['quantity'] ?? 1);
            $unitPrice = (float) ($lineItem['unit_price'] ?? ($lineItem['rate'] ?? 0));
            $subtotal = (float) ($lineItem['subtotal'] ?? 0);

            return [
                'type' => $type,
                'description' => (string) ($lineItem['description'] ?? ''),
                'quantity' => $quantity,
                'unit_price' => $unitPrice,
                'subtotal' => $subtotal,
                'meta' => array_diff_key($lineItem, array_flip(['type', 'description', 'quantity', 'unit_price', 'rate', 'subtotal'])),
            ];
        })->filter(fn (array $row) => trim((string) $row['description']) !== '')->values()->all();

        foreach ($rows as $row) {
            $receipt->lineItems()->create($row);
        }
    }
}
