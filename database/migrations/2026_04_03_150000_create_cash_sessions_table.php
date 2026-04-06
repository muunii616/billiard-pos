<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cash_sessions', function (Blueprint $table) {
            $table->id();
            $table->string('status', 16)->default('open')->index(); // open|closed
            $table->decimal('opening_cash', 12, 2)->default(0);
            $table->timestamp('opened_at')->nullable()->index();
            $table->foreignId('opened_by_user_id')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamp('closed_at')->nullable()->index();
            $table->foreignId('closed_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->decimal('counted_cash', 12, 2)->nullable();
            $table->decimal('expected_cash', 12, 2)->nullable();
            $table->decimal('variance', 12, 2)->nullable();
            $table->text('variance_reason')->nullable();

            // Snapshot totals at close time (report-friendly).
            $table->unsignedInteger('receipts_count')->nullable();
            $table->decimal('total_sales', 12, 2)->nullable();
            $table->decimal('cash_sales', 12, 2)->nullable();
            $table->decimal('card_sales', 12, 2)->nullable();
            $table->decimal('transfer_sales', 12, 2)->nullable();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cash_sessions');
    }
};
