<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('receipts', function (Blueprint $table) {
            $table->string('status')->default('unpaid')->after('paid_at'); // paid, unpaid, voided
            $table->timestamp('voided_at')->nullable()->after('status');
            $table->string('void_reason')->nullable()->after('voided_at');
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::table('receipts', function (Blueprint $table) {
            $table->dropColumn(['status', 'voided_at', 'void_reason', 'deleted_at']);
        });
    }
};

