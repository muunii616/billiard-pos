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
use App\Support\ProductDeal;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class ProductController extends Controller
{
    public function index(): Response
    {
        $products = Product::query()
            ->with('dealProduct:id,name,stock_quantity')
            ->orderBy('name')
            ->get()
            ->map(function (Product $product) {
                $payload = $product->toArray();
                $payload['category'] = ProductCategory::normalize((string) $product->category);
                $payload['is_deal'] = ProductDeal::isDeal($product);
                $payload['deal_active'] = ProductDeal::isActive($product);
                $payload['deal_label'] = ProductDeal::label($product);
                $payload['deal_starts_on'] = $product->deal_starts_on?->toDateString();
                $payload['deal_ends_on'] = $product->deal_ends_on?->toDateString();
                $payload['deal_product_name'] = $product->dealProduct?->name;
                if (ProductDeal::isDeal($product)) {
                    $payload['stock_quantity'] = ProductDeal::availablePackages($product);
                }

                return $payload;
            });

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

        $dealBaseProducts = Product::query()
            ->where('is_active', true)
            ->whereNull('deal_product_id')
            ->orderBy('name')
            ->get(['id', 'name', 'price', 'cost_price', 'category']);

        return Inertia::render('admin/products', [
            'products' => $products,
            'dealBaseProducts' => $dealBaseProducts,
            'openCheckouts' => $openCheckouts,
            'runningTables' => $runningTables,
            'isAdmin' => auth()->user()?->role === 'admin',
            'users' => User::query()->orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function store(Request $request)
    {
        $dealIds = collect($request->input('deal_product_ids', []))
            ->filter(fn ($id) => $id !== null && $id !== '')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();

        $isDeal = $request->boolean('is_deal')
            || $dealIds->isNotEmpty()
            || $request->filled('deal_product_id')
            || strtolower((string) $request->input('category')) === 'special';

        if ($isDeal && $dealIds->count() > 1) {
            $created = $this->createDealProducts($request, $dealIds->all());

            return redirect()
                ->route('admin.products.index')
                ->with('message', $created.' Special deals created.');
        }

        if ($isDeal && $dealIds->count() === 1 && ! $request->filled('deal_product_id')) {
            $request->merge(['deal_product_id' => $dealIds->first()]);
        }

        $data = $this->validatedProduct($request);
        $product = Product::create($data);
        if ($product->deal_product_id === null && (int) $product->stock_quantity > 0 && $request->user()) {
            StockAdjustment::create([
                'product_id' => $product->id,
                'user_id' => $request->user()->id,
                'quantity_change' => (int) $product->stock_quantity,
                'stock_after' => (int) $product->stock_quantity,
                'note' => 'Initial stock',
                'adjusted_at' => $product->created_at ?? now(),
            ]);
        }

        return redirect()->route('admin.products.index');
    }

    public function update(Request $request, Product $product)
    {
        $data = $this->validatedProduct($request, $product);
        $product->update($data);

        return redirect()->route('admin.products.index');
    }

    public function destroy(Product $product)
    {
        $product->update(['is_active' => false]);

        return redirect()->route('admin.products.index');
    }

    public function adjustStock(Request $request)
    {
        $data = $request->validate([
            'reason' => ['required', 'string', 'max:2000'],
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
                if (ProductDeal::isDeal($product)) {
                    throw ValidationException::withMessages([
                        'inventory' => 'Adjust stock on the base product, not the Special deal.',
                    ]);
                }
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
                    'note' => $data['reason'],
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
            'note' => ['required', 'string', 'max:2000'],
        ]);

        DB::transaction(function () use ($data) {
            foreach ($data['items'] as $item) {
                $product = Product::query()->lockForUpdate()->findOrFail($item['product_id']);
                if (ProductDeal::isDeal($product)) {
                    throw ValidationException::withMessages([
                        'inventory' => 'Record external use on the base product, not the Special deal.',
                    ]);
                }
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

    /**
     * Create one Special deal SKU per base product (same ratio + dates).
     *
     * @param  list<int>  $dealProductIds
     */
    private function createDealProducts(Request $request, array $dealProductIds): int
    {
        $data = $request->validate([
            'deal_buy_qty' => ['required', 'integer', 'min:1', 'max:10'],
            'deal_get_qty' => ['required', 'integer', 'min:1', 'max:10'],
            'deal_starts_on' => ['nullable', 'date'],
            'deal_ends_on' => ['nullable', 'date', 'after_or_equal:deal_starts_on'],
            'deal_product_ids' => ['required', 'array', 'min:1'],
            'deal_product_ids.*' => ['integer', 'exists:products,id'],
        ]);

        $starts = $data['deal_starts_on'] ?? null;
        $ends = $data['deal_ends_on'] ?? null;
        if (($starts && ! $ends) || (! $starts && $ends)) {
            throw ValidationException::withMessages([
                'deal_starts_on' => 'Set both start and end dates, or leave both empty.',
            ]);
        }

        $buy = (int) $data['deal_buy_qty'];
        $get = (int) $data['deal_get_qty'];
        $created = 0;

        DB::transaction(function () use ($dealProductIds, $buy, $get, $starts, $ends, &$created) {
            foreach ($dealProductIds as $baseId) {
                $base = Product::query()->lockForUpdate()->findOrFail($baseId);
                if (ProductDeal::isDeal($base)) {
                    throw ValidationException::withMessages([
                        'deal_product_ids' => 'Choose normal products, not other Special deals.',
                    ]);
                }

                Product::create([
                    'name' => trim($base->name.' '.$buy.'+'.$get),
                    'category' => 'Special',
                    'price' => (float) $base->price,
                    'cost_price' => (float) ($base->cost_price ?? 0),
                    'is_active' => true,
                    'stock_quantity' => 0,
                    'low_stock_threshold' => 5,
                    'deal_product_id' => $base->id,
                    'deal_buy_qty' => $buy,
                    'deal_get_qty' => $get,
                    'deal_starts_on' => $starts,
                    'deal_ends_on' => $ends,
                ]);
                $created++;
            }
        });

        return $created;
    }

    /** @return array<string, mixed> */
    private function validatedProduct(Request $request, ?Product $existing = null): array
    {
        $isDeal = $request->boolean('is_deal')
            || $request->filled('deal_product_id')
            || strtolower((string) $request->input('category')) === 'special';

        $data = $request->validate([
            'name' => [$existing ? 'sometimes' : 'required', 'string', 'max:255'],
            'category' => [$existing ? 'sometimes' : 'required', 'string', 'max:255'],
            'price' => [$existing ? 'sometimes' : 'required', 'numeric', 'min:0'],
            // Empty UI fields become null via ConvertEmptyStringsToNull — keep them optional.
            'cost_price' => ['nullable', 'numeric', 'min:0'],
            'stock_quantity' => ['nullable', 'integer', 'min:0'],
            'low_stock_threshold' => ['nullable', 'integer', 'min:0'],
            'is_active' => ['sometimes', 'boolean'],
            'is_deal' => ['sometimes', 'boolean'],
            'deal_product_id' => [
                Rule::requiredIf($isDeal && ! $existing),
                'nullable',
                'integer',
                'exists:products,id',
                Rule::notIn(array_filter([$existing?->id])),
            ],
            'deal_buy_qty' => [Rule::requiredIf($isDeal), 'nullable', 'integer', 'min:1', 'max:10'],
            'deal_get_qty' => [Rule::requiredIf($isDeal), 'nullable', 'integer', 'min:1', 'max:10'],
            'deal_starts_on' => ['nullable', 'date'],
            'deal_ends_on' => ['nullable', 'date', 'after_or_equal:deal_starts_on'],
        ]);

        if ($isDeal) {
            $base = Product::query()->findOrFail((int) ($data['deal_product_id'] ?? $existing?->deal_product_id));
            if (ProductDeal::isDeal($base)) {
                throw ValidationException::withMessages([
                    'deal_product_id' => 'Choose a normal product, not another Special deal.',
                ]);
            }

            $buy = (int) ($data['deal_buy_qty'] ?? $existing?->deal_buy_qty ?? 0);
            $get = (int) ($data['deal_get_qty'] ?? $existing?->deal_get_qty ?? 0);
            $data['category'] = 'Special';
            $data['deal_product_id'] = $base->id;
            $data['deal_buy_qty'] = $buy;
            $data['deal_get_qty'] = $get;
            $data['stock_quantity'] = 0;
            $data['cost_price'] = (float) ($data['cost_price'] ?? $base->cost_price ?? 0);
            if (! array_key_exists('price', $data) || $data['price'] === null || $data['price'] === '') {
                $data['price'] = (float) $base->price;
            }
            if (empty($data['name'])) {
                $data['name'] = trim($base->name.' '.$buy.'+'.$get);
            }
            $data['deal_starts_on'] = $data['deal_starts_on'] ?? null;
            $data['deal_ends_on'] = $data['deal_ends_on'] ?? null;
            if (($data['deal_starts_on'] && ! $data['deal_ends_on']) || (! $data['deal_starts_on'] && $data['deal_ends_on'])) {
                throw ValidationException::withMessages([
                    'deal_starts_on' => 'Set both start and end dates, or leave both empty.',
                ]);
            }
        } else {
            $data['category'] = ProductCategory::normalize((string) ($data['category'] ?? $existing?->category ?? 'Other'));
            $data['deal_product_id'] = null;
            $data['deal_buy_qty'] = null;
            $data['deal_get_qty'] = null;
            $data['deal_starts_on'] = null;
            $data['deal_ends_on'] = null;
            if (! $existing) {
                $data['stock_quantity'] = (int) ($data['stock_quantity'] ?? 0);
            } else {
                unset($data['stock_quantity']);
            }
            $data['cost_price'] = (float) ($data['cost_price'] ?? $existing?->cost_price ?? 0);
        }

        $data['category'] = ProductCategory::normalize((string) $data['category']);
        if (! $existing) {
            $data['is_active'] = true;
            $data['low_stock_threshold'] = (int) ($data['low_stock_threshold'] ?? 5);
        } elseif (array_key_exists('low_stock_threshold', $data)) {
            $data['low_stock_threshold'] = (int) $data['low_stock_threshold'];
        }

        unset($data['is_deal']);

        return $data;
    }
}
