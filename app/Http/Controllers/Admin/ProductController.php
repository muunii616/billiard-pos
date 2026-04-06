<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\BilliardTable;
use App\Models\CheckoutSession;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class ProductController extends Controller
{
    /** Canonicalize category for consistency while allowing custom categories. */
    private function normalizeCategory(string $category): string
    {
        $key = strtolower(trim($category));

        return match ($key) {
            'drink', 'drinks' => 'Drinks',
            'snack', 'snacks' => 'Snacks',
            'set', 'sets', 'combo', 'combos' => 'Sets',
            default => Str::of($category)->trim()->squish()->title()->toString(),
        };
    }

    public function index(): Response
    {
        $products = Product::orderBy('name')->get();
        $openCheckouts = CheckoutSession::with('gameSessions.table')
            ->where('status', 'open')
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
            ->whereIn('status', ['running', 'paused'])
            ->orderBy('name')
            ->get(['id', 'name', 'status']);

        return Inertia::render('admin/products', [
            'products' => $products,
            'openCheckouts' => $openCheckouts,
            'runningTables' => $runningTables,
            'isAdmin' => auth()->user()?->role === 'admin',
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'category' => ['required', 'string', 'max:255'],
            'price' => ['required', 'numeric', 'min:0'],
        ]);

        $data['category'] = $this->normalizeCategory((string) $data['category']);
        $data['is_active'] = true;

        Product::create($data);

        return redirect()->back();
    }

    public function update(Request $request, Product $product)
    {
        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'category' => ['sometimes', 'required', 'string', 'max:255'],
            'price' => ['sometimes', 'required', 'numeric', 'min:0'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        if (array_key_exists('category', $data)) {
            $data['category'] = $this->normalizeCategory((string) $data['category']);
        }

        $product->update($data);

        return redirect()->back();
    }

    public function destroy(Product $product)
    {
        $product->delete();

        return redirect()->back();
    }
}
