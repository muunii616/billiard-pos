<?php

use App\Models\BilliardTable;
use App\Models\CheckoutSession;
use App\Models\CheckoutSessionItem;
use App\Models\GameSession;
use App\Models\Product;
use App\Models\User;

test('table session can start pause and resume', function () {
    $user = User::factory()->create();
    $table = BilliardTable::create([
        'name' => 'Table 1',
        'status' => 'available',
    ]);

    $this->actingAs($user)
        ->post(route('tables.start', $table))
        ->assertRedirect();

    $table->refresh();
    expect($table->status)->toBe('running');

    $session = GameSession::query()->where('billiard_table_id', $table->id)->latest('id')->first();
    expect($session)->not->toBeNull();
    expect($session->status)->toBe('running');

    $this->actingAs($user)
        ->post(route('tables.pause', $table))
        ->assertRedirect();

    $table->refresh();
    $session->refresh();
    expect($table->status)->toBe('paused');
    expect($session->status)->toBe('paused');

    $this->actingAs($user)
        ->post(route('tables.resume', $table))
        ->assertRedirect();

    $table->refresh();
    $session->refresh();
    expect($table->status)->toBe('running');
    expect($session->status)->toBe('running');
});

test('products can be added into a new open tab', function () {
    $user = User::factory()->create();
    $product = Product::create([
        'name' => 'Cola',
        'category' => 'Drinks',
        'price' => 2.50,
        'is_active' => true,
    ]);

    $response = $this->actingAs($user)->postJson(route('checkouts.from-products'), [
        'items' => [
            ['product_id' => $product->id, 'quantity' => 2],
        ],
    ]);

    $response->assertOk()->assertJsonStructure(['checkout_id']);
    $checkoutId = (int) $response->json('checkout_id');

    $this->assertDatabaseHas('checkout_sessions', [
        'id' => $checkoutId,
        'status' => 'open',
    ]);

    $this->assertDatabaseHas('checkout_session_items', [
        'checkout_session_id' => $checkoutId,
        'product_id' => $product->id,
        'product_name' => 'Cola',
        'quantity' => 2,
    ]);
});

test('open tabs can be merged into a target tab', function () {
    $user = User::factory()->create();
    $table = BilliardTable::create([
        'name' => 'Table 2',
        'status' => 'available',
    ]);
    $product = Product::create([
        'name' => 'Chips',
        'category' => 'Snacks',
        'price' => 3.00,
        'is_active' => true,
    ]);

    $target = CheckoutSession::create(['status' => 'open']);
    $source = CheckoutSession::create(['status' => 'open']);

    CheckoutSessionItem::create([
        'checkout_session_id' => $target->id,
        'product_id' => $product->id,
        'product_name' => $product->name,
        'product_category' => $product->category,
        'quantity' => 1,
        'unit_price' => 3.00,
        'total_price' => 3.00,
    ]);

    CheckoutSessionItem::create([
        'checkout_session_id' => $source->id,
        'product_id' => $product->id,
        'product_name' => $product->name,
        'product_category' => $product->category,
        'quantity' => 2,
        'unit_price' => 3.00,
        'total_price' => 6.00,
    ]);

    $gameSession = GameSession::create([
        'billiard_table_id' => $table->id,
        'checkout_session_id' => $source->id,
        'user_id' => $user->id,
        'status' => 'completed',
        'started_at' => now()->subHour(),
        'ended_at' => now(),
        'total_minutes' => 60,
        'time_total' => 12.00,
    ]);

    $this->actingAs($user)
        ->post(route('checkouts.merge'), [
            'target_id' => $target->id,
            'source_ids' => [$source->id],
        ])
        ->assertRedirect(route('checkouts.index'));

    $source->refresh();
    $gameSession->refresh();
    expect($source->status)->toBe('merged');
    expect($gameSession->checkout_session_id)->toBe($target->id);

    $mergedItem = CheckoutSessionItem::query()
        ->where('checkout_session_id', $target->id)
        ->where('product_id', $product->id)
        ->first();

    expect($mergedItem)->not->toBeNull();
    expect($mergedItem->quantity)->toBe(3);
});
