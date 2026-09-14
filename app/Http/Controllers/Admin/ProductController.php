<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\BilliardTable;
use App\Models\CheckoutSession;
use App\Models\Product;
use App\Models\StockAdjustment;
use App\Models\StockUsage;
use App\Models\User;
use App\Support\ProductCategory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class ProductController extends Controller
{
    public function index(): Response
    {
        $products = Product::orderBy('name')->get();
        $openCheckouts = CheckoutSession::with('gameSessions.table')
            ->open()
            ->orderByDesc('id')
            ->get()
            ->map(function (CheckoutSession $checkout) {
                $tableNames = $checkout->gameSessions
                    ->map(fn ($session) => $session->table->name ?? 'Table')
                    ->unique()
                    ->values()
                    ->all();

                return [
                    'id' => $checkout->id,
                    'label' => 'Tab #'.$checkout->id.' - '.(empty($tableNames) ? 'No tables yet' : implode(', ', $tableNames)),
                ];
            })
            ->values();

        $runningTables = BilliardTable::query()
            ->whereIn('status', BilliardTable::activeSessionStatuses())
            ->orderBy('name')
            ->get(['id', 'name', 'status']);

        return Inertia::render('admin/products', [
            'products' => $products,
            'openCheckouts' => $openCheckouts,
            'runningTables' => $runningTables,
            'isAdmin' => auth()->user()?->role === 'admin',
            'users' => User::query()->orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'category' => ['required', 'string', 'max:255'],
            'price' => ['required', 'numeric', 'min:0'],
            'cost_price' => ['sometimes', 'numeric', 'min:0'],
            'stock_quantity' => ['sometimes', 'integer', 'min:0'],
            'low_stock_threshold' => ['sometimes', 'integer', 'min:0'],
        ]);

        $data['category'] = ProductCategory::normalize((string) $data['category']);
        $data['is_active'] = true;
        $data['stock_quantity'] = (int) ($data['stock_quantity'] ?? 0);
        $data['low_stock_threshold'] = (int) ($data['low_stock_threshold'] ?? 5);
        $data['cost_price'] = (float) ($data['cost_price'] ?? 0);

        Product::create($data);

        return redirect()->back();
    }

    public function update(Request $request, Product $product)
    {
        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'category' => ['sometimes', 'required', 'string', 'max:255'],
            'price' => ['sometimes', 'required', 'numeric', 'min:0'],
            'cost_price' => ['sometimes', 'required', 'numeric', 'min:0'],
            'is_active' => ['sometimes', 'boolean'],
            'low_stock_threshold' => ['sometimes', 'required', 'integer', 'min:0'],
        ]);

        if (array_key_exists('category', $data)) {
            $data['category'] = ProductCategory::normalize((string) $data['category']);
        }

        $product->update($data);

        return redirect()->back();
    }

    public function destroy(Product $product)
    {
        $product->delete();

        return redirect()->back();
    }

    public function adjustStock(Request $request)
    {
        $data = $request->validate([
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'integer', 'exists:products,id'],
            'items.*.quantity' => ['required', 'integer', 'not_in:0'],
        ]);

        if ($request->user()?->role !== 'admin' && collect($data['items'])->contains(fn ($item) => (int) $item['quantity'] < 0)) {
            return back()->withErrors(['inventory' => 'Only administrators can decrease stock.']);
        }

        DB::transaction(function () use ($data, $request) {
            foreach ($data['items'] as $item) {
                $product = Product::query()->lockForUpdate()->findOrFail($item['product_id']);
                $next = $product->stock_quantity + (int) $item['quantity'];
                if ($next < 0) {
                    abort(422, "Stock for {$product->name} cannot become negative.");
                }
                $product->update(['stock_quantity' => $next]);
                StockAdjustment::create([
                    'product_id' => $product->id,
                    'user_id' => $request->user()->id,
                    'quantity_change' => (int) $item['quantity'],
                    'stock_after' => $next,
                    'adjusted_at' => now(),
                ]);
            }
        });

        return back()->with('message', 'Stock updated successfully.');
    }

    public function recordExternalUse(Request $request)
    {
        $data = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'integer', 'exists:products,id'],
            'items.*.quantity' => ['required', 'integer', 'min:1'],
            'note' => ['nullable', 'string', 'max:2000'],
        ]);

        DB::transaction(function () use ($data) {
            foreach ($data['items'] as $item) {
                $product = Product::query()->lockForUpdate()->findOrFail($item['product_id']);
                $quantity = (int) $item['quantity'];
                if ($product->stock_quantity < $quantity) {
                    throw ValidationException::withMessages(['inventory' => "Not enough stock for {$product->name}. Available: {$product->stock_quantity}."]);
                }
                $product->decrement('stock_quantity', $quantity);
                StockUsage::create([
                    'product_id' => $product->id,
                    'user_id' => $data['user_id'],
                    'quantity' => $quantity,
                    'unit_cost' => (float) $product->cost_price,
                    'total_cost' => $quantity * (float) $product->cost_price,
                    'note' => $data['note'] ?? null,
                    'used_at' => now(),
                ]);
            }
        });

        return back()->with('message', 'External use recorded.');
    }
}
