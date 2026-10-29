<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('game_sessions', function (Blueprint $table) {
            $table->string('billing_mode')->default('timer')->after('status');
            $table->unsignedInteger('prepaid_seconds')->default(0)->after('billing_mode');
            $table->decimal('prepaid_amount', 10, 2)->default(0)->after('prepaid_seconds');
            $table->json('prepaid_blocks')->nullable()->after('prepaid_amount');
            $table->boolean('prepaid_as_timer')->default(false)->after('prepaid_blocks');
        });
    }

    public function down(): void
    {
        Schema::table('game_sessions', function (Blueprint $table) {
            $table->dropColumn([
                'billing_mode',
                'prepaid_seconds',
                'prepaid_amount',
                'prepaid_blocks',
                'prepaid_as_timer',
            ]);
        });
    }
};
