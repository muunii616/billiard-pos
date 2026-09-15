<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Table cards use billiard_tables.status for Start, but start() also rejects
        // any running/paused game_sessions row. Old stuck sessions left tables 6/7
        // looking free while Start silently failed.
        $now = now('UTC');

        $tableIds = DB::table('billiard_tables')
            ->where('status', 'available')
            ->pluck('id');

        if ($tableIds->isEmpty()) {
            return;
        }

        DB::table('game_sessions')
            ->whereIn('status', ['running', 'paused'])
            ->whereIn('billiard_table_id', $tableIds->all())
            ->update([
                'status' => 'cancelled',
                'ended_at' => $now,
                'paused_at' => null,
                'alert_at_played_seconds' => null,
                'cancel_reason' => 'Auto-cleared stuck session (table was already available).',
                'updated_at' => $now,
            ]);
    }

    public function down(): void
    {
        // One-way repair; cannot safely revive cancelled ghosts.
    }
};
