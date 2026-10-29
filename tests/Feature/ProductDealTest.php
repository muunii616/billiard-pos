<?php

use App\Models\CheckoutSession;
use App\Models\CheckoutSessionItem;
use App\Models\Product;
use App\Models\User;

test('special 1+1 deal charges one and deducts two from base stock', function () {
    $admin = User::factory()->create(['role' => 'admin']);
    $base = Product::create([
        'name' => 'Altan Gobi',
        'category' => 'Beer',
        'price' => 10000,
        'cost_price' => 5000,
        'is_active' => true,
        'stock_quantity' => 20,
        'low_stock_threshold' => 2,
    ]);
    $deal = Product::create([
        'name' => 'Altan Gobi 1+1',
        'category' => 'Special',
        'price' => 10000,
        'cost_price' => 5000,
        'is_active' => true,
        'stock_quantity' => 0,
        'low_stock_threshold' => 2,
        'deal_product_id' => $base->id,
        'deal_buy_qty' => 1,
        'deal_get_qty' => 1,
    ]);

    $checkout = CheckoutSession::create(['status' => CheckoutSession::STATUS_OPEN]);

    $this->actingAs($admin)
        ->postJson(route('checkouts.items.bulk', $checkout), [
            'items' => [
                ['product_id' => $deal->id, 'quantity' => 1],
            ],
        ])
        ->assertRedirect();

    $line = CheckoutSessionItem::query()->where('checkout_session_id', $checkout->id)->first();
    expect($line)->not->toBeNull()
        ->and((int) $line->quantity)->toBe(1)
        ->and((float) $line->unit_price)->toBe(10000.0)
        ->and((float) $line->total_price)->toBe(10000.0)
        ->and($base->fresh()->stock_quantity)->toBe(18);
});

test('special 2+1 deal package charges two paid units', function (int $stock, int $packages) {
    $admin = User::factory()->create(['role' => 'admin']);
    $base = Product::create([
        'name' => 'Beer',
        'category' => 'Beer',
        'price' => 8000,
        'is_active' => true,
        'stock_quantity' => $stock,
        'low_stock_threshold' => 2,
    ]);
    $deal = Product::create([
        'name' => 'Beer 2+1',
        'category' => 'Special',
        'price' => 8000,
        'is_active' => true,
        'stock_quantity' => 0,
        'low_stock_threshold' => 2,
        'deal_product_id' => $base->id,
        'deal_buy_qty' => 2,
        'deal_get_qty' => 1,
    ]);

    $checkout = CheckoutSession::create(['status' => CheckoutSession::STATUS_OPEN]);

    $this->actingAs($admin)
        ->postJson(route('checkouts.items.bulk', $checkout), [
            'items' => [
                ['product_id' => $deal->id, 'quantity' => $packages],
            ],
        ])
        ->assertRedirect();

    $line = CheckoutSessionItem::query()->where('checkout_session_id', $checkout->id)->first();
    expect((int) $line->quantity)->toBe($packages)
        ->and((float) $line->total_price)->toBe(16000.0 * $packages)
        ->and($base->fresh()->stock_quantity)->toBe($stock - 3 * $packages);
})->with([
    'plentiful stock' => [30, 1],
    'last package' => [3, 1],
    'one spare unit' => [4, 1],
    'two spare units' => [5, 1],
    'last two packages' => [6, 2],
]);

