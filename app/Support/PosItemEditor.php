<?php

namespace App\Support;

use App\Models\Product;
use Illuminate\Database\Eloquent\Model;

final class PosItemEditor
{
    public static function rules(): array
    {
        return [
            'items' => ['sometimes', 'array'],
            'items.*.id' => ['nullable', 'integer', 'distinct'],
            'items.*.product_id' => ['nullable', 'integer', 'exists:products,id'],
            'items.*.product_name' => ['nullable', 'string', 'max:255'],
            'items.*.product_category' => ['nullable', 'string', 'max:255'],
            'items.*.unit_price' => ['nullable', 'numeric', 'min:0'],
            'items.*.quantity' => ['required', 'integer', 'min:0'],
        ];
    }

    /** Caller holds the session/tab lock inside a transaction. */
    public static function update(Model $owner, array $rows): void
    {
        foreach ($rows as $row) {
            $quantity = (int) $row['quantity'];
            $item = ! empty($row['id'])
                ? $owner->items()->findOrFail($row['id'])
                : null;

            if (! $item && ! empty($row['product_id'])) {
                $query = $owner->items()->where('product_id', $row['product_id']);
                if (array_key_exists('unit_price', $row) && $row['unit_price'] !== null && $row['unit_price'] !== '') {
                    $query->where('unit_price', $row['unit_price']);
                }
                $item = $query->first();
            }
            if ($item) {
                $delta = $quantity - (int) $item->quantity;
                $catalog = $item->product_id ? Product::query()->find($item->product_id) : null;

                if ($delta > 0) {
                    if ($catalog && ProductDeal::isDeal($catalog)) {
                        ProductDeal::assertCanSell($catalog, $delta);
                    }
                    InventoryService::deduct([[
                        'product_id' => $item->product_id,
                        'quantity' => abs($delta),
                    ]]);
                } elseif ($delta < 0 && $item->product_id) {
                    InventoryService::restore([[
                        'product_id' => $item->product_id,
                        'quantity' => abs($delta),
                    ]]);
                }
                if ($quantity === 0) {
                    $item->delete();
                } else {
                    $total = $catalog && ProductDeal::isDeal($catalog)
                        ? ProductDeal::lineTotal($catalog, $quantity)
                        : round($quantity * (float) $item->unit_price, 2);
                    $item->update([
                        'quantity' => $quantity,
                        'total_price' => $total,
                    ]);
                }

                continue;
            }
            if ($quantity === 0) {
                continue;
            }
            if (! empty($row['product_id'])) {
                $product = Product::findOrFail($row['product_id']);
                InventoryService::deduct([['product_id' => $product->id, 'quantity' => $quantity]]);
                PosItemUpserter::upsertProduct($owner, $product, $quantity);
            } elseif (trim($row['product_name'] ?? '') !== '') {
                PosItemUpserter::createManualItem($owner, $row['product_name'], $row['product_category'] ?? null, $quantity, (float) ($row['unit_price'] ?? 0));
            }
        }
    }
}
