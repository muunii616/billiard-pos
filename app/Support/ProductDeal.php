<?php

namespace App\Support;

use App\Models\Product;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

final class ProductDeal
{
    public static function isDeal(Product $product): bool
    {
        return $product->deal_product_id !== null
            && (int) $product->deal_buy_qty >= 1
            && (int) $product->deal_get_qty >= 1;
    }

    public static function isActive(Product $product, ?CarbonInterface $asOf = null): bool
    {
        if (! self::isDeal($product) || ! $product->is_active) {
            return false;
        }

        $starts = $product->deal_starts_on;
        $ends = $product->deal_ends_on;
        if ($starts === null && $ends === null) {
            return true;
        }

        $timezone = (string) config('app.display_timezone', config('app.timezone', 'UTC'));
        $today = ($asOf instanceof CarbonInterface ? $asOf->copy() : ($asOf ? Carbon::parse($asOf) : now()))
            ->timezone($timezone)
            ->toDateString();

        if ($starts !== null && $today < $starts->toDateString()) {
            return false;
        }
        if ($ends !== null && $today > $ends->toDateString()) {
            return false;
        }

        return true;
    }

    public static function label(Product $product): ?string
    {
        if (! self::isDeal($product)) {
            return null;
        }

        return ((int) $product->deal_buy_qty).'+'.((int) $product->deal_get_qty);
    }

    public static function packageSize(Product $product): int
    {
        return max(0, (int) $product->deal_buy_qty + (int) $product->deal_get_qty);
    }

    /** Units charged (and line unit_price multiplier) per Special package. */
    public static function paidPerPackage(Product $product): int
    {
        return max(0, (int) $product->deal_buy_qty);
    }

    public static function stockUnitsForPackages(Product $product, int $packages): int
    {
        return abs($packages) * self::packageSize($product);
    }

    public static function unitPricePerPackage(Product $product): float
    {
        return round(self::paidPerPackage($product) * (float) $product->price, 2);
    }

    public static function lineTotal(Product $product, int $packages): float
    {
        return round(max(0, $packages) * self::unitPricePerPackage($product), 2);
    }

    public static function availablePackages(Product $product): int
    {
        if (! self::isDeal($product)) {
            return max(0, (int) $product->stock_quantity);
        }

        $base = $product->relationLoaded('dealProduct')
            ? $product->dealProduct
            : $product->dealProduct()->first();

        if (! $base) {
            return 0;
        }

        $size = self::packageSize($product);

        return $size > 0 ? intdiv(max(0, (int) $base->stock_quantity), $size) : 0;
    }

    /** Expand cart lines so inventory hits the base product for Special deals. */
    public static function expandInventoryLines(Collection|array $items): array
    {
        $expanded = [];

        foreach (collect($items) as $item) {
            $productId = data_get($item, 'product_id');
            $quantity = (int) data_get($item, 'quantity', 0);
            if ($productId === null || $quantity === 0) {
                continue;
            }

            $product = $item instanceof Product
                ? $item
                : Product::query()->find((int) $productId);

            if ($product && self::isDeal($product)) {
                $expanded[] = [
                    'product_id' => (int) $product->deal_product_id,
                    'quantity' => self::stockUnitsForPackages($product, abs($quantity)),
                ];

                continue;
            }

            $expanded[] = [
                'product_id' => (int) $productId,
                'quantity' => abs($quantity),
            ];
        }

        return $expanded;
    }

    public static function assertCanSell(Product $product, int $packages = 1): void
    {
        if (! self::isDeal($product)) {
            return;
        }

        if (! self::isActive($product)) {
            throw ValidationException::withMessages([
                'product' => sprintf(
                    '%s deal is not active%s.',
                    $product->name,
                    self::label($product) ? ' ('.self::label($product).')' : '',
                ),
            ]);
        }

        if ($packages < 1) {
            return;
        }

        $available = self::availablePackages($product);
        if ($available < $packages) {
            $baseName = $product->dealProduct?->name ?? 'linked product';
            throw ValidationException::withMessages([
                'inventory' => sprintf(
                    'Not enough stock for %s. Need %d %s for %d deal package(s); enough for %d.',
                    $product->name,
                    self::stockUnitsForPackages($product, $packages),
                    $baseName,
                    $packages,
                    $available,
                ),
            ]);
        }
    }

    /** @return array<string, mixed> */
    public static function posPayload(Product $product): array
    {
        $isDeal = self::isDeal($product);
        $active = $isDeal && self::isActive($product);

        return [
            'id' => $product->id,
            'name' => $product->name,
            'price' => (string) $product->price,
            'category' => ProductCategory::normalize((string) $product->category),
            'stock_quantity' => $isDeal ? self::availablePackages($product) : (int) $product->stock_quantity,
            'low_stock_threshold' => (int) $product->low_stock_threshold,
            'is_deal' => $isDeal,
            'deal_active' => $active,
            'deal_label' => self::label($product),
            'deal_product_id' => $product->deal_product_id,
            'deal_buy_qty' => $product->deal_buy_qty,
            'deal_get_qty' => $product->deal_get_qty,
            'deal_starts_on' => $product->deal_starts_on?->toDateString(),
            'deal_ends_on' => $product->deal_ends_on?->toDateString(),
        ];
    }
}
