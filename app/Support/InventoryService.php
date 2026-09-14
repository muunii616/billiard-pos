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
        $quantities = collect($items)->filter(fn ($item) => data_get($item, 'product_id') !== null)
            ->groupBy(fn ($item) => (int) data_get($item, 'product_id'))
            ->map(fn (Collection $lines) => $lines->sum(fn ($item) => (int) data_get($item, 'quantity')))->sortKeys();

        foreach ($quantities as $productId => $quantity) {
            $product = Product::query()->lockForUpdate()->find($productId);

            if (! $product) {
                throw ValidationException::withMessages([
                    'inventory' => 'One or more products are missing from inventory.',
                ]);
            }

            if ($product->stock_quantity < $quantity) {
                throw ValidationException::withMessages([
                    'inventory' => sprintf(
                        'Not enough stock for %s. Available: %d, requested: %d.',
                        $product->name,
                        $product->stock_quantity,
                        $quantity,
                    ),
                ]);
            }

            $product->decrement('stock_quantity', $quantity);
        }
    }

    public static function restore(Collection|array $items): void
    {
        $quantities = collect($items)->filter(fn ($item) => data_get($item, 'product_id') !== null)
            ->groupBy(fn ($item) => (int) data_get($item, 'product_id'))
            ->map(fn (Collection $lines) => $lines->sum(fn ($item) => (int) data_get($item, 'quantity')))->sortKeys();

        foreach ($quantities as $productId => $quantity) {
            $product = Product::query()->lockForUpdate()->find($productId);
            $product?->increment('stock_quantity', $quantity);
        }
    }
}
