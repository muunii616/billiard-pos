<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Existing demo products had no inventory column before this feature.
        DB::table('products')->where('stock_quantity', 0)->update(['stock_quantity' => 100]);
    }

    public function down(): void
    {
        // Stock values are operational data and must not be reset on rollback.
    }
};
