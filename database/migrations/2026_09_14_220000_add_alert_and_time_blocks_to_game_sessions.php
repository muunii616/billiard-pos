<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('game_sessions', function (Blueprint $table) {
            $table->unsignedInteger('alert_at_played_seconds')->nullable()->after('time_total');
            $table->json('time_blocks')->nullable()->after('alert_at_played_seconds');
        });
    }

    public function down(): void
    {
        Schema::table('game_sessions', function (Blueprint $table) {
            $table->dropColumn(['alert_at_played_seconds', 'time_blocks']);
        });
    }
};
