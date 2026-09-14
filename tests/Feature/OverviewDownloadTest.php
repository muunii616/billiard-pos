<?php

use App\Models\Receipt;
use App\Models\User;
use Barryvdh\DomPDF\Facade\Pdf;

it('downloads paid receipts within inclusive local dates', function (array $query) {
    $this->actingAs(User::factory()->create());
    foreach ([
        ['before', '2026-09-02 15:59:59', 'paid', 100],
        ['first', '2026-09-02 16:00:00', 'paid', 200],
        ['last', '2026-09-08 15:59:59', 'paid', 300],
        ['after', '2026-09-08 16:00:00', 'paid', 400],
        ['void', '2026-09-04 10:00:00', 'voided', 500],
    ] as [$number, $paidAt, $status, $total]) {
        Receipt::create(['receipt_number' => $number, 'paid_at' => $paidAt, 'status' => $status,
            'time_total' => $total, 'products_total' => 0, 'grand_total' => $total]);
    }
    Pdf::shouldReceive('loadView')->once()->with('pdf.overview', Mockery::on(function ($data) {
        expect($data['receipts']->pluck('receipt_number')->all())->toBe(['first', 'last']);
        expect((float) $data['receipts']->sum('grand_total'))->toBe(500.0);

        return true;
    }))->andReturnSelf();
    Pdf::shouldReceive('setPaper')->with('a4')->andReturnSelf();
    Pdf::shouldReceive('download')->once()->andReturn(response('pdf'));
    $this->get('/overview/download?'.http_build_query($query))->assertOk();
})->with([
    [['period' => 'range', 'from' => '2026-09-03', 'to' => '2026-09-08']],
]);

it('generates a PDF for a day and a month even with no sales', function (array $query) {
    $this->actingAs(User::factory()->create());
    $response = $this->get('/overview/download?'.http_build_query($query));
    $response->assertOk()->assertHeader('content-type', 'application/pdf');
    expect($response->getContent())->toStartWith('%PDF-');
})->with([
    [['period' => 'daily', 'date' => '2026-09-08']],
    [['period' => 'monthly', 'month' => '2026-09']],
]);

it('rejects reversed ranges and invalid months', function (array $query) {
    $this->actingAs(User::factory()->create());
    $this->getJson('/overview/download?'.http_build_query($query))->assertUnprocessable();
})->with([
    [['period' => 'range', 'from' => '2026-09-08', 'to' => '2026-09-03']],
    [['period' => 'monthly', 'month' => '2026-13']],
]);

it('requires login to download sales', function () {
    $this->get('/overview/download?period=daily&date=2026-09-08')->assertRedirect('/login');
});
