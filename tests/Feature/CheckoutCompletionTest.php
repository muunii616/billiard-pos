<?php

use App\Models\BilliardTable;
use App\Models\GameSession;
use App\Models\Product;
use App\Models\Receipt;
use App\Models\User;

test('checkout completion allows overpaid cash and stores payment rows', function () {
    $user = User::factory()->create();
    $product = Product::create([
        'name' => 'Orange Juice',
        'category' => 'Drinks',
        'price' => 3500,
        'is_active' => true,
    ]);

    $created = $this->actingAs($user)->postJson(route('checkouts.from-products'), [
        'items' => [
            ['product_id' => $product->id, 'quantity' => 2], // grand total = 7000
        ],
    ])->assertOk();

    $checkoutId = (int) $created->json('checkout_id');

    $this->actingAs($user)
        ->postJson(route('checkouts.complete', $checkoutId), [
            'payments' => [
                ['method' => 'cash', 'amount' => 10000], // overpaid cash should be allowed
            ],
        ])
        ->assertOk()
        ->assertJsonPath('message', 'Payment completed.');

    $this->assertDatabaseHas('checkout_sessions', [
        'id' => $checkoutId,
        'status' => 'completed',
    ]);

    $receipt = Receipt::query()->where('checkout_session_id', $checkoutId)->first();
    expect($receipt)->not->toBeNull();
    expect((float) $receipt->grand_total)->toBe(7000.0);

    $this->assertDatabaseHas('receipt_payments', [
        'receipt_id' => $receipt->id,
        'method' => 'cash',
        'amount' => 7000,
    ]);
});

test('table end allows overpaid cash and stores retained amount', function () {
    $user = User::factory()->create();
    $table = BilliardTable::create([
        'name' => 'Cash Change Table',
        'status' => 'paused',
    ]);

    $session = GameSession::create([
        'billiard_table_id' => $table->id,
        'user_id' => $user->id,
        'status' => 'paused',
        'started_at' => now()->subMinutes(17),
        'paused_at' => now(),
        'total_played_seconds' => 17 * 60,
        'time_total' => 0,
    ]);

    $this->actingAs($user)
        ->post(route('tables.end', $table), [
            'payments' => [
                ['method' => 'cash', 'amount' => 10000], // billed 5000, cash overpay for change
            ],
        ])
        ->assertRedirect();

    $session->refresh();
    expect((float) $session->time_total)->toBe(5000.0);

    $receipt = Receipt::query()->where('game_session_id', $session->id)->first();
    expect($receipt)->not->toBeNull()
        ->and((float) $receipt->grand_total)->toBe(5000.0);

    $this->assertDatabaseHas('receipt_payments', [
        'receipt_id' => $receipt->id,
        'method' => 'cash',
        'amount' => 5000,
    ]);
});

test('checkout completion rejects card and transfer total above grand total', function () {
    $user = User::factory()->create();
    $product = Product::create([
        'name' => 'Chips',
        'category' => 'Snacks',
        'price' => 5000,
        'is_active' => true,
    ]);

    $created = $this->actingAs($user)->postJson(route('checkouts.from-products'), [
        'items' => [
            ['product_id' => $product->id, 'quantity' => 1], // grand total = 5000
        ],
    ])->assertOk();

    $checkoutId = (int) $created->json('checkout_id');

    $this->actingAs($user)
        ->from(route('checkouts.index'))
        ->post(route('checkouts.complete', $checkoutId), [
            'payments' => [
                ['method' => 'card', 'amount' => 4000],
                ['method' => 'transfer_qr', 'amount' => 2000], // card + transfer = 6000 > 5000
            ],
        ])
        ->assertRedirect(route('checkouts.index'))
        ->assertSessionHasErrors('payments');

    $this->assertDatabaseHas('checkout_sessions', [
        'id' => $checkoutId,
        'status' => 'open',
    ]);

    $this->assertDatabaseMissing('receipts', [
        'checkout_session_id' => $checkoutId,
    ]);
});
