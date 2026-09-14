<?php

namespace App\Support;

use App\Models\Product;
use Illuminate\Database\Eloquent\Model;

final class PosItemUpserter
{
    public static function upsertProduct(Model $owner, Product $product, int $quantity): Model
    {
        // Preserve agreed prices when the catalog price changes during a tab.
        $item = $owner->items()->firstOrNew(['product_id' => $product->id, 'unit_price' => $product->price]);
        $item->quantity = ($item->exists ? (int) $item->quantity : 0) + $quantity;
        $item->product_name = $product->name;
        $item->product_category = ProductCategory::normalize($product->category);
        $item->total_price = round($item->quantity * (float) $item->unit_price, 2);
        $item->save();

        return $item;
    }

    public static function createManualItem(Model $owner, string $name, ?string $category, int $quantity, float $unitPrice): Model
    {
        return $owner->items()->create([
            'product_id' => null, 'product_name' => $name,
            'product_category' => ProductCategory::normalize($category),
            'quantity' => $quantity, 'unit_price' => $unitPrice,
            'total_price' => round($quantity * $unitPrice, 2),
        ]);
    }
}
