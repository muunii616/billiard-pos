<?php

namespace App\Support;

use App\Models\Product;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

final class InventoryService
{
    /** Deduct quantities while holding row locks; call inside a DB transaction. */
    public static function deduct(Collection|array $items): void
    {
        $items = collect($items);
        foreach ($items as $item) {
            $productId = data_get($item, 'product_id');
            $quantity = (int) data_get($item, 'quantity', 0);
            if ($productId === null || $quantity <= 0) {
                continue;
            }
            $product = Product::query()->find((int) $productId);
            if ($product && ProductDeal::isDeal($product)) {
                ProductDeal::assertCanSell($product, $quantity);
            }
        }

        self::apply(ProductDeal::expandInventoryLines($items), -1);
    }

    public static function restore(Collection|array $items): void
    {
        self::apply(ProductDeal::expandInventoryLines($items), 1);
    }

    /** @param  array<int, array{product_id: int, quantity: int}>  $lines */
    private static function apply(array $lines, int $sign): void
    {
        $quantities = collect($lines)
            ->groupBy(fn ($item) => (int) $item['product_id'])
            ->map(fn (Collection $group) => $group->sum(fn ($item) => (int) $item['quantity']))
            ->sortKeys();

        foreach ($quantities as $productId => $quantity) {
            if ($quantity <= 0) {
                continue;
            }

            $product = Product::query()->lockForUpdate()->find($productId);

            if (! $product) {
                throw ValidationException::withMessages([
                    'inventory' => 'One or more products are missing from inventory.',
                ]);
            }

            if ($sign < 0 && $product->stock_quantity < $quantity) {
                throw ValidationException::withMessages([
                    'inventory' => sprintf(
                        'Not enough stock for %s. Available: %d, requested: %d.',
                        $product->name,
                        $product->stock_quantity,
                        $quantity,
                    ),
                ]);
            }

            if ($sign < 0) {
                $product->decrement('stock_quantity', $quantity);
            } else {
                $product->increment('stock_quantity', $quantity);
            }
        }
    }
}
