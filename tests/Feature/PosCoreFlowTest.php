<?php

use App\Models\BilliardTable;
use App\Models\CheckoutSession;
use App\Models\CheckoutSessionItem;
use App\Models\GameSession;
use App\Models\Product;
use App\Models\Receipt;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

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
        'price' => 2500,
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
        'price' => 3000,
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
        'unit_price' => 3000,
        'total_price' => 3000,
    ]);

    CheckoutSessionItem::create([
        'checkout_session_id' => $source->id,
        'product_id' => $product->id,
        'product_name' => $product->name,
        'product_category' => $product->category,
        'quantity' => 2,
        'unit_price' => 3000,
        'total_price' => 6000,
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

test('table time is charged from stacked blocks not play minutes', function () {
    $user = User::factory()->create();
    $table = BilliardTable::create([
        'name' => 'Table 3',
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
                ['method' => 'cash', 'amount' => 5000],
            ],
        ])
        ->assertRedirect();

    $session->refresh();
    expect((float) $session->time_total)->toBe(5000.0)
        ->and($session->time_blocks)->toBe(['15' => 1])
        ->and((int) $session->total_minutes)->toBe(15);

    $receipt = Receipt::query()->where('game_session_id', $session->id)->first();
    expect($receipt)->not->toBeNull();
    expect((float) $receipt->time_total)->toBe(5000.0)
        ->and((float) $receipt->grand_total)->toBe(5000.0);
});

test('table alert uses play clock and freezes when paused', function () {
    $user = User::factory()->create();
    $table = BilliardTable::create([
        'name' => 'Alert Table',
        'status' => 'available',
    ]);

    $this->actingAs($user)->post(route('tables.start', $table))->assertRedirect();
    $session = $table->fresh()->latestGameSession;
    expect($session)->not->toBeNull();

    $this->actingAs($user)
        ->post(route('tables.alert.set', $table), [
            'time_blocks' => ['15' => 1],
        ])
        ->assertRedirect();

    $session->refresh();
    expect($session->hasAlert())->toBeTrue()
        ->and($session->alert_at_played_seconds)->toBeGreaterThanOrEqual(15 * 60)
        ->and($session->alertRemainingSeconds())->toBeGreaterThan(14 * 60);

    $target = (int) $session->alert_at_played_seconds;

    $this->actingAs($user)->post(route('tables.pause', $table))->assertRedirect();
    $session->refresh();
    $remainingWhilePaused = $session->alertRemainingSeconds();
    expect($session->status)->toBe('paused')
        ->and($session->alert_at_played_seconds)->toBe($target)
        ->and($remainingWhilePaused)->not->toBeNull()
        ->and($remainingWhilePaused)->toBeGreaterThan(0);

    $this->travel(30)->seconds();
    $session->refresh();
    expect($session->alertRemainingSeconds())->toBe($remainingWhilePaused)
        ->and($session->alert_at_played_seconds)->toBe($target);

    $this->actingAs($user)->post(route('tables.resume', $table))->assertRedirect();
    $session->refresh();
    expect($session->status)->toBe('running')
        ->and($session->alert_at_played_seconds)->toBe($target);

    $this->actingAs($user)->post(route('tables.alert.clear', $table))->assertRedirect();
    $session->refresh();
    expect($session->hasAlert())->toBeFalse();
});

test('employee must provide a reason when cancelling an active table session', function () {
    $employee = User::factory()->create(['role' => 'employee']);
    $table = BilliardTable::create([
        'name' => 'Table 4',
        'status' => 'running',
    ]);

    $session = GameSession::create([
        'billiard_table_id' => $table->id,
        'user_id' => $employee->id,
        'status' => 'running',
        'started_at' => now()->subMinutes(10),
        'last_resume_at' => now()->subMinutes(10),
        'total_played_seconds' => 0,
        'time_total' => 0,
    ]);

    $this->actingAs($employee)
        ->postJson(route('tables.cancel-session', $table), [
            'reason' => '',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('reason');

    $session->refresh();
    $table->refresh();

    expect($session->status)->toBe('running')
        ->and($table->status)->toBe('running');
});

test('employee cancellation stores the reason and appears in overview', function () {
    $employee = User::factory()->create([
        'name' => 'Employee User',
        'role' => 'employee',
    ]);
    $table = BilliardTable::create([
        'name' => 'Table 5',
        'status' => 'running',
    ]);

    $session = GameSession::create([
        'billiard_table_id' => $table->id,
        'user_id' => $employee->id,
        'status' => 'running',
        'started_at' => now()->subMinutes(10),
        'last_resume_at' => now()->subMinutes(10),
        'total_played_seconds' => 0,
        'time_total' => 0,
    ]);

    $this->actingAs($employee)
        ->postJson(route('tables.cancel-session', $table), [
            'reason' => 'Customer left before paying.',
        ])
        ->assertOk()
        ->assertJsonPath('message', 'Session cancelled. Products returned to stock.');

    $session->refresh();
    $table->refresh();

    expect($session->status)->toBe('cancelled')
        ->and($session->cancel_reason)->toBe('Customer left before paying.')
        ->and($session->cancelled_by_user_id)->toBe($employee->id)
        ->and($table->status)->toBe('available');

    $this->actingAs($employee)
        ->get(route('overview', ['mode' => 'daily', 'date' => now()->toDateString()]))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->has('cancelled_sessions', 1)
            ->where('cancelled_sessions.0.table_name', 'Table 5')
            ->where('cancelled_sessions.0.cancelled_by', 'Employee User')
            ->where('cancelled_sessions.0.reason', 'Customer left before paying.')
        );
});

test('admin can cancel an active table session without a reason', function () {
    $admin = User::factory()->create(['role' => 'admin']);
    $table = BilliardTable::create([
        'name' => 'Table 6',
        'status' => 'paused',
    ]);

    $session = GameSession::create([
        'billiard_table_id' => $table->id,
        'user_id' => $admin->id,
        'status' => 'paused',
        'started_at' => now()->subMinutes(10),
        'paused_at' => now(),
        'total_played_seconds' => 600,
        'time_total' => 0,
    ]);

    $this->actingAs($admin)
        ->postJson(route('tables.cancel-session', $table), [
            'reason' => '',
        ])
        ->assertOk();

    $session->refresh();

    expect($session->status)->toBe('cancelled')
        ->and($session->cancel_reason)->toBeNull()
        ->and($session->cancelled_by_user_id)->toBe($admin->id);
});

test('start is blocked by an older ghost active session even when the table looks free', function () {
    $user = User::factory()->create();
    $table = BilliardTable::create([
        'name' => 'Table 6',
        'status' => 'available',
    ]);

    $ghost = GameSession::create([
        'billiard_table_id' => $table->id,
        'user_id' => $user->id,
        'status' => 'running',
        'started_at' => now('UTC')->subDays(8),
        'last_resume_at' => now('UTC')->subDays(8),
        'total_played_seconds' => 0,
        'time_total' => 0,
    ]);

    GameSession::create([
        'billiard_table_id' => $table->id,
        'user_id' => $user->id,
        'status' => 'completed',
        'started_at' => now('UTC')->subHour(),
        'ended_at' => now('UTC')->subMinutes(30),
        'total_played_seconds' => 1800,
        'time_total' => 10000,
    ]);

    $this->actingAs($user)
        ->post(route('tables.start', $table))
        ->assertRedirect()
        ->assertSessionHasErrors('table');

    expect($ghost->fresh()->status)->toBe('running');
});

test('cancel clears an older ghost active session behind a completed one', function () {
    $admin = User::factory()->create(['role' => 'admin']);
    $table = BilliardTable::create([
        'name' => 'Table 7',
        'status' => 'available',
    ]);

    $ghost = GameSession::create([
        'billiard_table_id' => $table->id,
        'user_id' => $admin->id,
        'status' => 'paused',
        'started_at' => now('UTC')->subDays(10),
        'paused_at' => now('UTC')->subDays(10),
        'total_played_seconds' => 60,
        'time_total' => 0,
    ]);

    GameSession::create([
        'billiard_table_id' => $table->id,
        'user_id' => $admin->id,
        'status' => 'completed',
        'started_at' => now('UTC')->subHour(),
        'ended_at' => now('UTC')->subMinutes(20),
        'total_played_seconds' => 1200,
        'time_total' => 10000,
    ]);

    $this->actingAs($admin)
        ->postJson(route('tables.cancel-session', $table))
        ->assertOk();

    expect($ghost->fresh()->status)->toBe('cancelled')
        ->and($table->fresh()->status)->toBe('available');
});

test('employee must provide a reason when deleting an open tab', function () {
    $employee = User::factory()->create(['role' => 'employee']);
    $tab = CheckoutSession::create(['status' => CheckoutSession::STATUS_OPEN]);

    $this->actingAs($employee)
        ->postJson(route('admin.checkouts.void', $tab), [
            'reason' => '',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('reason');

    expect($tab->fresh()->status)->toBe('open');
});

test('employee can delete an open tab with a reason', function () {
    $employee = User::factory()->create(['role' => 'employee']);
    $tab = CheckoutSession::create(['status' => CheckoutSession::STATUS_OPEN]);

    $this->actingAs($employee)
        ->postJson(route('admin.checkouts.void', $tab), [
            'reason' => 'Customer cancelled the order.',
        ])
        ->assertOk();

    $tab->refresh();

    expect($tab->status)->toBe('voided')
        ->and($tab->void_reason)->toBe('Customer cancelled the order.')
        ->and($tab->voided_by_user_id)->toBe($employee->id);
});
