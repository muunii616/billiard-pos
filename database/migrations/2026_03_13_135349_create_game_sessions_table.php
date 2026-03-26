<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('game_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('billiard_table_id')->constrained('billiard_tables');
            $table->foreignId('user_id')->constrained('users'); // employee who handled the session
            $table->string('status')->default('running'); // running, paused, completed, cancelled
            $table->timestamp('started_at');
            $table->timestamp('ended_at')->nullable();
            $table->integer('total_minutes')->nullable();
            $table->decimal('time_total', 10, 2)->default(0);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('game_sessions');
    }
};
