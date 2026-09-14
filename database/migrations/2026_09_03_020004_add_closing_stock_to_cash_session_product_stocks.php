<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cash_session_product_stocks', fn (Blueprint $table) => $table->unsignedInteger('closing_stock')->nullable()->after('opening_stock'));
    }

    public function down(): void
    {
        Schema::table('cash_session_product_stocks', fn (Blueprint $table) => $table->dropColumn('closing_stock'));
    }
};
