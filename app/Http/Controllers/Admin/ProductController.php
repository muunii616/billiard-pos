<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class ProductController extends Controller
{
    /** Canonical categories used by admin/products UI and checkout filters. */
    private function normalizeCategory(string $category): ?string
    {
        $key = strtolower(trim($category));

        return match ($key) {
            'drink', 'drinks' => 'Drinks',
            'snack', 'snacks' => 'Snacks',
            'set', 'sets', 'combo', 'combos' => 'Sets',
            default => null,
        };
    }

    public function index(): Response
    {
        $products = Product::orderBy('name')->get();

        return Inertia::render('admin/products', [
            'products' => $products,
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'category' => ['required', 'string', Rule::in(['Drinks', 'Snacks', 'Sets'])],
            'price' => ['required', 'numeric', 'min:0'],
        ]);

        $normalized = $this->normalizeCategory((string) $data['category']);
        if ($normalized === null) {
            return back()->withErrors(['category' => 'Category must be Drinks, Snacks, or Sets.']);
        }
        $data['category'] = $normalized;
        $data['is_active'] = true;

        Product::create($data);

        return redirect()->back();
    }

    public function update(Request $request, Product $product)
    {
        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'category' => ['sometimes', 'required', 'string', Rule::in(['Drinks', 'Snacks', 'Sets'])],
            'price' => ['sometimes', 'required', 'numeric', 'min:0'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        if (array_key_exists('category', $data)) {
            $normalized = $this->normalizeCategory((string) $data['category']);
            if ($normalized === null) {
                return back()->withErrors(['category' => 'Category must be Drinks, Snacks, or Sets.']);
            }
            $data['category'] = $normalized;
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
