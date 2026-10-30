<?php

use App\Models\BilliardTable;
use App\Models\CheckoutSession;
use App\Models\GameSession;
use App\Models\Product;
use App\Models\User;

beforeEach(function () {
    $this->actingAs(User::factory()->create(['role' => 'admin']));
    $this->base = Product::create([
        'name' => 'Beer', 'category' => 'Beer', 'price' => 8000,
        'is_active' => true, 'stock_quantity' => 3,
    ]);
    $this->deal = Product::create([
        'name' => 'Beer 2+1', 'category' => 'Special', 'price' => 8000,
        'is_active' => true, 'stock_quantity' => 0,
        'deal_product_id' => $this->base->id, 'deal_buy_qty' => 2, 'deal_get_qty' => 1,
    ]);
});

test('the last deal package can be added through each sales flow', function (string $flow) {
    $line = ['product_id' => $this->deal->id, 'quantity' => 1];

    if ($flow === 'new tab') {
        $response = $this->postJson(route('checkouts.from-products'), ['items' => [$line]])->assertOk();
        $owner = CheckoutSession::findOrFail($response->json('checkout_id'));
    } elseif (str_starts_with($flow, 'table')) {
        $table = BilliardTable::create(['name' => 'Table 1', 'status' => 'available']);
        $this->post(route('tables.start', $table))->assertRedirect();
        $owner = GameSession::where('billiard_table_id', $table->id)->firstOrFail();
        if ($flow === 'table single') {
            $this->postJson(route('tables.items.add', $table), $line)->assertRedirect();
        } else {
            $this->postJson(route('tables.items.bulk', $table), ['items' => [$line]])->assertRedirect();
        }
    } else {
        $owner = CheckoutSession::create(['status' => CheckoutSession::STATUS_OPEN]);
        if ($flow === 'tab single') {
            $this->postJson(route('checkouts.items.add', $owner), $line)->assertRedirect();
        } else {
            $this->putJson(route('admin.checkouts.items.update', $owner), [
                'items' => [$line],
                'reason' => 'Test deal correction.',
            ])->assertOk();
        }
    }

    $item = $owner->items()->sole();
    expect((int) $item->quantity)->toBe(1)
        ->and((float) $item->unit_price)->toBe(16000.0)
        ->and((float) $item->total_price)->toBe(16000.0)
        ->and($this->base->fresh()->stock_quantity)->toBe(0)
        ->and($this->deal->fresh()->stock_quantity)->toBe(0);
})->with(['new tab', 'tab single', 'table single', 'table bulk', 'admin edit']);

test('regular items and deals share stock when bought together', function (int $stock, bool $canSell) {
    $this->base->update(['stock_quantity' => $stock]);
    $response = $this->postJson(route('checkouts.from-products'), [
        'items' => [
            ['product_id' => $this->base->id, 'quantity' => 1],
            ['product_id' => $this->deal->id, 'quantity' => 1],
        ],
    ]);

    if ($canSell) {
        $response->assertOk();
        $checkout = CheckoutSession::findOrFail($response->json('checkout_id'));
        expect($checkout->items()->count())->toBe(2)
            ->and((float) $checkout->items()->sum('total_price'))->toBe(24000.0)
            ->and($this->base->fresh()->stock_quantity)->toBe(0);
    } else {
        $response->assertUnprocessable()->assertJsonValidationErrors('inventory');
        expect(CheckoutSession::count())->toBe(0)
            ->and($this->base->fresh()->stock_quantity)->toBe($stock);
        $this->assertDatabaseCount('checkout_session_items', 0);
    }
})->with(['exact combined stock' => [4, true], 'combined shortage' => [3, false]]);

test('a deal with insufficient stock is rejected without creating a tab', function () {
    $this->base->update(['stock_quantity' => 2]);
    $this->postJson(route('checkouts.from-products'), [
        'items' => [['product_id' => $this->deal->id, 'quantity' => 1]],
    ])->assertUnprocessable()->assertJsonValidationErrors('inventory');

    expect($this->base->fresh()->stock_quantity)->toBe(2)
        ->and(CheckoutSession::count())->toBe(0);
    $this->assertDatabaseCount('checkout_session_items', 0);
});

