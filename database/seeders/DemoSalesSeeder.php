<?php

namespace Database\Seeders;

use App\Models\BilliardTable;
use App\Models\CheckoutSession;
use App\Models\GameSession;
use App\Models\Product;
use App\Models\Receipt;
use App\Models\ReceiptPayment;
use App\Models\SessionItem;
use App\Models\User;
use App\Support\TableTimeBilling;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class DemoSalesSeeder extends Seeder
{
    private const DEMO_YEAR = 2026;

    public function run(): void
    {
        $staff = User::query()->where('email', 'employee@billiardpos.test')->first()
            ?? User::query()->first();

        if (! $staff) {
            throw new RuntimeException('Demo sales require at least one user. Run UserSeeder first.');
        }

        $products = Product::query()
            ->whereIn('name', ['Cola', 'Water', 'Chips', 'Nachos', 'Snack & Drinks Set'])
            ->get()
            ->keyBy('name');

        if ($products->count() !== 5) {
            throw new RuntimeException('Demo sales products are missing. Run ProductSeeder first.');
        }

        $tables = collect([
            BilliardTable::query()->firstOrCreate(
                ['name' => 'Demo Table 1'],
                ['status' => 'available'],
            ),
            BilliardTable::query()->firstOrCreate(
                ['name' => 'Demo Table 2'],
                ['status' => 'available'],
            ),
        ]);

        DB::transaction(function () use ($staff, $products, $tables): void {
            $this->removeExistingDemoSales();

            foreach ($this->salesDates() as $index => $paidAt) {
                $minutes = 40 + (($index * 13) % 81);
                $hourBlocks = intdiv($minutes, 60);
                $remainder = $minutes % 60;
                $thirtyBlocks = intdiv($remainder, 30);
                $remainder %= 30;
                $fifteenBlocks = (int) ceil($remainder / 15);
                $counts = TableTimeBilling::normalizeCounts([
                    '60' => $hourBlocks,
                    '30' => $thirtyBlocks,
                    '15' => $fifteenBlocks,
                ]);
                if ($counts === []) {
                    $counts = ['15' => 1];
                }
                $timeTotal = TableTimeBilling::totalForBlocks($counts);
                $billedMinutes = TableTimeBilling::totalMinutesForBlocks($counts);
                $table = $tables[$index % $tables->count()];

                $session = GameSession::query()->create([
                    'billiard_table_id' => $table->id,
                    'user_id' => $staff->id,
                    'status' => 'completed',
                    'started_at' => $paidAt->copy()->subMinutes($minutes),
                    'last_resume_at' => null,
                    'total_played_seconds' => $minutes * 60,
                    'ended_at' => $paidAt,
                    'total_minutes' => $billedMinutes,
                    'time_total' => $timeTotal,
                    'time_blocks' => $counts,
                ]);

                $itemNames = $index % 3 === 0
                    ? ['Cola', 'Chips']
                    : ($index % 3 === 1 ? ['Water', 'Nachos'] : ['Cola', 'Snack & Drinks Set']);
                $productsTotal = 0.0;

                foreach ($itemNames as $itemIndex => $productName) {
                    $product = $products[$productName];
                    $quantity = 1 + (($index + $itemIndex) % 2);
                    $lineTotal = round((float) $product->price * $quantity, 2);
                    $productsTotal += $lineTotal;

                    SessionItem::query()->create([
                        'game_session_id' => $session->id,
                        'product_id' => $product->id,
                        'product_name' => $product->name,
                        'product_category' => $product->category,
                        'quantity' => $quantity,
                        'unit_price' => $product->price,
                        'total_price' => $lineTotal,
                    ]);
                }

                $grandTotal = round($timeTotal + $productsTotal, 2);
                $receipt = Receipt::query()->create([
                    'game_session_id' => $session->id,
                    'receipt_number' => sprintf('DEMO-%d-%04d', self::DEMO_YEAR, $index + 1),
                    'time_total' => $timeTotal,
                    'products_total' => $productsTotal,
                    'grand_total' => $grandTotal,
                    'customer_email' => $index % 4 === 0 ? 'demo@example.com' : null,
                    'paid_at' => $paidAt,
                    'status' => 'paid',
                ]);

                $this->addPayments($receipt, $grandTotal, $index);
            }
        });
    }

    /**
     * January-May contain three representative weekdays per month.
     * June contains a sale for every weekday, with weekends deliberately omitted.
     *
     * @return array<int, Carbon>
     */
    private function salesDates(): array
    {
        $dates = [];

        for ($month = 1; $month <= 5; $month++) {
            $weekdays = $this->weekdaysInMonth($month);
            $positions = [2, intdiv(count($weekdays), 2), count($weekdays) - 3];

            foreach ($positions as $position) {
                $dates[] = $weekdays[$position];
            }
        }

        return [...$dates, ...$this->weekdaysInMonth(6)];
    }

    /** @return array<int, Carbon> */
    private function weekdaysInMonth(int $month): array
    {
        $date = Carbon::create(self::DEMO_YEAR, $month, 1, 18, 0);
        $end = $date->copy()->endOfMonth();
        $weekdays = [];

        while ($date->lte($end)) {
            if ($date->isWeekday()) {
                $weekdays[] = $date->copy()->setTime(17 + ($date->day % 4), 15);
            }

            $date->addDay();
        }

        return $weekdays;
    }

    private function addPayments(Receipt $receipt, float $total, int $index): void
    {
        $methods = ['cash', 'card', 'transfer_qr'];

        if ($index % 5 === 4) {
            $cardAmount = round($total * 0.60, 2);
            ReceiptPayment::query()->create([
                'receipt_id' => $receipt->id,
                'method' => 'card',
                'amount' => $cardAmount,
            ]);
            ReceiptPayment::query()->create([
                'receipt_id' => $receipt->id,
                'method' => 'cash',
                'amount' => round($total - $cardAmount, 2),
            ]);

            return;
        }

        ReceiptPayment::query()->create([
            'receipt_id' => $receipt->id,
            'method' => $methods[$index % count($methods)],
            'amount' => $total,
        ]);
    }

    private function removeExistingDemoSales(): void
    {
        $receipts = Receipt::withTrashed()
            ->where('receipt_number', 'like', 'DEMO-%')
            ->get(['id', 'game_session_id', 'checkout_session_id']);

        $gameSessionIds = $receipts->pluck('game_session_id')->filter()->unique()->values();
        $checkoutSessionIds = $receipts->pluck('checkout_session_id')->filter()->unique()->values();

        Receipt::withTrashed()
            ->whereIn('id', $receipts->pluck('id'))
            ->forceDelete();

        GameSession::query()->whereIn('id', $gameSessionIds)->delete();
        CheckoutSession::query()->whereIn('id', $checkoutSessionIds)->delete();
    }
}
