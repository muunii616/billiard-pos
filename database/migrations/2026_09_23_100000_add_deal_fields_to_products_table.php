<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->foreignId('deal_product_id')
                ->nullable()
                ->after('low_stock_threshold')
                ->constrained('products')
                ->nullOnDelete();
            $table->unsignedTinyInteger('deal_buy_qty')->nullable()->after('deal_product_id');
            $table->unsignedTinyInteger('deal_get_qty')->nullable()->after('deal_buy_qty');
            $table->date('deal_starts_on')->nullable()->after('deal_get_qty');
            $table->date('deal_ends_on')->nullable()->after('deal_starts_on');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropConstrainedForeignId('deal_product_id');
            $table->dropColumn(['deal_buy_qty', 'deal_get_qty', 'deal_starts_on', 'deal_ends_on']);
        });
    }
};