test('editing deal quantities deducts only the increase and restores removed units', function () {
    $this->base->update(['stock_quantity' => 6]);
    $response = $this->postJson(route('checkouts.from-products'), [
        'items' => [['product_id' => $this->deal->id, 'quantity' => 1]],
    ])->assertOk();
    $checkout = CheckoutSession::findOrFail($response->json('checkout_id'));
    $item = $checkout->items()->sole();

    $this->putJson(route('admin.checkouts.items.update', $checkout), [
        'items' => [['id' => $item->id, 'quantity' => 2]],
        'reason' => 'Test deal correction.',
    ])->assertOk();
    expect($this->base->fresh()->stock_quantity)->toBe(0)
        ->and((float) $item->fresh()->total_price)->toBe(32000.0);

    $this->putJson(route('admin.checkouts.items.update', $checkout), [
        'items' => [['id' => $item->id, 'quantity' => 1]],
        'reason' => 'Test deal correction.',
    ])->assertOk();
    expect($this->base->fresh()->stock_quantity)->toBe(3)
        ->and((float) $item->fresh()->total_price)->toBe(16000.0);
});

test('four beers cannot supply two 2+1 packages in any sales flow', function (string $flow) {
    $this->base->update(['stock_quantity' => 4]);
    $line = ['product_id' => $this->deal->id, 'quantity' => 2];
    $owner = null;

    if ($flow === 'new tab') {
        $response = $this->postJson(route('checkouts.from-products'), ['items' => [$line]]);
    } elseif (str_starts_with($flow, 'table')) {
        $table = BilliardTable::create(['name' => 'Table 1', 'status' => 'available']);
        $this->post(route('tables.start', $table))->assertRedirect();
        $owner = GameSession::where('billiard_table_id', $table->id)->firstOrFail();
        $response = match ($flow) {
            'table single' => $this->postJson(route('tables.items.add', $table), $line),
            'table bulk' => $this->postJson(route('tables.items.bulk', $table), ['items' => [$line]]),
            default => $this->putJson(route('admin.tables.session-items.update', $table), [
                'items' => [$line],
                'reason' => 'Test deal correction.',
            ]),
        };
    } else {
        $owner = CheckoutSession::create(['status' => CheckoutSession::STATUS_OPEN]);
        $response = match ($flow) {
            'tab single' => $this->postJson(route('checkouts.items.add', $owner), $line),
            'tab bulk' => $this->postJson(route('checkouts.items.bulk', $owner), ['items' => [$line]]),
            default => $this->putJson(route('admin.checkouts.items.update', $owner), [
                'items' => [$line],
                'reason' => 'Test deal correction.',
            ]),
        };
    }

    $response->assertUnprocessable()->assertJsonValidationErrors('inventory');
    expect($this->base->fresh()->stock_quantity)->toBe(4);
    if ($owner) {
        expect($owner->items()->count())->toBe(0);
    } else {
        expect(CheckoutSession::count())->toBe(0);
    }
})->with(['new tab', 'tab single', 'tab bulk', 'admin edit', 'table single', 'table bulk', 'table edit']);

test('four beers allow one package but reject adding another afterwards', function () {
    $this->base->update(['stock_quantity' => 4]);
    $response = $this->postJson(route('checkouts.from-products'), [
        'items' => [['product_id' => $this->deal->id, 'quantity' => 1]],
    ])->assertOk();
    $checkout = CheckoutSession::findOrFail($response->json('checkout_id'));
    expect($this->base->fresh()->stock_quantity)->toBe(1);

    $this->postJson(route('checkouts.items.bulk', $checkout), [
        'items' => [['product_id' => $this->deal->id, 'quantity' => 1]],
    ])->assertUnprocessable()->assertJsonValidationErrors('inventory');
    expect($this->base->fresh()->stock_quantity)->toBe(1)
        ->and((int) $checkout->items()->sole()->quantity)->toBe(1);
});
