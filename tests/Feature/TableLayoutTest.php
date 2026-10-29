<?php

use App\Models\BilliardTable;
use App\Models\User;

test('admin can rotate a table and change its place on the floor', function () {
    $admin = User::factory()->create(['role' => 'admin']);
    $first = BilliardTable::create([
        'name' => 'Table 1',
        'status' => 'available',
        'sort_order' => 1,
    ]);
    $second = BilliardTable::create([
        'name' => 'Table 2',
        'status' => 'available',
        'sort_order' => 2,
    ]);

    $this->actingAs($admin)
        ->put(route('admin.tables.update', $first), ['rotation' => 90])
        ->assertRedirect();

    expect($first->fresh()->rotation)->toBe(90);

    $this->actingAs($admin)
        ->put(route('admin.tables.reorder'), [
            'ids' => [$second->id, $first->id],
        ])
        ->assertRedirect();

    expect($second->fresh()->sort_order)->toBe(1)
        ->and($first->fresh()->sort_order)->toBe(2);
});
