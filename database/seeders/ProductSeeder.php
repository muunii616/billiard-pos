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
            ['name' => 'Cola', 'category' => 'Drinks', 'price' => 3.00, 'is_active' => true],
            ['name' => 'Water', 'category' => 'Drinks', 'price' => 1.50, 'is_active' => true],
            ['name' => 'Iced Tea', 'category' => 'Drinks', 'price' => 2.50, 'is_active' => true],
            ['name' => 'Energy Drink', 'category' => 'Drinks', 'price' => 4.00, 'is_active' => true],
            ['name' => 'Chips', 'category' => 'Snacks', 'price' => 1.00, 'is_active' => true],
            ['name' => 'Peanuts', 'category' => 'Snacks', 'price' => 1.50, 'is_active' => true],
            ['name' => 'Nachos', 'category' => 'Snacks', 'price' => 4.50, 'is_active' => true],
            ['name' => 'Fries', 'category' => 'Snacks', 'price' => 3.50, 'is_active' => true],
            ['name' => 'Snack & Drinks Set', 'category' => 'Sets', 'price' => 10.00, 'is_active' => true],
            ['name' => 'Friends Night Set', 'category' => 'Sets', 'price' => 15.00, 'is_active' => true],
            ['name' => 'Table Time + Drinks Set', 'category' => 'Sets', 'price' => 20.00, 'is_active' => true],
        ];

        foreach ($products as $product) {
            Product::updateOrCreate(
                ['name' => $product['name']],
                $product,
            );
        }
    }
}

