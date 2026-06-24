<?php

use App\Models\Receipt;
use Database\Seeders\DemoSalesSeeder;
use Database\Seeders\ProductSeeder;
use Database\Seeders\UserSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

test('demo sales cover January through June and exclude June weekends', function () {
    $this->seed([UserSeeder::class, ProductSeeder::class, DemoSalesSeeder::class]);

    $demoReceipts = Receipt::query()
        ->where('receipt_number', 'like', 'DEMO-%')
        ->orderBy('paid_at')
        ->get();

    expect($demoReceipts)->toHaveCount(37);

    foreach (range(1, 5) as $month) {
        expect($demoReceipts->filter(fn (Receipt $receipt) => $receipt->paid_at->month === $month))
            ->toHaveCount(3);
    }

    $juneReceipts = $demoReceipts->filter(fn (Receipt $receipt) => $receipt->paid_at->month === 6);

    expect($juneReceipts)->toHaveCount(22)
        ->and($juneReceipts->every(fn (Receipt $receipt) => $receipt->paid_at->isWeekday()))->toBeTrue();
});

test('demo sales can be reseeded without creating duplicates', function () {
    $this->seed([UserSeeder::class, ProductSeeder::class, DemoSalesSeeder::class]);
    $this->seed(DemoSalesSeeder::class);

    expect(Receipt::query()->where('receipt_number', 'like', 'DEMO-%')->count())->toBe(37);
});
