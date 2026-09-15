<?php

use App\Models\BilliardTable;
use App\Models\GameSession;
use App\Models\User;

test('admin can delete another user even when they have session history', function () {
    $admin = User::factory()->create(['role' => 'admin']);
    $otherAdmin = User::factory()->create(['role' => 'admin']);
    $employee = User::factory()->create([
        'role' => 'employee',
        'email' => 'employee@billiardpos.test',
    ]);

    $table = BilliardTable::create([
        'name' => 'Table Delete Test',
        'status' => 'available',
    ]);

    GameSession::create([
        'billiard_table_id' => $table->id,
        'user_id' => $employee->id,
        'status' => 'completed',
        'started_at' => now()->subHour(),
        'ended_at' => now(),
        'total_played_seconds' => 3600,
        'time_total' => 0,
    ]);

    $this->actingAs($admin)
        ->delete(route('admin.users.destroy', $employee))
        ->assertRedirect();

    expect(User::query()->find($employee->id))->toBeNull()
        ->and(User::withTrashed()->find($employee->id)?->trashed())->toBeTrue()
        ->and(User::withTrashed()->find($employee->id)?->email)->toContain('@deleted.local');

    $this->actingAs($admin)
        ->delete(route('admin.users.destroy', $otherAdmin))
        ->assertRedirect();

    expect(User::withTrashed()->find($otherAdmin->id)?->trashed())->toBeTrue()
        ->and(User::query()->where('role', 'admin')->count())->toBe(1);
});

test('admin cannot delete their own account', function () {
    $admin = User::factory()->create(['role' => 'admin']);

    $this->actingAs($admin)
        ->from(route('admin.users.index'))
        ->delete(route('admin.users.destroy', $admin))
        ->assertRedirect()
        ->assertSessionHasErrors('user');

    expect(User::query()->find($admin->id))->not->toBeNull();
});
