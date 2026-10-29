<?php

namespace App\Support;

use App\Models\Product;
use Illuminate\Database\Eloquent\Model;

final class PosItemUpserter
{
    /** Caller must deduct inventory first, inside the same transaction. */
    public static function upsertProduct(Model $owner, Product $product, int $quantity): Model
    {
        if (ProductDeal::isDeal($product)) {
            // InventoryService already validated and reserved these units.
            $unitPrice = ProductDeal::unitPricePerPackage($product);
            $item = $owner->items()->firstOrNew([
                'product_id' => $product->id,
                'unit_price' => $unitPrice,
            ]);
            $item->quantity = ($item->exists ? (int) $item->quantity : 0) + $quantity;
            $item->product_name = $product->name;
            $item->product_category = ProductCategory::normalize($product->category);
            $item->total_price = ProductDeal::lineTotal($product, (int) $item->quantity);
            $item->unit_price = $unitPrice;
            $item->save();

            return $item;
        }

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
