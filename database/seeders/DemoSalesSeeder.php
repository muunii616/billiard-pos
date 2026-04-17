<?php

namespace Database\Seeders;

use App\Models\BilliardTable;
use App\Models\CheckoutSession;
use App\Models\CheckoutSessionItem;
use App\Models\GameSession;
use App\Models\Product;
use App\Models\Receipt;
use App\Models\ReceiptPayment;
use App\Models\SessionItem;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

class DemoSalesSeeder extends Seeder
{
    public function run(): void
    {
        // Safe re-run: keep existing demo data stable.
        if (Receipt::query()->where('receipt_number', 'DEMO-1001')->exists()) {
            return;
        }

        $staff = User::query()->where('email', 'employee@billiardpos.test')->first()
            ?? User::query()->first();

        if (! $staff) {
            return;
        }

        $table1 = BilliardTable::query()->firstOrCreate(
            ['name' => 'Demo Table 1'],
            ['status' => 'available'],
        );
        $table2 = BilliardTable::query()->firstOrCreate(
            ['name' => 'Demo Table 2'],
            ['status' => 'available'],
        );

        $cola = Product::query()->where('name', 'Cola')->first();
        $water = Product::query()->where('name', 'Water')->first();
        $chips = Product::query()->where('name', 'Chips')->first();
        $nachos = Product::query()->where('name', 'Nachos')->first();
        $set = Product::query()->where('name', 'Snack & Drinks Set')->first();

        if (! $cola || ! $water || ! $chips || ! $nachos || ! $set) {
            return;
        }

        $todayMorning = Carbon::today()->setHour(11)->setMinute(15);
        $yesterdayEvening = Carbon::yesterday()->setHour(20)->setMinute(30);
        $fiveDaysAgo = Carbon::now()->subDays(5)->setHour(18)->setMinute(0);

        // Session-only receipt (daily view and payment breakdown)
        $sessionA = GameSession::query()->create([
            'billiard_table_id' => $table1->id,
            'user_id' => $staff->id,
            'status' => 'completed',
            'started_at' => $todayMorning->copy()->subMinutes(45),
            'last_resume_at' => null,
            'total_played_seconds' => 45 * 60,
            'ended_at' => $todayMorning,
            'total_minutes' => 45,
            'time_total' => 9.00,
        ]);

        SessionItem::query()->create([
            'game_session_id' => $sessionA->id,
            'product_id' => $cola->id,
            'product_name' => $cola->name,
            'product_category' => $cola->category,
            'quantity' => 2,
            'unit_price' => 3.00,
            'total_price' => 6.00,
        ]);
        SessionItem::query()->create([
            'game_session_id' => $sessionA->id,
            'product_id' => $chips->id,
            'product_name' => $chips->name,
            'product_category' => $chips->category,
            'quantity' => 1,
            'unit_price' => 1.00,
            'total_price' => 1.00,
        ]);

        $receiptA = Receipt::query()->create([
            'game_session_id' => $sessionA->id,
            'receipt_number' => 'DEMO-1001',
            'time_total' => 9.00,
            'products_total' => 7.00,
            'grand_total' => 16.00,
            'customer_email' => 'demo1@example.com',
            'paid_at' => $todayMorning,
            'status' => 'paid',
        ]);
        ReceiptPayment::query()->create([
            'receipt_id' => $receiptA->id,
            'method' => 'cash',
            'amount' => 16.00,
        ]);

        // Checkout receipt with mixed payment methods
        $checkout = CheckoutSession::query()->create([
            'status' => 'completed',
            'completed_at' => $yesterdayEvening,
        ]);

        $sessionB = GameSession::query()->create([
            'billiard_table_id' => $table2->id,
            'checkout_session_id' => $checkout->id,
            'user_id' => $staff->id,
            'status' => 'completed',
            'started_at' => $yesterdayEvening->copy()->subMinutes(60),
            'last_resume_at' => null,
            'total_played_seconds' => 60 * 60,
            'ended_at' => $yesterdayEvening,
            'total_minutes' => 60,
            'time_total' => 12.00,
        ]);

        SessionItem::query()->create([
            'game_session_id' => $sessionB->id,
            'product_id' => $water->id,
            'product_name' => $water->name,
            'product_category' => $water->category,
            'quantity' => 2,
            'unit_price' => 1.50,
            'total_price' => 3.00,
        ]);
        SessionItem::query()->create([
            'game_session_id' => $sessionB->id,
            'product_id' => $nachos->id,
            'product_name' => $nachos->name,
            'product_category' => $nachos->category,
            'quantity' => 1,
            'unit_price' => 4.50,
            'total_price' => 4.50,
        ]);

        CheckoutSessionItem::query()->create([
            'checkout_session_id' => $checkout->id,
            'product_id' => $set->id,
            'product_name' => $set->name,
            'product_category' => $set->category,
            'quantity' => 1,
            'unit_price' => 10.00,
            'total_price' => 10.00,
        ]);

        $receiptB = Receipt::query()->create([
            'checkout_session_id' => $checkout->id,
            'receipt_number' => 'DEMO-1002',
            'time_total' => 12.00,
            'products_total' => 17.50,
            'grand_total' => 29.50,
            'customer_email' => 'demo2@example.com',
            'paid_at' => $yesterdayEvening,
            'status' => 'paid',
        ]);
        ReceiptPayment::query()->create([
            'receipt_id' => $receiptB->id,
            'method' => 'card',
            'amount' => 20.00,
        ]);
        ReceiptPayment::query()->create([
            'receipt_id' => $receiptB->id,
            'method' => 'transfer_qr',
            'amount' => 9.50,
        ]);

        // Older monthly data point for charts
        $checkoutC = CheckoutSession::query()->create([
            'status' => 'completed',
            'completed_at' => $fiveDaysAgo,
        ]);

        CheckoutSessionItem::query()->create([
            'checkout_session_id' => $checkoutC->id,
            'product_id' => $cola->id,
            'product_name' => $cola->name,
            'product_category' => $cola->category,
            'quantity' => 3,
            'unit_price' => 3.00,
            'total_price' => 9.00,
        ]);
        CheckoutSessionItem::query()->create([
            'checkout_session_id' => $checkoutC->id,
            'product_id' => $chips->id,
            'product_name' => $chips->name,
            'product_category' => $chips->category,
            'quantity' => 2,
            'unit_price' => 1.00,
            'total_price' => 2.00,
        ]);

        $receiptC = Receipt::query()->create([
            'checkout_session_id' => $checkoutC->id,
            'receipt_number' => 'DEMO-1003',
            'time_total' => 0.00,
            'products_total' => 11.00,
            'grand_total' => 11.00,
            'customer_email' => null,
            'paid_at' => $fiveDaysAgo,
            'status' => 'paid',
        ]);
        ReceiptPayment::query()->create([
            'receipt_id' => $receiptC->id,
            'method' => 'cash',
            'amount' => 11.00,
        ]);
    }
}