test('special deal outside date range cannot be sold', function () {
    $admin = User::factory()->create(['role' => 'admin']);
    $base = Product::create([
        'name' => 'Cola',
        'category' => 'Drinks',
        'price' => 3000,
        'is_active' => true,
        'stock_quantity' => 10,
        'low_stock_threshold' => 1,
    ]);
    $deal = Product::create([
        'name' => 'Cola 1+1',
        'category' => 'Special',
        'price' => 3000,
        'is_active' => true,
        'stock_quantity' => 0,
        'low_stock_threshold' => 1,
        'deal_product_id' => $base->id,
        'deal_buy_qty' => 1,
        'deal_get_qty' => 1,
        'deal_starts_on' => now()->subDays(10)->toDateString(),
        'deal_ends_on' => now()->subDays(3)->toDateString(),
    ]);

    $checkout = CheckoutSession::create(['status' => CheckoutSession::STATUS_OPEN]);

    $this->actingAs($admin)
        ->postJson(route('checkouts.items.bulk', $checkout), [
            'items' => [
                ['product_id' => $deal->id, 'quantity' => 1],
            ],
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('product');

    expect($base->fresh()->stock_quantity)->toBe(10)
        ->and(CheckoutSessionItem::query()->where('checkout_session_id', $checkout->id)->count())->toBe(0);
});

test('admin can create a special deal product', function () {
    $admin = User::factory()->create(['role' => 'admin']);
    $base = Product::create([
        'name' => 'Altan Gobi',
        'category' => 'Beer',
        'price' => 10000,
        'is_active' => true,
        'stock_quantity' => 5,
        'low_stock_threshold' => 1,
    ]);

    $this->actingAs($admin)
        ->post(route('admin.products.store'), [
            'name' => 'Altan Gobi 1+1',
            'category' => 'Special',
            'price' => 10000,
            'is_deal' => true,
            'deal_product_id' => $base->id,
            'deal_buy_qty' => 1,
            'deal_get_qty' => 1,
            'deal_starts_on' => now()->toDateString(),
            'deal_ends_on' => now()->addDays(7)->toDateString(),
        ])
        ->assertRedirect();

    $this->assertDatabaseHas('products', [
        'name' => 'Altan Gobi 1+1',
        'category' => 'Special',
        'deal_product_id' => $base->id,
        'deal_buy_qty' => 1,
        'deal_get_qty' => 1,
    ]);
});

test('admin can create special deals for multiple products at once', function () {
    $admin = User::factory()->create(['role' => 'admin']);
    $beer = Product::create([
        'name' => 'Altan Gobi',
        'category' => 'Beer',
        'price' => 10000,
        'cost_price' => 5000,
        'is_active' => true,
        'stock_quantity' => 20,
        'low_stock_threshold' => 1,
    ]);
    $cola = Product::create([
        'name' => 'Cola',
        'category' => 'Drinks',
        'price' => 3000,
        'cost_price' => 1000,
        'is_active' => true,
        'stock_quantity' => 40,
        'low_stock_threshold' => 1,
    ]);

    $this->actingAs($admin)
        ->post(route('admin.products.store'), [
            'is_deal' => true,
            'category' => 'Special',
            'deal_product_ids' => [$beer->id, $cola->id],
            'deal_buy_qty' => 1,
            'deal_get_qty' => 1,
            'deal_starts_on' => null,
            'deal_ends_on' => null,
        ])
        ->assertRedirect(route('admin.products.index'));

    $this->assertDatabaseHas('products', [
        'name' => 'Altan Gobi 1+1',
        'category' => 'Special',
        'deal_product_id' => $beer->id,
        'deal_buy_qty' => 1,
        'deal_get_qty' => 1,
        'price' => 10000,
    ]);
    $this->assertDatabaseHas('products', [
        'name' => 'Cola 1+1',
        'category' => 'Special',
        'deal_product_id' => $cola->id,
        'deal_buy_qty' => 1,
        'deal_get_qty' => 1,
        'price' => 3000,
    ]);
    expect(Product::query()->whereNotNull('deal_product_id')->count())->toBe(2);
});

test('admin can create a normal product with empty optional cost and stock fields', function () {
    $admin = User::factory()->create(['role' => 'admin']);

    $this->actingAs($admin)
        ->post(route('admin.products.store'), [
            'name' => 'New Snack',
            'category' => 'Snacks',
            'price' => 2500,
            'cost_price' => null,
            'stock_quantity' => null,
            'low_stock_threshold' => null,
            'is_deal' => false,
            'deal_product_id' => null,
            'deal_buy_qty' => null,
            'deal_get_qty' => null,
            'deal_starts_on' => null,
            'deal_ends_on' => null,
        ])
        ->assertRedirect();

    $this->assertDatabaseHas('products', [
        'name' => 'New Snack',
        'category' => 'Snacks',
        'price' => 2500,
        'cost_price' => 0,
        'stock_quantity' => 0,
        'is_active' => 1,
        'deal_product_id' => null,
    ]);
});
