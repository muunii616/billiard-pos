<?php

use App\Models\BilliardTable;
use App\Models\CheckoutSession;
use App\Models\GameSession;
use App\Models\User;

test('admin can correct time blocks on an open tab from edit items', function () {
    $admin = User::factory()->create(['role' => 'admin']);
    $table = BilliardTable::create(['name' => 'Edit Time Table', 'status' => 'available']);
    $checkout = CheckoutSession::create(['status' => CheckoutSession::STATUS_OPEN]);

    $session = GameSession::create([
        'billiard_table_id' => $table->id,
        'checkout_session_id' => $checkout->id,
        'user_id' => $admin->id,
        'status' => 'completed',
        'started_at' => now('UTC')->subHour(),
        'ended_at' => now('UTC'),
        'total_played_seconds' => 3600,
        'total_minutes' => 30,
        'time_total' => 10000,
        'time_blocks' => ['30' => 1],
    ]);

    $this->actingAs($admin)
        ->putJson(route('admin.checkouts.items.update', $checkout), [
            'items' => [],
            'time_sessions' => [
                [
                    'id' => $session->id,
                    'time_blocks' => ['60' => 1],
                ],
            ],
        ])
        ->assertOk()
        ->assertJsonPath('message', 'Tab items updated.');

    $session->refresh();

    expect($session->time_blocks)->toBe(['60' => 1])
        ->and((float) $session->time_total)->toBe(20000.0)
        ->and((int) $session->total_minutes)->toBe(60);
});

test('employee cannot edit open tab time blocks', function () {
    $employee = User::factory()->create(['role' => 'employee']);
    $table = BilliardTable::create(['name' => 'Staff Table', 'status' => 'available']);
    $checkout = CheckoutSession::create(['status' => CheckoutSession::STATUS_OPEN]);

    $session = GameSession::create([
        'billiard_table_id' => $table->id,
        'checkout_session_id' => $checkout->id,
        'user_id' => $employee->id,
        'status' => 'completed',
        'started_at' => now('UTC')->subMinutes(30),
        'ended_at' => now('UTC'),
        'total_played_seconds' => 1800,
        'total_minutes' => 30,
        'time_total' => 10000,
        'time_blocks' => ['30' => 1],
    ]);

    $this->actingAs($employee)
        ->putJson(route('admin.checkouts.items.update', $checkout), [
            'items' => [],
            'time_sessions' => [
                [
                    'id' => $session->id,
                    'time_blocks' => ['60' => 1],
                ],
            ],
        ])
        ->assertForbidden();

    expect((float) $session->fresh()->time_total)->toBe(10000.0);
});
