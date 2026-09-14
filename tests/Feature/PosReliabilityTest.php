<?php

use App\Http\Controllers\Admin\CheckoutAdminController;
use App\Http\Controllers\CheckoutSessionController;
use App\Http\Controllers\TableController;
use App\Models\BilliardTable;
use App\Models\CheckoutSession;
use App\Models\GameSession;
use App\Models\Product;
use App\Models\Receipt;
use App\Models\ReceiptLineItem;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Validation\ValidationException;

beforeEach(function () {
    $this->actingAs(User::factory()->create(['role' => 'admin']));
    $this->product = Product::create(['name' => 'Cola', 'category' => 'Drinks', 'price' => 1000, 'stock_quantity' => 10, 'is_active' => true]);
});

function reliabilityTab($test, int $quantity = 2): CheckoutSession
{
    $response = $test->postJson('/checkouts/from-products', ['items' => [['product_id' => $test->product->id, 'quantity' => $quantity]]])->assertOk();

    return CheckoutSession::findOrFail($response->json('checkout_id'));
}

it('rolls back the entire new tab when any product has insufficient stock', function () {
    $other = Product::create(['name' => 'Unavailable', 'category' => 'Snacks', 'price' => 2000, 'stock_quantity' => 0]);
    $this->postJson('/checkouts/from-products', ['items' => [
        ['product_id' => $this->product->id, 'quantity' => 2], ['product_id' => $other->id, 'quantity' => 1],
    ]])->assertUnprocessable();
    expect(CheckoutSession::count())->toBe(0)->and($this->product->fresh()->stock_quantity)->toBe(10);
});

it('reopens the same voided tab and reserves stock exactly once', function () {
    $tab = reliabilityTab($this);
    $this->postJson('/admin/checkouts/'.$tab->id.'/void')->assertOk();
    expect($this->product->fresh()->stock_quantity)->toBe(10);
    $this->postJson('/admin/checkouts/'.$tab->id.'/reopen')->assertOk()->assertJsonPath('checkout_id', $tab->id);
    $this->postJson('/admin/checkouts/'.$tab->id.'/reopen')->assertUnprocessable();
    expect($this->product->fresh()->stock_quantity)->toBe(8)->and(CheckoutSession::count())->toBe(1);
    $stale = $tab->fresh();
    $this->postJson('/admin/checkouts/'.$tab->id.'/void')->assertOk();
    expect(app(CheckoutAdminController::class)->void(Request::create('/', 'POST', []), $stale)->getStatusCode())->toBe(422);
    expect($this->product->fresh()->stock_quantity)->toBe(10);
});

it('leaves a voided tab unchanged when its stock is no longer available', function () {
    $tab = reliabilityTab($this);
    $this->postJson('/admin/checkouts/'.$tab->id.'/void')->assertOk();
    $this->product->update(['stock_quantity' => 1]);
    $this->postJson('/admin/checkouts/'.$tab->id.'/reopen')->assertUnprocessable();
    expect($tab->fresh()->status)->toBe('voided')->and($this->product->fresh()->stock_quantity)->toBe(1)->and(CheckoutSession::count())->toBe(1);
});

it('reopens a completed bill without charging stock twice and replaces its settlement', function () {
    $tab = reliabilityTab($this);
    $this->postJson('/checkouts/'.$tab->id.'/complete', ['payments' => [['method' => 'cash', 'amount' => 2000]]])->assertOk();
    $original = Receipt::firstOrFail();
    $this->postJson('/admin/checkouts/'.$tab->id.'/reopen')->assertOk();
    expect($original->fresh()->status)->toBe('voided')->and($this->product->fresh()->stock_quantity)->toBe(8);
    $this->postJson('/checkouts/'.$tab->id.'/complete', ['payments' => [['method' => 'cash', 'amount' => 2000]]])->assertOk();
    expect(Receipt::count())->toBe(2)->and(Receipt::paid()->count())->toBe(1)->and($this->product->fresh()->stock_quantity)->toBe(8);
});

