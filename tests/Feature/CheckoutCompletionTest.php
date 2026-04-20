<?php

use App\Models\CheckoutSession;
use App\Models\Product;
use App\Models\Receipt;
use App\Models\User;

test('checkout completion allows overpaid cash and stores payment rows', function () {
    $user = User::factory()->create();
    $product = Product::create([
        'name' => 'Orange Juice',
        'category' => 'Drinks',
        'price' => 3.50,
        'is_active' => true,
    ]);

    $created = $this->actingAs($user)->postJson(route('checkouts.from-products'), [
        'items' => [
            ['product_id' => $product->id, 'quantity' => 2], // grand total = 7.00
        ],
    ])->assertOk();

    $checkoutId = (int) $created->json('checkout_id');

    $this->actingAs($user)
        ->postJson(route('checkouts.complete', $checkoutId), [
            'payments' => [
                ['method' => 'cash', 'amount' => 10.00], // overpaid cash should be allowed
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
    expect((float) $receipt->grand_total)->toBe(7.0);

    $this->assertDatabaseHas('receipt_payments', [
        'receipt_id' => $receipt->id,
        'method' => 'cash',
        'amount' => 10.00,
    ]);
});

test('checkout completion rejects card and transfer total above grand total', function () {
    $user = User::factory()->create();
    $product = Product::create([
        'name' => 'Chips',
        'category' => 'Snacks',
        'price' => 5.00,
        'is_active' => true,
    ]);

    $created = $this->actingAs($user)->postJson(route('checkouts.from-products'), [
        'items' => [
            ['product_id' => $product->id, 'quantity' => 1], // grand total = 5.00
        ],
    ])->assertOk();

    $checkoutId = (int) $created->json('checkout_id');

    $this->actingAs($user)
        ->from(route('checkouts.index'))
        ->post(route('checkouts.complete', $checkoutId), [
            'payments' => [
                ['method' => 'card', 'amount' => 4.00],
                ['method' => 'transfer_qr', 'amount' => 2.00], // card + transfer = 6.00 > 5.00
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

