<?php

use App\Models\CashSession;
use App\Models\Product;
use App\Models\Receipt;
use App\Models\User;

test('register keeps only the sale cash after returning change', function (array $payments, int $cashRetained, int $cardRetained) {
    $this->travelTo(now('UTC')->startOfSecond());
    $user = User::factory()->create();
    $shift = CashSession::create([
        'status' => 'open',
        'opening_cash' => 10000,
        'opened_at' => now()->subHour(),
        'opened_by_user_id' => $user->id,
    ]);
    $product = Product::create([
        'name' => 'Fuze Tea', 'category' => 'Drinks', 'price' => 5000,
        'stock_quantity' => 10, 'is_active' => true,
    ]);
    $this->actingAs($user)->getJson('/admin/cash/current')
        ->assertOk()->assertJsonPath('open_session.expected_cash', 10000);

    $checkoutId = $this->postJson(route('checkouts.from-products'), [
        'items' => [['product_id' => $product->id, 'quantity' => 1]],
    ])->assertOk()->json('checkout_id');
    $this->postJson(route('checkouts.complete', $checkoutId), ['payments' => $payments])
        ->assertOk()->assertJsonPath('message', 'Payment completed.');

    $receipt = Receipt::where('checkout_session_id', $checkoutId)->sole();
    expect((float) $receipt->payments()->where('method', 'cash')->sum('amount'))->toBe((float) $cashRetained)
        ->and((float) $receipt->grand_total)->toBe(5000.0);

    $this->travel(2)->seconds();
    $this->getJson('/admin/cash/current')->assertOk()
        ->assertJsonPath('open_session.expected_cash', 10000 + $cashRetained)
        ->assertJsonPath('open_session.cash_sales', $cashRetained)
        ->assertJsonPath('open_session.card_sales', $cardRetained)
        ->assertJsonPath('open_session.total_sales', 5000);

    $this->postJson('/admin/cash/close', [
        'session_id' => $shift->id, 'counted_cash' => 10000 + $cashRetained,
    ])->assertOk();
    expect((float) $shift->fresh()->expected_cash)->toBe((float) (10000 + $cashRetained))
        ->and((float) $shift->fresh()->variance)->toBe(0.0);
})->with([
    'twenty thousand cash, fifteen thousand change' => [[['method' => 'cash', 'amount' => 20000]], 5000, 0],
    'UI sends cash already reduced by change' => [[['method' => 'cash', 'amount' => 5000]], 5000, 0],
    'split payment returns change only from cash' => [[['method' => 'cash', 'amount' => 20000], ['method' => 'card', 'amount' => 2000]], 3000, 2000],
]);
