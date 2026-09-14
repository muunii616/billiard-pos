<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cash_session_product_stocks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('cash_session_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->unsignedInteger('opening_stock');
            $table->timestamps();
            $table->unique(['cash_session_id', 'product_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cash_session_product_stocks');
    }
};
