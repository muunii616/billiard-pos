<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('products')->update(['stock_quantity' => 0]);
    }

    public function down(): void
    {
        // Inventory is operational data; it is not restored automatically.
    }
};
