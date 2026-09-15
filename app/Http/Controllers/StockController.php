<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\StockAdjustment;
use App\Models\StockUsage;
use App\Models\User;
use App\Support\ProductCategory;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class StockController extends Controller
{
    public function index(Request $request): Response
    {
        $products = Product::query()
            ->orderBy('name')
            ->get()
            ->map(function (Product $product) {
                $qty = (int) $product->stock_quantity;
                $threshold = (int) $product->low_stock_threshold;
                $status = $qty <= 0 ? 'out' : ($qty <= $threshold ? 'low' : 'ok');

                return [
                    'id' => $product->id,
                    'name' => $product->name,
                    'category' => ProductCategory::normalize((string) $product->category),
                    'price' => (float) $product->price,
                    'cost_price' => (float) $product->cost_price,
                    'stock_quantity' => $qty,
                    'low_stock_threshold' => $threshold,
                    'is_active' => (bool) $product->is_active,
                    'status' => $status,
                    'value_at_cost' => round($qty * (float) $product->cost_price, 2),
                ];
            })
            ->values()
            ->all();

        $skuCount = count($products);
        $lowCount = collect($products)->where('status', 'low')->count();
        $outCount = collect($products)->where('status', 'out')->count();
        $okCount = collect($products)->where('status', 'ok')->count();
        $inventoryValue = round(collect($products)->sum('value_at_cost'), 2);
        $unitsOnHand = (int) collect($products)->sum('stock_quantity');

        $recentAdjustments = StockAdjustment::query()
            ->with(['product:id,name', 'user:id,name'])
            ->orderByDesc('adjusted_at')
            ->orderByDesc('id')
            ->limit(20)
            ->get()
            ->map(fn (StockAdjustment $row) => [
                'id' => $row->id,
                'kind' => 'adjustment',
                'product_name' => $row->product?->name ?? 'Deleted product',
                'user_name' => $row->user?->name ?? 'Unknown',
                'quantity' => (int) $row->quantity_change,
                'stock_after' => (int) $row->stock_after,
                'note' => $row->note,
                'at' => $row->adjusted_at?->toIso8601String(),
            ])
            ->all();

        $recentUsage = StockUsage::query()
            ->with(['product:id,name', 'user:id,name'])
            ->orderByDesc('used_at')
            ->orderByDesc('id')
            ->limit(20)
            ->get()
            ->map(fn (StockUsage $row) => [
                'id' => $row->id,
                'kind' => 'external',
                'product_name' => $row->product?->name ?? 'Deleted product',
                'user_name' => $row->user?->name ?? 'Unknown',
                'quantity' => -1 * (int) $row->quantity,
                'stock_after' => null,
                'note' => $row->note,
                'at' => $row->used_at?->toIso8601String(),
            ])
            ->all();

        $activity = collect($recentAdjustments)
            ->concat($recentUsage)
            ->sortByDesc(fn (array $row) => $row['at'] ?? '')
            ->take(25)
            ->values()
            ->all();

        return Inertia::render('stock/index', [
            'products' => $products,
            'summary' => [
                'sku_count' => $skuCount,
                'units_on_hand' => $unitsOnHand,
                'ok_count' => $okCount,
                'low_count' => $lowCount,
                'out_count' => $outCount,
                'inventory_value' => $inventoryValue,
            ],
            'activity' => $activity,
            'users' => User::query()->orderBy('name')->get(['id', 'name']),
            'isAdmin' => $request->user()?->role === 'admin',
        ]);
    }
}
