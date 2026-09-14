<?php

namespace App\Support;

use Illuminate\Support\Str;

final class ProductCategory
{
    public static function normalize(?string $category): string
    {
        return match (strtolower(trim((string) $category))) {
            'drink', 'drinks' => 'Drinks',
            'snack', 'snacks' => 'Snacks',
            'set', 'sets', 'combo', 'combos' => 'Sets',
            default => Str::of((string) $category)->trim()->squish()->title()->toString() ?: 'Other',
        };
    }
}
