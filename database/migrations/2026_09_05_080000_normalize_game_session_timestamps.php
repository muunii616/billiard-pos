<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // DATETIME stores the UTC value exactly as written and cannot acquire
        // MySQL's implicit first-TIMESTAMP ON UPDATE behavior.
        Schema::table('game_sessions', function (Blueprint $table) {
            $table->dateTime('started_at')->change();
            $table->dateTime('paused_at')->nullable()->change();
            $table->dateTime('last_resume_at')->nullable()->change();
            $table->dateTime('ended_at')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('game_sessions', function (Blueprint $table) {
            $table->timestamp('started_at')->change();
            $table->timestamp('paused_at')->nullable()->change();
            $table->timestamp('last_resume_at')->nullable()->change();
            $table->timestamp('ended_at')->nullable()->change();
        });
    }
};
