<?php

use App\Models\BilliardTable;
use App\Models\GameSession;
use App\Models\User;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

test('repair migration cancels ghost sessions on available tables', function () {
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

    // RefreshDatabase already applied the migration before this ghost existed.
    DB::table('migrations')
        ->where('migration', '2026_09_15_140000_clear_ghost_active_sessions_on_available_tables')
        ->delete();

    Artisan::call('migrate', [
        '--path' => 'database/migrations/2026_09_15_140000_clear_ghost_active_sessions_on_available_tables.php',
        '--force' => true,
    ]);

    expect($ghost->fresh()->status)->toBe('cancelled')
        ->and($ghost->fresh()->cancel_reason)->toContain('Auto-cleared stuck session');
});
