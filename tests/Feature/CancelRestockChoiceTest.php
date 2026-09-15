<?php

use App\Models\BilliardTable;
use App\Models\CheckoutSession;
use App\Models\CheckoutSessionItem;
use App\Models\GameSession;
use App\Models\Product;
use App\Models\SessionItem;
use App\Models\User;

test('cancelling a table session can return products to stock', function () {
    $admin = User::factory()->create(['role' => 'admin']);
    $product = Product::create([
        'name' => 'Restock Cola',
        'price' => 5,
        'category' => 'Drinks',
        'stock_quantity' => 8,
        'low_stock_threshold' => 2,
        'is_active' => true,
    ]);
    $table = BilliardTable::create(['name' => 'Restock Table', 'status' => 'running']);
    $session = GameSession::create([
        'billiard_table_id' => $table->id,
        'user_id' => $admin->id,
        'status' => 'running',
        'started_at' => now()->subMinutes(5),
        'last_resume_at' => now()->subMinutes(5),
        'total_played_seconds' => 0,
        'time_total' => 0,
    ]);
    SessionItem::create([
        'game_session_id' => $session->id,
        'product_id' => $product->id,
        'product_name' => $product->name,
        'product_category' => $product->category,
        'quantity' => 2,
        'unit_price' => 5,
        'total_price' => 10,
    ]);

    $this->actingAs($admin)
        ->postJson(route('tables.cancel-session', $table), [
            'restock' => true,
        ])
        ->assertOk();

    expect($product->fresh()->stock_quantity)->toBe(10)
        ->and($session->fresh()->stock_restored)->toBeTrue();
});

test('cancelling a table session can keep products out of stock', function () {
    $admin = User::factory()->create(['role' => 'admin']);
    $product = Product::create([
        'name' => 'Consumed Chips',
        'price' => 4,
        'category' => 'Snacks',
        'stock_quantity' => 5,
        'low_stock_threshold' => 1,
        'is_active' => true,
    ]);
    $table = BilliardTable::create(['name' => 'No Restock Table', 'status' => 'running']);
    $session = GameSession::create([
        'billiard_table_id' => $table->id,
        'user_id' => $admin->id,
        'status' => 'running',
        'started_at' => now()->subMinutes(5),
        'last_resume_at' => now()->subMinutes(5),
        'total_played_seconds' => 0,
        'time_total' => 0,
    ]);
    SessionItem::create([
        'game_session_id' => $session->id,
        'product_id' => $product->id,
        'product_name' => $product->name,
        'product_category' => $product->category,
        'quantity' => 3,
        'unit_price' => 4,
        'total_price' => 12,
    ]);

    $this->actingAs($admin)
        ->postJson(route('tables.cancel-session', $table), [
            'restock' => false,
        ])
        ->assertOk();

    expect($product->fresh()->stock_quantity)->toBe(5)
        ->and($session->fresh()->stock_restored)->toBeFalse();
});

test('voiding a tab respects the restock choice when reopening', function () {
    $admin = User::factory()->create(['role' => 'admin']);
    $product = Product::create([
        'name' => 'Tab Drink',
        'price' => 6,
        'category' => 'Drinks',
        'stock_quantity' => 4,
        'low_stock_threshold' => 1,
        'is_active' => true,
    ]);
    $tab = CheckoutSession::create(['status' => CheckoutSession::STATUS_OPEN]);
    CheckoutSessionItem::create([
        'checkout_session_id' => $tab->id,
        'product_id' => $product->id,
        'product_name' => $product->name,
        'product_category' => $product->category,
        'quantity' => 2,
        'unit_price' => 6,
        'total_price' => 12,
    ]);

    $this->actingAs($admin)
        ->postJson(route('admin.checkouts.void', $tab), [
            'restock' => false,
        ])
        ->assertOk();

    expect($product->fresh()->stock_quantity)->toBe(4)
        ->and($tab->fresh()->stock_restored)->toBeFalse();

    $this->actingAs($admin)
        ->postJson(route('admin.checkouts.reopen', $tab))
        ->assertOk();

    expect($product->fresh()->stock_quantity)->toBe(4)
        ->and($tab->fresh()->status)->toBe('open');
});
