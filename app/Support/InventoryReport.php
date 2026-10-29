<?php

namespace App\Support;

use App\Models\CheckoutSession;
use App\Models\GameSession;
use App\Models\Product;
use App\Models\StockAdjustment;
use App\Models\StockUsage;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

final class InventoryReport
{
    /**
     * @return array{
     *     rows: list<array<string, int|string>>,
     *     initials: list<array<string, mixed>>,
     *     adjustments: Collection,
     *     external: Collection,
     *     totals: array<string, int>,
     *     closing_label: string
     * }
     */
    public static function build(CarbonInterface $start, CarbonInterface $end): array
    {
        $from = $start->copy()->utc();
        $to = $end->copy()->utc();
        $products = Product::query()->get()->keyBy('id');
        $events = [];

        $push = function (int $productId, CarbonInterface $at, int $qty, string $kind) use (&$events): void {
            if ($productId < 1 || $qty === 0) {
                return;
            }
            $events[] = [
                'product_id' => $productId,
                'at' => $at->copy()->utc(),
                'qty' => $qty,
                'kind' => $kind,
            ];
        };

        $adjustments = StockAdjustment::query()
            ->with(['product:id,name', 'user:id,name'])
            ->orderBy('adjusted_at')
            ->get();
        $adjustmentSum = [];
        foreach ($adjustments as $adjustment) {
            $change = (int) $adjustment->quantity_change;
            $isInitial = strcasecmp((string) $adjustment->note, 'Initial stock') === 0;
            $push((int) $adjustment->product_id, $adjustment->adjusted_at ?? $adjustment->created_at, $change, $isInitial ? 'initial' : ($change > 0 ? 'added' : 'removed'));
            $adjustmentSum[$adjustment->product_id] = ($adjustmentSum[$adjustment->product_id] ?? 0) + $change;
        }

        $usages = StockUsage::query()
            ->with(['product:id,name', 'user:id,name'])
            ->orderBy('used_at')
            ->get();
        $usageSum = [];
        foreach ($usages as $usage) {
            $qty = (int) $usage->quantity;
            $push((int) $usage->product_id, $usage->used_at ?? $usage->created_at, -$qty, 'external');
            $usageSum[$usage->product_id] = ($usageSum[$usage->product_id] ?? 0) + $qty;
        }

        $stillOut = [];
        $sessions = GameSession::query()->with(['items', 'checkoutSession:id,status,completed_at,stock_restored'])->get();
        foreach ($sessions as $session) {
            $restoreAt = self::sessionRestoreAt($session);
            foreach ($session->items as $item) {
                $expanded = self::expand($products->get($item->product_id), (int) $item->quantity);
                if (! $expanded) {
                    continue;
                }
                $push($expanded['product_id'], $item->created_at ?? $session->created_at, -$expanded['units'], 'taken');
                if ($restoreAt) {
                    $push($expanded['product_id'], $restoreAt, $expanded['units'], 'returned');
                } else {
                    $stillOut[$expanded['product_id']] = ($stillOut[$expanded['product_id']] ?? 0) + $expanded['units'];
                }
            }
        }

        $checkouts = CheckoutSession::query()->with('items')->get();
        foreach ($checkouts as $checkout) {
            $restoreAt = $checkout->status === 'voided' && $checkout->stock_restored === true
                ? $checkout->completed_at
                : null;
            foreach ($checkout->items as $item) {
                $expanded = self::expand($products->get($item->product_id), (int) $item->quantity);
                if (! $expanded) {
                    continue;
                }
                $push($expanded['product_id'], $item->created_at ?? $checkout->created_at, -$expanded['units'], 'taken');
                if ($restoreAt) {
                    $push($expanded['product_id'], $restoreAt, $expanded['units'], 'returned');
                } else {
                    $stillOut[$expanded['product_id']] = ($stillOut[$expanded['product_id']] ?? 0) + $expanded['units'];
                }
            }
        }

        foreach ($products as $product) {
            if ($product->deal_product_id !== null) {
                continue;
            }
            $implied = (int) $product->stock_quantity
                - (int) ($adjustmentSum[$product->id] ?? 0)
                + (int) ($usageSum[$product->id] ?? 0)
                + (int) ($stillOut[$product->id] ?? 0);
            if ($implied !== 0) {
                $push($product->id, $product->created_at, $implied, 'initial');
            }
        }

        $buckets = [];
        $blank = [
            'at_start' => 0,
            'initial' => 0,
            'added' => 0,
            'taken' => 0,
            'external' => 0,
            'removed' => 0,
            'returned' => 0,
            'at_end' => 0,
        ];
        foreach ($events as $event) {
            $id = $event['product_id'];
            $buckets[$id] ??= $blank;
            $at = $event['at'];
            if ($at->lt($from)) {
                $buckets[$id]['at_start'] += $event['qty'];
            }
            if ($at->lte($to)) {
                $buckets[$id]['at_end'] += $event['qty'];
            }
            if ($at->lt($from) || $at->gt($to)) {
                continue;
            }
            $qty = $event['qty'];
            match ($event['kind']) {
                'initial' => $buckets[$id]['initial'] += $qty,
                'added' => $buckets[$id]['added'] += $qty,
                'removed' => $buckets[$id]['removed'] += abs($qty),
                'taken' => $buckets[$id]['taken'] += abs($qty),
                'external' => $buckets[$id]['external'] += abs($qty),
                'returned' => $buckets[$id]['returned'] += $qty,
                default => null,
            };
        }

        $closingLabel = now()->between($from, $to) ? 'On hand' : 'At end';
        $rows = collect($buckets)->map(function (array $row, int $id) use ($products) {
            $row['name'] = $products->get($id)?->name ?? 'Deleted product';
            $row['change'] = $row['at_end'] - $row['at_start'];

            return $row;
        })->filter(fn (array $row) => $row['at_start'] !== 0
            || $row['at_end'] !== 0
            || $row['initial'] !== 0
            || $row['added'] !== 0
            || $row['taken'] !== 0
            || $row['external'] !== 0
            || $row['removed'] !== 0
            || $row['returned'] !== 0)
            ->sortBy('name', SORT_NATURAL | SORT_FLAG_CASE)
            ->values();

        $initials = collect($events)
            ->filter(fn (array $event) => $event['kind'] === 'initial' && $event['at']->between($from, $to))
            ->map(fn (array $event) => [
                'name' => $products->get($event['product_id'])?->name ?? 'Deleted product',
                'qty' => $event['qty'],
                'at' => $event['at'],
            ])
            ->sortBy('name', SORT_NATURAL | SORT_FLAG_CASE)
            ->values()
            ->all();

        $sum = fn (string $key) => (int) $rows->sum($key);

        return [
            'rows' => $rows->all(),
            'initials' => $initials,
            'adjustments' => $adjustments->filter(fn (StockAdjustment $row) => ($row->adjusted_at ?? $row->created_at)?->between($from, $to) && strcasecmp((string) $row->note, 'Initial stock') !== 0)->values(),
            'external' => $usages->filter(fn (StockUsage $row) => ($row->used_at ?? $row->created_at)?->between($from, $to))->values(),
            'totals' => [
                'at_start' => $sum('at_start'),
                'initial' => $sum('initial'),
                'added' => $sum('added'),
                'taken' => $sum('taken'),
                'external' => $sum('external'),
                'removed' => $sum('removed'),
                'returned' => $sum('returned'),
                'at_end' => $sum('at_end'),
                'change' => $sum('change'),
            ],
            'closing_label' => $closingLabel,
        ];
    }

    private static function sessionRestoreAt(GameSession $session): ?CarbonInterface
    {
        $checkout = $session->checkoutSession;
        if ($checkout && $checkout->status === 'voided' && $checkout->stock_restored === true && $checkout->completed_at) {
            return $checkout->completed_at;
        }
        if ($session->status === 'cancelled' && $session->stock_restored === true && $session->ended_at) {
            return $session->ended_at;
        }

        return null;
    }

    /** @return array{product_id: int, units: int}|null */
    private static function expand(?Product $product, int $packages): ?array
    {
        if (! $product || $packages < 1) {
            return null;
        }
        if (ProductDeal::isDeal($product)) {
            return [
                'product_id' => (int) $product->deal_product_id,
                'units' => ProductDeal::stockUnitsForPackages($product, $packages),
            ];
        }

        return [
            'product_id' => $product->id,
            'units' => $packages,
        ];
    }
}
