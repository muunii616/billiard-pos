<?php

use App\Models\Product;
use App\Models\User;

test('stock page shows inventory summary for authenticated staff', function () {
    $user = User::factory()->create(['role' => 'employee']);
    Product::create([
        'name' => 'Low Beer',
        'category' => 'Beer',
        'price' => 8000,
        'cost_price' => 4000,
        'stock_quantity' => 2,
        'low_stock_threshold' => 5,
        'is_active' => true,
    ]);
    Product::create([
        'name' => 'Empty Soda',
        'category' => 'Drinks',
        'price' => 3000,
        'cost_price' => 1000,
        'stock_quantity' => 0,
        'low_stock_threshold' => 5,
        'is_active' => true,
    ]);

    $this->actingAs($user)
        ->get(route('stock.index'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('stock/index')
            ->where('summary.low_count', 1)
            ->where('summary.out_count', 1)
            ->where('summary.sku_count', 2)
            ->has('products', 2)
            ->has('activity')
            ->has('users'));
});
