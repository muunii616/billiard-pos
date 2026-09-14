<?php

namespace Database\Seeders;

use App\Models\Product;
use Illuminate\Database\Seeder;

class ProductSeeder extends Seeder
{
    /**
     * Seed example products for testing.
     */
    public function run(): void
    {
        $products = [
            ['name' => 'Cola', 'category' => 'Drinks', 'price' => 5000, 'is_active' => true],
            ['name' => 'Water', 'category' => 'Drinks', 'price' => 2500, 'is_active' => true],
            ['name' => 'Iced Tea', 'category' => 'Drinks', 'price' => 4000, 'is_active' => true],
            ['name' => 'Energy Drink', 'category' => 'Drinks', 'price' => 6500, 'is_active' => true],
            ['name' => 'Chips', 'category' => 'Snacks', 'price' => 3000, 'is_active' => true],
            ['name' => 'Peanuts', 'category' => 'Snacks', 'price' => 3500, 'is_active' => true],
            ['name' => 'Nachos', 'category' => 'Snacks', 'price' => 8000, 'is_active' => true],
            ['name' => 'Fries', 'category' => 'Snacks', 'price' => 7000, 'is_active' => true],
            ['name' => 'Snack & Drinks Set', 'category' => 'Sets', 'price' => 18000, 'is_active' => true],
            ['name' => 'Friends Night Set', 'category' => 'Sets', 'price' => 30000, 'is_active' => true],
            ['name' => 'Table Time + Drinks Set', 'category' => 'Sets', 'price' => 40000, 'is_active' => true],
        ];

        foreach ($products as $product) {
            Product::updateOrCreate(
                ['name' => $product['name']],
                $product,
            );
        }
    }
}
