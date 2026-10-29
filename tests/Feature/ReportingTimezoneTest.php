<?php

use App\Models\CashSession;
use App\Models\Receipt;
use App\Models\User;
use App\Support\ReceiptPresenter;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->actingAs(User::factory()->create(['role' => 'admin']));
});

function reportingReceipt(string $number, string $at, int $amount, string $status = 'paid'): Receipt
{
    $receipt = Receipt::create(['receipt_number' => $number, 'paid_at' => $at, 'status' => $status, 'grand_total' => $amount, 'time_total' => $amount]);
    $receipt->payments()->create(['method' => 'cash', 'amount' => $amount]);

    return $receipt;
}

it('uses the same local business day in overview dashboard and CSV', function () {
    $this->travelTo(now()->setDate(2026, 9, 8)->setTime(1, 0));
    reportingReceipt('before', '2026-09-07 15:59:59', 100);
    reportingReceipt('first', '2026-09-07 16:00:00', 200);
    reportingReceipt('last', '2026-09-08 15:59:59', 300);
    reportingReceipt('after', '2026-09-08 16:00:00', 400);
    reportingReceipt('void', '2026-09-08 01:00:00', 500, 'voided');
    reportingReceipt('unpaid', '2026-09-08 01:00:00', 600, 'unpaid');
    $this->get('/overview?date=2026-09-08')->assertInertia(fn (Assert $page) => $page
        ->where('summary.total_revenue', 500)->where('summary.payments.cash', 500)->has('invoices', 2));
    $this->get('/dashboard')->assertInertia(fn (Assert $page) => $page->where('today.revenue', 500));
    $csv = $this->get('/admin/overview/export/csv?date=2026-09-08')->assertOk()->getContent();
    expect($csv)->toContain('first')->toContain('last')->not->toContain('before')->not->toContain('after')->not->toContain('void')->not->toContain('unpaid');
});

it('defaults to the local date even while UTC is still on the previous day', function () {
    $this->travelTo(now()->setDate(2026, 9, 7)->setTime(17, 0));
    reportingReceipt('local', '2026-09-07 17:00:00', 200);
    $this->get('/overview')->assertInertia(fn (Assert $page) => $page->where('date', '2026-09-08')->where('summary.total_revenue', 200));
});

it('groups income by local year and month and parses February on the 31st', function () {
    $this->travelTo(now()->setDate(2026, 3, 31)->setTime(1, 0));
    reportingReceipt('new-year', '2025-12-31 16:00:00', 100);
    reportingReceipt('february', '2026-01-31 16:00:00', 200);
    reportingReceipt('march', '2026-02-28 16:00:00', 300);
    reportingReceipt('void', '2026-02-01 01:00:00', 500, 'voided');
    $this->get('/overview?mode=monthly&month=2026-02')->assertInertia(fn (Assert $page) => $page
        ->where('summary.total_revenue', 200)->where('charts.monthly_income.0.income', 100)
        ->where('charts.monthly_income.1.income', 200)->where('charts.monthly_income.2.income', 300));
});

it('rejects malformed reporting dates instead of crashing or overflowing', function (string $query) {
    $this->getJson('/overview?'.$query)->assertUnprocessable();
    $this->getJson('/admin/overview/export/csv?'.$query)->assertUnprocessable();
})->with(['mode=monthly&month=2026-13', 'date=2026-02-30', 'mode=unknown']);

it('presents both receipt date and time in the same local timezone', function () {
    $receipt = reportingReceipt('late-utc', '2026-09-07 17:00:00', 200);
    $payload = ReceiptPresenter::payload($receipt);
    expect($payload['date'])->toBe('08-09-2026')->and($payload['time'])->toBe('01:00:00 AM');
});

it('filters cash shift history by local opening month', function () {
    foreach (['2026-08-31 15:59:59', '2026-08-31 16:00:00'] as $openedAt) {
        CashSession::create(['status' => 'closed', 'opening_cash' => 0, 'opened_at' => $openedAt, 'closed_at' => '2026-09-01 01:00:00']);
    }
    $this->getJson('/admin/cash/current?month=2026-09')->assertOk()->assertJsonPath('history.total', 1);
});
