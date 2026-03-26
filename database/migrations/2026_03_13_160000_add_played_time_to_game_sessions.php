<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('game_sessions', function (Blueprint $table) {
            $table->timestamp('paused_at')->nullable()->after('started_at');
            $table->unsignedInteger('total_played_seconds')->default(0)->after('paused_at');
            $table->timestamp('last_resume_at')->nullable()->after('total_played_seconds');
        });
    }

    public function down(): void
    {
        Schema::table('game_sessions', function (Blueprint $table) {
            $table->dropColumn(['paused_at', 'total_played_seconds', 'last_resume_at']);
        });
    }
};
