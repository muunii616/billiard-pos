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
            'time_blocks' => ['15' => 1],
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

test('open tab accepts a partial payment and keeps the tab open', function () {
    $user = User::factory()->create();
    $product = Product::create([
        'name' => 'Shared Drinks',
        'category' => 'Drinks',
        'price' => 10000,
        'is_active' => true,
    ]);

    $created = $this->actingAs($user)->postJson(route('checkouts.from-products'), [
        'items' => [
            ['product_id' => $product->id, 'quantity' => 2], // grand total = 20000
        ],
    ])->assertOk();

    $checkoutId = (int) $created->json('checkout_id');

    $this->actingAs($user)
        ->postJson(route('checkouts.complete', $checkoutId), [
            'payments' => [
                ['method' => 'cash', 'amount' => 5000],
            ],
        ])
        ->assertOk()
        ->assertJsonPath('message', 'Partial payment recorded.')
        ->assertJsonPath('partial', true)
        ->assertJsonPath('remaining', 15000);

    $this->assertDatabaseHas('checkout_sessions', [
        'id' => $checkoutId,
        'status' => 'open',
    ]);

    $partial = Receipt::query()->where('checkout_session_id', $checkoutId)->first();
    expect($partial)->not->toBeNull()
        ->and((float) $partial->grand_total)->toBe(5000.0);

    $this->actingAs($user)
        ->postJson(route('checkouts.complete', $checkoutId), [
            'payments' => [
                ['method' => 'card', 'amount' => 15000],
            ],
        ])
        ->assertOk()
        ->assertJsonPath('message', 'Payment completed.')
        ->assertJsonPath('partial', false);

    $this->assertDatabaseHas('checkout_sessions', [
        'id' => $checkoutId,
        'status' => 'completed',
    ]);

    $receipts = Receipt::query()->where('checkout_session_id', $checkoutId)->where('status', 'paid')->get();
    expect($receipts)->toHaveCount(2)
        ->and((float) $receipts->sum('grand_total'))->toBe(20000.0);
});

test('open tab with partial payments cannot be voided until receipts are cleared', function () {
    $user = User::factory()->create(['role' => 'admin']);
    $product = Product::create([
        'name' => 'Partial Void Block',
        'category' => 'Drinks',
        'price' => 8000,
        'is_active' => true,
    ]);

    $created = $this->actingAs($user)->postJson(route('checkouts.from-products'), [
        'items' => [['product_id' => $product->id, 'quantity' => 1]],
    ])->assertOk();

    $checkoutId = (int) $created->json('checkout_id');

    $this->actingAs($user)
        ->postJson(route('checkouts.complete', $checkoutId), [
            'payments' => [['method' => 'cash', 'amount' => 3000]],
        ])
        ->assertOk();

    $this->actingAs($user)
        ->postJson(route('admin.checkouts.void', $checkoutId))
        ->assertStatus(422)
        ->assertJsonPath('message', 'This tab has partial payments. Void those receipts first, or settle the remaining balance.');

    $this->assertDatabaseHas('checkout_sessions', [
        'id' => $checkoutId,
        'status' => 'open',
    ]);
});
