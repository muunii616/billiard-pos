<?php

use App\Models\CashSession;
use App\Models\CashSessionProductStock;
use App\Models\Product;
use App\Models\Receipt;
use App\Models\User;
use Illuminate\Support\Facades\Event;
use Laravel\Fortify\Features;

beforeEach(function () {
    $this->owner = User::factory()->create(['name' => 'Previous Employee', 'role' => 'employee']);
    $this->employee = User::factory()->create(['name' => 'Next Employee', 'role' => 'employee']);
    $this->shift = CashSession::create([
        'opening_cash' => 10000, 'opened_at' => now('UTC')->subHour(),
        'opened_by_user_id' => $this->owner->id, 'status' => 'open',
    ]);
    $this->actingAs($this->employee);
});

test('another employee is prompted and continuing keeps the original owner and totals', function () {
    $this->getJson('/admin/cash/current')->assertOk()->assertJsonPath('needs_handover', true)
        ->assertJsonPath('open_session.opened_by_user_id', $this->owner->id);
    $this->postJson('/admin/cash/continue', ['session_id' => $this->shift->id])->assertOk();
    $this->getJson('/admin/cash/current')->assertJsonPath('needs_handover', false);
    expect(CashSession::count())->toBe(1)
        ->and($this->shift->fresh()->opened_by_user_id)->toBe($this->owner->id)
        ->and((float) $this->shift->fresh()->opening_cash)->toBe(10000.0);
    $this->actingAs($this->owner)->getJson('/admin/cash/current')->assertJsonPath('needs_handover', false);
    $this->actingAs(User::factory()->create())->getJson('/admin/cash/current')->assertJsonPath('needs_handover', true);
});

test('handover closes the previous shift and opens a new one with stock snapshots', function () {
    $product = Product::create(['name' => 'Beer', 'category' => 'Beer', 'price' => 8000, 'stock_quantity' => 4]);
    CashSessionProductStock::create(['cash_session_id' => $this->shift->id, 'product_id' => $product->id, 'opening_stock' => 10]);
    $receipt = Receipt::create(['receipt_number' => 'shift-sale', 'grand_total' => 6000, 'status' => 'paid', 'paid_at' => now()->subMinute()]);
    $receipt->payments()->create(['method' => 'cash', 'amount' => 6000]);
    $response = $this->postJson('/admin/cash/handover', [
        'session_id' => $this->shift->id, 'counted_cash' => 16000, 'opening_cash' => 12000,
    ])->assertOk()->assertJsonPath('session.opened_by_user_id', $this->employee->id);
    $closed = $this->shift->fresh();
    $opened = CashSession::findOrFail($response->json('session.id'));
    expect($closed->status)->toBe('closed')
        ->and($closed->opened_by_user_id)->toBe($this->owner->id)
        ->and($closed->closed_by_user_id)->toBe($this->employee->id)
        ->and((float) $closed->expected_cash)->toBe(16000.0)
        ->and((float) $closed->variance)->toBe(0.0)
        ->and((float) $opened->opening_cash)->toBe(12000.0)
        ->and($opened->opened_at->equalTo($closed->closed_at))->toBeTrue()
        ->and(CashSession::where('status', 'open')->count())->toBe(1);
    $this->assertDatabaseHas('cash_session_product_stocks', ['cash_session_id' => $closed->id, 'closing_stock' => 4]);
    $this->assertDatabaseHas('cash_session_product_stocks', ['cash_session_id' => $opened->id, 'opening_stock' => 4]);
    $this->getJson('/admin/cash/current')->assertJsonPath('needs_handover', false);
});

test('a missing variance reason or opening amount leaves the original shift open', function () {
    $this->postJson('/admin/cash/handover', ['session_id' => $this->shift->id, 'counted_cash' => 9000, 'opening_cash' => 9000])
        ->assertUnprocessable()->assertJsonValidationErrors('variance_reason');
    $this->postJson('/admin/cash/handover', ['session_id' => $this->shift->id, 'counted_cash' => 10000])
        ->assertUnprocessable()->assertJsonValidationErrors('opening_cash');
    expect($this->shift->fresh()->status)->toBe('open')->and(CashSession::count())->toBe(1);
    $this->postJson('/admin/cash/handover', ['session_id' => $this->shift->id, 'counted_cash' => 9000, 'opening_cash' => 9000, 'variance_reason' => 'Counted shortage'])
        ->assertOk();
    expect((float) $this->shift->fresh()->variance)->toBe(-1000.0);
});

test('repeated handover close and continue requests cannot affect the replacement shift', function () {
    $payload = ['session_id' => $this->shift->id, 'counted_cash' => 10000, 'opening_cash' => 10000];
    $this->postJson('/admin/cash/handover', $payload)->assertOk();
    foreach (['handover', 'close', 'continue'] as $action) {
        $this->postJson('/admin/cash/'.$action, $payload)->assertUnprocessable();
    }
    $this->postJson('/admin/cash/open', ['opening_cash' => 10000])->assertUnprocessable();
    expect(CashSession::count())->toBe(2)->and(CashSession::where('status', 'open')->count())->toBe(1);
});

