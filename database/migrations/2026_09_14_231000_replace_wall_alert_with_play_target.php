<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('game_sessions', function (Blueprint $table) {
            if (Schema::hasColumn('game_sessions', 'alert_ends_at')) {
                $table->dropColumn('alert_ends_at');
            }
            if (Schema::hasColumn('game_sessions', 'alert_remaining_seconds')) {
                $table->dropColumn('alert_remaining_seconds');
            }
            if (! Schema::hasColumn('game_sessions', 'alert_at_played_seconds')) {
                $table->unsignedInteger('alert_at_played_seconds')->nullable()->after('time_total');
            }
        });
    }

    public function down(): void
    {
        Schema::table('game_sessions', function (Blueprint $table) {
            if (Schema::hasColumn('game_sessions', 'alert_at_played_seconds')) {
                $table->dropColumn('alert_at_played_seconds');
            }
            if (! Schema::hasColumn('game_sessions', 'alert_ends_at')) {
                $table->timestamp('alert_ends_at')->nullable()->after('time_total');
            }
            if (! Schema::hasColumn('game_sessions', 'alert_remaining_seconds')) {
                $table->unsignedInteger('alert_remaining_seconds')->nullable()->after('alert_ends_at');
            }
        });
    }
};
