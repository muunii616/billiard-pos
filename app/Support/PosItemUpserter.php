<?php

namespace App\Support;

use App\Models\CheckoutSession;
use App\Models\CheckoutSessionItem;
use App\Models\GameSession;
use App\Models\Product;
use App\Models\SessionItem;

final class PosItemUpserter
{
    public static function upsertSessionProduct(GameSession $session, Product $product, int $quantity, bool $increment = true): SessionItem
    {
        $item = SessionItem::firstOrNew([
            'game_session_id' => $session->id,
            'product_id' => $product->id,
        ]);

        $item->quantity = $increment
            ? (($item->exists ? (int) $item->quantity : 0) + $quantity)
            : $quantity;
        $item->product_name = $product->name;
        $item->product_category = $product->category;
        $item->unit_price = $product->price;
        $item->total_price = round((float) $item->quantity * (float) $item->unit_price, 2);
        $item->save();

        return $item;
    }

    public static function upsertCheckoutProduct(CheckoutSession $checkout, Product $product, int $quantity, bool $increment = true): CheckoutSessionItem
    {
        $item = $checkout->items()->firstOrNew(['product_id' => $product->id]);
        $item->quantity = $increment
            ? (($item->exists ? (int) $item->quantity : 0) + $quantity)
            : $quantity;
        $item->product_name = $product->name;
        $item->product_category = $product->category;
        $item->unit_price = $product->price;
        $item->total_price = round((float) $item->quantity * (float) $item->unit_price, 2);
        $item->save();

        return $item;
    }

    public static function createSessionManualItem(GameSession $session, string $name, ?string $category, int $quantity, float $unitPrice): SessionItem
    {
        return $session->items()->create([
            'product_id' => null,
            'product_name' => $name,
            'product_category' => $category ?: null,
            'quantity' => $quantity,
            'unit_price' => $unitPrice,
            'total_price' => round($quantity * $unitPrice, 2),
        ]);
    }

    public static function createCheckoutManualItem(CheckoutSession $checkout, string $name, ?string $category, int $quantity, float $unitPrice): CheckoutSessionItem
    {
        return $checkout->items()->create([
            'product_id' => null,
            'product_name' => $name,
            'product_category' => $category ?: null,
            'quantity' => $quantity,
            'unit_price' => $unitPrice,
            'total_price' => round($quantity * $unitPrice, 2),
        ]);
    }
}