it('reserves products from table sessions as well as tab items when reopening', function () {
    $tab = reliabilityTab($this);
    $table = BilliardTable::create(['name' => 'Table 1', 'status' => 'available']);
    $session = GameSession::create(['billiard_table_id' => $table->id, 'checkout_session_id' => $tab->id, 'user_id' => auth()->id(), 'status' => 'completed', 'started_at' => now()->subHour(), 'ended_at' => now(), 'time_total' => 20000]);
    $session->items()->create(['product_id' => $this->product->id, 'product_name' => 'Cola', 'quantity' => 1, 'unit_price' => 1000, 'total_price' => 1000]);
    $this->product->decrement('stock_quantity');
    $this->postJson('/admin/checkouts/'.$tab->id.'/void')->assertOk();
    $this->postJson('/admin/checkouts/'.$tab->id.'/reopen')->assertOk();
    expect($this->product->fresh()->stock_quantity)->toBe(7)->and($session->fresh()->checkout_session_id)->toBe($tab->id);
});

it('rechecks stale checkout objects before payment or item changes', function () {
    $tab = reliabilityTab($this);
    $stale = $tab->fresh();
    $payload = ['payments' => [['method' => 'cash', 'amount' => 2000]]];
    $this->postJson('/checkouts/'.$tab->id.'/complete', $payload)->assertOk();
    $controller = app(CheckoutSessionController::class);
    expect(fn () => $controller->complete(Request::create('/', 'POST', $payload), $stale))->toThrow(ValidationException::class);
    expect(fn () => $controller->addItem(Request::create('/', 'POST', ['product_id' => $this->product->id, 'quantity' => 1]), $stale))->toThrow(ValidationException::class);
    $this->postJson('/checkouts/'.$tab->id.'/complete', $payload)->assertUnprocessable();
    expect(Receipt::count())->toBe(1)->and($this->product->fresh()->stock_quantity)->toBe(8)->and($tab->items()->sum('quantity'))->toEqual(2);
});

it('rolls back payment if saving the receipt snapshot fails', function () {
    $tab = reliabilityTab($this);
    $event = 'eloquent.creating: '.ReceiptLineItem::class;
    Event::listen($event, fn () => throw new RuntimeException('Snapshot unavailable'));
    $this->withoutExceptionHandling();
    try {
        expect(fn () => $this->postJson('/checkouts/'.$tab->id.'/complete', ['payments' => [['method' => 'cash', 'amount' => 2000]]]))->toThrow(RuntimeException::class, 'Snapshot unavailable');
    } finally {
        Event::forget($event);
    }
    expect(Receipt::count())->toBe(0)->and($tab->fresh()->status)->toBe('open');
});

it('edits existing quantities by stock delta even when addressed by product', function () {
    $tab = reliabilityTab($this);
    $this->putJson('/admin/checkouts/'.$tab->id.'/items', ['items' => [['product_id' => $this->product->id, 'quantity' => 3]]])->assertOk();
    expect($this->product->fresh()->stock_quantity)->toBe(7)->and($tab->items()->sum('quantity'))->toEqual(3);
    $this->putJson('/admin/checkouts/'.$tab->id.'/items', ['items' => [['product_id' => $this->product->id, 'quantity' => 0]]])->assertOk();
    expect($this->product->fresh()->stock_quantity)->toBe(10)->and($tab->items()->count())->toBe(0);
});

it('rejects starting paused or maintenance tables', function (string $status) {
    $table = BilliardTable::create(['name' => 'Blocked', 'status' => $status]);
    $this->post('/tables/'.$table->id.'/start')->assertSessionHasErrors('table');
    expect($table->fresh()->status)->toBe($status)->and(GameSession::count())->toBe(0);
})->with(['paused', 'maintenance', 'running']);

it('rechecks stale table objects and prevents duplicate active sessions', function () {
    $table = BilliardTable::create(['name' => 'Table 1', 'status' => 'available']);
    $stale = $table->fresh();
    $this->post('/tables/'.$table->id.'/start')->assertRedirect();
    $request = Request::create('/', 'POST');
    $request->setUserResolver(fn () => auth()->user());
    expect(fn () => app(TableController::class)->start($request, $stale))->toThrow(ValidationException::class);
    expect($table->sessions()->count())->toBe(1);
});

it('rejects merges containing closed tabs without moving any items', function () {
    $target = reliabilityTab($this, 1);
    $source = reliabilityTab($this, 1);
    $this->postJson('/admin/checkouts/'.$source->id.'/void')->assertOk();
    $this->post('/checkouts/merge', ['target_id' => $target->id, 'source_ids' => [$source->id]])->assertSessionHasErrors('merge');
    expect($target->items()->sum('quantity'))->toEqual(1)->and($source->items()->sum('quantity'))->toEqual(1);
});
