<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class ProductSeeder extends Seeder
{
    /**
     * Seed example products for testing.
     */
    public function run(): void
    {
        DB::table('products')->insert([
            [
                'name' => 'Cola',
                'category' => 'Drinks',
                'price' => 3.00,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'name' => 'Chips',
                'category' => 'Snacks',
                'price' => 1.00,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'name' => 'Snack & Drinks Set',
                'category' => 'Set',
                'price' => 10.00,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);
    }
}