test('cash must be explicitly counted even for zero and closing produces a report link', function () {
    $this->postJson('/admin/cash/close', ['session_id' => $this->shift->id])->assertUnprocessable();
    $this->postJson('/admin/cash/close', ['session_id' => $this->shift->id, 'counted_cash' => 10000])
        ->assertOk()->assertJsonStructure(['receipt_url']);
    $this->postJson('/admin/cash/open', [])->assertUnprocessable();
    $this->postJson('/admin/cash/open', ['opening_cash' => 0])->assertOk();
    $this->getJson('/admin/cash/current')->assertJsonPath('needs_handover', false);
});

test('receipts on the handover boundary belong only to the new shift', function () {
    $this->travelTo(now('UTC')->startOfSecond());
    $at = now('UTC');
    $this->postJson('/admin/cash/handover', ['session_id' => $this->shift->id, 'counted_cash' => 10000, 'opening_cash' => 10000])->assertOk();
    $receipt = Receipt::create(['receipt_number' => 'boundary', 'grand_total' => 5000, 'status' => 'paid', 'paid_at' => $at]);
    $receipt->payments()->create(['method' => 'cash', 'amount' => 5000]);
    $this->travel(2)->seconds();
    $this->getJson('/admin/cash/current')->assertJsonPath('open_session.cash_sales', 5000)
        ->assertJsonPath('history.data.0.cash_sales', 0);
});

test('every login goes to register and resets the previous continue choice', function () {
    $this->post(route('logout'));
    $this->withSession(['url.intended' => '/tables', 'register.continued' => [$this->employee->id, $this->shift->id]])
        ->post(route('login.store'), ['email' => $this->employee->email, 'password' => 'password'])
        ->assertRedirect(route('cash-register.index'))
        ->assertSessionMissing('register.continued')->assertSessionMissing('url.intended');
    $this->getJson('/admin/cash/current')->assertJsonPath('needs_handover', true);
});

test('failure to create the replacement shift rolls back closing the original', function () {
    $this->withoutExceptionHandling();
    $event = 'eloquent.creating: '.CashSession::class;
    Event::listen($event, fn () => throw new RuntimeException('Simulated opening failure'));
    try {
        $this->postJson('/admin/cash/handover', ['session_id' => $this->shift->id, 'counted_cash' => 10000, 'opening_cash' => 10000]);
        $this->fail('The opening failure should propagate.');
    } catch (RuntimeException $exception) {
        expect($exception->getMessage())->toBe('Simulated opening failure');
    } finally {
        Event::forget($event);
    }
    expect($this->shift->fresh()->status)->toBe('open')
        ->and($this->shift->fresh()->closed_at)->toBeNull()
        ->and(CashSession::count())->toBe(1);
});

test('two factor login also lands on the register', function () {
    $this->skipUnlessFortifyFeature(Features::twoFactorAuthentication());
    $this->post(route('logout'));
    $this->employee->forceFill([
        'two_factor_secret' => encrypt('test-secret'),
        'two_factor_recovery_codes' => encrypt(json_encode(['register-recovery'])),
        'two_factor_confirmed_at' => now(),
    ])->save();
    $this->post(route('login.store'), ['email' => $this->employee->email, 'password' => 'password'])->assertRedirect(route('two-factor.login'));
    $this->post('/two-factor-challenge', ['recovery_code' => 'register-recovery'])->assertRedirect(route('cash-register.index'));
});

test('an overnight shift belongs to its local opening month', function () {
    $this->shift->update([
        'status' => 'closed', 'opened_at' => '2026-09-30 15:00:00', 'closed_at' => '2026-09-30 17:00:00',
    ]);
    $this->getJson('/admin/cash/current?month=2026-09')->assertOk()
        ->assertJsonPath('history.total', 1)->assertJsonPath('history.data.0.id', $this->shift->id);
    $this->getJson('/admin/cash/current?month=2026-10')->assertOk()->assertJsonPath('history.total', 0);
});

test('the report filename uses the local opening date without a time', function () {
    $this->shift->update([
        'status' => 'closed', 'opened_at' => '2026-10-20 17:30:00', 'closed_at' => '2026-10-21 17:00:00',
    ]);
    $response = $this->get(route('admin.cash.receipt', $this->shift))->assertOk()
        ->assertHeader('Content-Type', 'application/pdf');
    expect($response->headers->get('Content-Disposition'))->toContain('shift-'.$this->shift->id.'-2026-10-21.pdf');
});

test('history sorts by opening time even when closing times are in another order', function () {
    $this->shift->update(['status' => 'closed', 'opened_at' => '2026-10-20 10:00:00', 'closed_at' => '2026-10-21 11:00:00']);
    $later = CashSession::create(['status' => 'closed', 'opened_at' => '2026-10-20 12:00:00', 'closed_at' => '2026-10-20 13:00:00']);
    $this->getJson('/admin/cash/current')->assertOk()->assertJsonPath('history.data.0.id', $later->id);
});
