<?php

use App\Models\BilliardTable;
use App\Models\GameSession;
use App\Models\Product;
use App\Models\Receipt;
use App\Models\SessionItem;
use App\Models\User;

test('prepaid start takes payment and counts down the purchased time', function () {
    $user = User::factory()->create();
    $table = BilliardTable::create([
        'name' => 'Prepaid Table',
        'status' => 'available',
    ]);

    $this->actingAs($user)
        ->post(route('tables.start', $table), [
            'mode' => 'prepaid',
            'time_blocks' => ['60' => 1, '15' => 1],
            'payments' => [
                ['method' => 'cash', 'amount' => 25000],
            ],
        ])
        ->assertRedirect()
        ->assertSessionHas('receipt');

    $table->refresh();
    expect($table->status)->toBe('running');

    $session = GameSession::query()->where('billiard_table_id', $table->id)->first();
    expect($session)->not->toBeNull()
        ->and($session->billing_mode)->toBe('prepaid')
        ->and((int) $session->prepaid_seconds)->toBe(75 * 60)
        ->and((float) $session->prepaid_amount)->toBe(25000.0)
        ->and((int) $session->alert_at_played_seconds)->toBe(75 * 60)
        ->and($session->prepaid_as_timer)->toBeFalse();

    $receipt = Receipt::query()->where('game_session_id', $session->id)->first();
    expect($receipt)->not->toBeNull()
        ->and($receipt->status)->toBe('paid')
        ->and((float) $receipt->grand_total)->toBe(25000.0);
    expect($receipt->lineItems)->toHaveCount(2);
});

test('prepaid time can be extended and then kept as a timer', function () {
    $user = User::factory()->create();
    $table = BilliardTable::create([
        'name' => 'Extend Table',
        'status' => 'available',
    ]);

    $this->actingAs($user)->post(route('tables.start', $table), [
        'mode' => 'prepaid',
        'time_blocks' => ['15' => 1],
        'payments' => [['method' => 'cash', 'amount' => 5000]],
    ])->assertRedirect();

    $this->actingAs($user)->post(route('tables.prepaid.extend', $table), [
        'time_blocks' => ['30' => 1],
        'payments' => [['method' => 'card', 'amount' => 10000]],
    ])->assertRedirect();

    $session = GameSession::query()->where('billiard_table_id', $table->id)->first();
    expect((int) $session->prepaid_seconds)->toBe(45 * 60)
        ->and((float) $session->prepaid_amount)->toBe(15000.0)
        ->and((int) $session->alert_at_played_seconds)->toBe(45 * 60);

    expect(Receipt::query()->where('game_session_id', $session->id)->count())->toBe(2);

    $this->actingAs($user)
        ->post(route('tables.prepaid.release', $table))
        ->assertRedirect();

    $session->refresh();
    expect($session->prepaid_as_timer)->toBeTrue()
        ->and($session->alert_at_played_seconds)->toBeNull();
});

test('ending prepaid time with no items closes without another payment', function () {
    $user = User::factory()->create();
    $table = BilliardTable::create([
        'name' => 'Close Empty Prepaid',
        'status' => 'available',
    ]);

    $this->actingAs($user)->post(route('tables.start', $table), [
        'mode' => 'prepaid',
        'time_blocks' => ['15' => 1],
        'payments' => [['method' => 'cash', 'amount' => 5000]],
    ])->assertRedirect();

    $this->actingAs($user)->post(route('tables.end', $table), [
        'time_blocks' => ['60' => 1],
        'payments' => [],
    ])->assertRedirect()->assertSessionMissing('receipt');

    $table->refresh();
    $session = GameSession::query()->where('billiard_table_id', $table->id)->first();

    expect($table->status)->toBe('available')
        ->and($session->status)->toBe('completed')
        ->and((float) $session->time_total)->toBe(5000.0)
        ->and(Receipt::query()->where('game_session_id', $session->id)->count())->toBe(1);
});

test('ending prepaid time does not charge the prepaid amount again', function () {
    $user = User::factory()->create();
    $table = BilliardTable::create([
        'name' => 'Close Prepaid',
        'status' => 'available',
    ]);
    $drink = Product::create([
        'name' => 'Water',
        'category' => 'Drinks',
        'price' => 2000,
        'is_active' => true,
    ]);

    $this->actingAs($user)->post(route('tables.start', $table), [
        'mode' => 'prepaid',
        'time_blocks' => ['15' => 1],
        'payments' => [['method' => 'cash', 'amount' => 5000]],
    ])->assertRedirect();

    $session = GameSession::query()->where('billiard_table_id', $table->id)->first();
    SessionItem::create([
        'game_session_id' => $session->id,
        'product_id' => $drink->id,
        'product_name' => $drink->name,
        'product_category' => 'Drinks',
        'quantity' => 1,
        'unit_price' => 2000,
        'total_price' => 2000,
    ]);

    $this->actingAs($user)->post(route('tables.end', $table), [
        'time_blocks' => [],
        'payments' => [['method' => 'cash', 'amount' => 2000]],
    ])->assertRedirect();

    $session->refresh();
    $table->refresh();
    expect($table->status)->toBe('available')
        ->and($session->status)->toBe('completed')
        ->and((float) $session->time_total)->toBe(5000.0);

    $receipts = Receipt::query()->where('game_session_id', $session->id)->orderBy('id')->get();
    expect($receipts)->toHaveCount(2)
        ->and((float) $receipts[0]->grand_total)->toBe(5000.0)
        ->and((float) $receipts[1]->grand_total)->toBe(2000.0)
        ->and((float) $receipts[1]->time_total)->toBe(0.0)
        ->and((float) $receipts[1]->products_total)->toBe(2000.0);
});
