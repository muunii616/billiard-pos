<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('receipts', function (Blueprint $table) {
            $table->foreignId('checkout_session_id')->nullable()->after('id')->constrained('checkout_sessions')->nullOnDelete();
        });
        Schema::table('receipts', function (Blueprint $table) {
            $table->dropForeign(['game_session_id']);
        });
        Schema::table('receipts', function (Blueprint $table) {
            $table->unsignedBigInteger('game_session_id')->nullable()->change();
            $table->foreign('game_session_id')->references('id')->on('game_sessions')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('receipts', function (Blueprint $table) {
            $table->dropForeign(['checkout_session_id']);
            $table->dropForeign(['game_session_id']);
        });
        Schema::table('receipts', function (Blueprint $table) {
            $table->unsignedBigInteger('game_session_id')->nullable(false)->change();
            $table->foreign('game_session_id')->references('id')->on('game_sessions');
        });
    }
};
