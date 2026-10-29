<?php

use App\Models\CheckoutSession;
use App\Models\CheckoutSessionItem;
use App\Models\Product;
use App\Models\User;
use App\Support\InventoryReport;
use App\Support\PosDate;

test('inventory report shows starting stock and the count at the start of the period', function () {
    $admin = User::factory()->create(['role' => 'admin']);
    $base = Product::create([
        'name' => 'Altan Gobi',
        'category' => 'Beer',
        'price' => 10000,
        'is_active' => true,
        'stock_quantity' => 8,
        'low_stock_threshold' => 1,
    ]);
    $base->forceFill([
        'created_at' => PosDate::now()->subMonth()->startOfMonth()->utc(),
        'updated_at' => PosDate::now()->subMonth()->startOfMonth()->utc(),
    ])->save();
    $deal = Product::create([
        'name' => 'Altan Gobi 1+1',
        'category' => 'Special',
        'price' => 10000,
        'is_active' => true,
        'stock_quantity' => 0,
        'low_stock_threshold' => 1,
        'deal_product_id' => $base->id,
        'deal_buy_qty' => 1,
        'deal_get_qty' => 1,
    ]);

    $day = PosDate::now()->toDateString();
    $checkout = CheckoutSession::create(['status' => CheckoutSession::STATUS_OPEN]);
    $item = CheckoutSessionItem::create([
        'checkout_session_id' => $checkout->id,
        'product_id' => $deal->id,
        'product_name' => $deal->name,
        'quantity' => 1,
        'unit_price' => 10000,
        'total_price' => 10000,
    ]);
    $item->forceFill(['created_at' => PosDate::day($day)->setTime(15, 0)->utc()])->save();

    $report = InventoryReport::build(PosDate::day($day), PosDate::day($day)->endOfDay());
    $row = collect($report['rows'])->firstWhere('name', 'Altan Gobi');

    expect($row)->not->toBeNull()
        ->and($row['at_start'])->toBe(10)
        ->and($row['initial'])->toBe(0)
        ->and($row['taken'])->toBe(2)
        ->and($row['at_end'])->toBe(8)
        ->and($row['change'])->toBe(-2);

    $monthStart = PosDate::now()->subMonth()->startOfMonth();
    $created = InventoryReport::build($monthStart, $monthStart->endOfMonth());
    $createdRow = collect($created['rows'])->firstWhere('name', 'Altan Gobi');
    expect($createdRow['initial'])->toBe(10)
        ->and($created['initials'])->not->toBeEmpty();

    $this->actingAs($admin)
        ->get(route('stock.download', ['period' => 'monthly', 'month' => PosDate::now()->format('Y-m')]))
        ->assertOk();

    app()->setLocale('mn');
    $html = view('pdf.inventory', [
        ...$report,
        'closingLabel' => $report['closing_label'],
        'start' => PosDate::day($day),
        'end' => PosDate::day($day)->endOfDay(),
        'timezone' => PosDate::timezone(),
        'period' => 'daily',
    ])->render();
    expect($html)->toContain('Өдрийн нөөцийн тайлан', 'Эхний үлдэгдэл', 'Altan Gobi')
        ->not->toContain('At start', 'By product', 'First stock', 'Later stock changes');
});
