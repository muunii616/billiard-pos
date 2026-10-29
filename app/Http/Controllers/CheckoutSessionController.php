<?php

namespace App\Http\Controllers;

use App\Models\CheckoutSession;
use App\Models\CheckoutSessionItem;
use App\Models\GameSession;
use App\Models\Product;
use App\Models\Receipt;
use App\Models\ReceiptPayment;
use App\Support\CheckoutBalance;
use App\Support\InventoryService;
use App\Support\PaymentPayload;
use App\Support\PosItemUpserter;
use App\Support\PosTransaction;
use App\Support\ProductDeal;
use App\Support\ReceiptLineItemSnapshot;
use App\Support\ReceiptPresenter;
use App\Support\TableTimeBilling;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class CheckoutSessionController extends Controller
{
    /** Compute time_total, items_total, grand_total for a checkout session. */
    private function checkoutTotals(CheckoutSession $checkout): array
    {
        $checkout->loadMissing(['gameSessions.items', 'items']);
        $timeTotal = (float) $checkout->gameSessions->sum('time_total');
        $sessionItemsTotal = (float) $checkout->gameSessions->sum(fn ($s) => $s->items->sum('total_price'));
        $tabItemsTotal = (float) $checkout->items->sum('total_price');
        $itemsTotal = round($sessionItemsTotal + $tabItemsTotal, 2);
        $grandTotal = round(max(0, $timeTotal + $itemsTotal), 2);

        return [
            'time_total' => $timeTotal,
            'items_total' => $itemsTotal,
            'grand_total' => $grandTotal,
        ];
    }

    /** @return array<int, array<string, mixed>> */
    private function mapTableSessions(CheckoutSession $checkout): array
    {
        $checkout->loadMissing(['gameSessions.table', 'gameSessions.items']);

        return $checkout->gameSessions->map(fn (GameSession $s) => [
            'id' => $s->id,
            'table_name' => $s->table->name ?? 'Table',
            'started_at' => $s->started_at?->copy()->setTimezone(config('app.display_timezone'))->toIso8601String(),
            'ended_at' => $s->ended_at?->copy()->setTimezone(config('app.display_timezone'))->toIso8601String(),
            'played_seconds' => (int) $s->total_played_seconds,
            'time_total' => (float) $s->time_total,
            'time_blocks' => is_array($s->time_blocks) ? $s->time_blocks : [],
            'products_total' => (float) $s->items->sum('total_price'),
            'items' => $s->items->map(fn ($i) => [
                'id' => $i->id,
                'product_name' => $i->product_name,
                'quantity' => (int) $i->quantity,
                'unit_price' => (float) $i->unit_price,
                'total_price' => (float) $i->total_price,
            ])->values()->all(),
        ])->values()->all();
    }

    public function index(Request $request): Response
    {
        $isAdmin = $request->user()?->role === 'admin';
        $includeAll = $isAdmin && $request->boolean('all');

        $checkoutsQuery = CheckoutSession::with(['gameSessions.table', 'gameSessions.items', 'items'])
            ->when(! $includeAll, fn ($q) => $q->open())
            ->when($includeAll, fn ($q) => $q->where('status', '!=', 'merged'))
            ->orderByDesc('id')
            ->get()
            ->map(function (CheckoutSession $c) {
                $totals = $this->checkoutTotals($c);
                $amountPaid = CheckoutBalance::amountPaid($c);
                $remaining = CheckoutBalance::remaining($totals['grand_total'], $amountPaid);
                $tableNames = $c->gameSessions->map(fn ($s) => $s->table->name ?? 'Table')->unique()->values()->all();

                return [
                    'id' => $c->id,
                    'status' => $c->status,
                    'created_at' => $c->created_at->toIso8601String(),
                    'latest_tab_at' => ($c->latest_tab_at ?? $c->created_at)->toIso8601String(),
                    'table_names' => $tableNames,
                    'time_total' => $totals['time_total'],
                    'items_total' => $totals['items_total'],
                    'grand_total' => $totals['grand_total'],
                    'amount_paid' => $amountPaid,
                    'remaining' => $remaining,
                    'tab_items' => $c->items->map(fn ($i) => [
                        'id' => $i->id,
                        'product_id' => $i->product_id,
                        'created_at' => $i->created_at->toIso8601String(),
                        'product_name' => $i->product_name,
                        'product_category' => $i->product_category,
                        'quantity' => $i->quantity,
                        'unit_price' => (float) $i->unit_price,
                        'total_price' => (float) $i->total_price,
                    ])->values()->all(),
                    'table_sessions' => $this->mapTableSessions($c),
                ];
            });

        $receipt = session('receipt');
        if ($receipt !== null) {
            request()->session()->forget('receipt');
        }

        return Inertia::render('checkouts/index', [
            'checkouts' => $checkoutsQuery,
            'products' => Product::where('is_active', true)
                ->with('dealProduct:id,name,stock_quantity')
                ->orderBy('name')
                ->get()
                ->map(fn (Product $product) => ProductDeal::posPayload($product)),
            'timeBlocks' => TableTimeBilling::blocks(),
            'receipt' => $receipt,
            'isAdmin' => $isAdmin,
        ]);
    }

    /** Lightweight list of open tabs for selectors (e.g., move session to existing tab). */
    public function options()
    {
        $checkouts = CheckoutSession::with('gameSessions.table')
            ->open()
            ->orderByDesc('id')
            ->get()
            ->map(function (CheckoutSession $c) {
                $tableNames = $c->gameSessions->map(fn ($s) => $s->table->name ?? 'Table')->unique()->values()->all();

                return [
                    'id' => $c->id,
                    'label' => 'Tab #'.$c->id.' — '.(empty($tableNames) ? 'No tables yet' : implode(', ', $tableNames)),
                ];
            });

        return response()->json($checkouts);
    }

    /** JSON summary for payment modal (same shape as table checkout-summary). */
    public function summary(CheckoutSession $checkout)
    {
        if (! $checkout->isOpen()) {
            abort(404);
        }
        $totals = $this->checkoutTotals($checkout);
        $amountPaid = CheckoutBalance::amountPaid($checkout);
        $remaining = CheckoutBalance::remaining($totals['grand_total'], $amountPaid);
        $checkout->load('gameSessions.table');
        $tableNames = $checkout->gameSessions->map(fn ($s) => $s->table->name ?? 'Table')->unique()->values()->all();

        return response()->json([
            'checkout_id' => $checkout->id,
            'table_name' => implode(', ', $tableNames),
            'time_total' => $totals['time_total'],
            'items_total' => $totals['items_total'],
            'grand_total' => $totals['grand_total'],
            'amount_paid' => $amountPaid,
            'remaining' => $remaining,
            'table_sessions' => $this->mapTableSessions($checkout),
            'tab_items' => $checkout->items->map(fn ($i) => [
                'id' => $i->id,
                'created_at' => $i->created_at->toIso8601String(),
                'product_id' => $i->product_id,
                'product_name' => $i->product_name,
                'product_category' => $i->product_category,
                'quantity' => $i->quantity,
                'unit_price' => (float) $i->unit_price,
                'total_price' => (float) $i->total_price,
            ])->values()->all(),
            'time_blocks_catalog' => TableTimeBilling::blocks(),
        ]);
    }

    public function addItem(Request $request, CheckoutSession $checkout)
    {
        return PosTransaction::checkout($checkout, function (CheckoutSession $checkout) use ($request) {
            if (! $checkout->isOpen()) {
                throw ValidationException::withMessages(['checkout' => 'This tab is already closed.']);
            }

            $data = $request->validate([
                'product_id' => ['required', 'exists:products,id'],
                'quantity' => ['required', 'integer', 'min:1'],
            ]);

            DB::transaction(function () use ($checkout, $data) {
                InventoryService::deduct([$data]);
                $this->addProductToCheckout($checkout, (int) $data['product_id'], (int) $data['quantity']);
            });

            return redirect()->back();
        });
    }

    public function addItemsBulk(Request $request, CheckoutSession $checkout)
    {
        return PosTransaction::checkout($checkout, function (CheckoutSession $checkout) use ($request) {
            if (! $checkout->isOpen()) {
                throw ValidationException::withMessages(['checkout' => 'This tab is already closed.']);
            }

            $data = $request->validate([
                'items' => ['required', 'array', 'min:1'],
                'items.*.product_id' => ['required', 'exists:products,id'],
                'items.*.quantity' => ['required', 'integer', 'min:1'],
            ]);

            DB::transaction(function () use ($checkout, $data) {
                InventoryService::deduct($data['items']);
                foreach ($data['items'] as $item) {
                    $this->addProductToCheckout($checkout, (int) $item['product_id'], (int) $item['quantity']);
                }
            });

            return redirect()->back();
        });
    }

    /** Create a products-only open tab and attach provided items. */
    public function createFromProducts(Request $request)
    {
        $data = $request->validate([
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'exists:products,id'],
            'items.*.quantity' => ['required', 'integer', 'min:1'],
        ]);

        $checkout = DB::transaction(function () use ($data) {
            $checkout = CheckoutSession::create(['status' => CheckoutSession::STATUS_OPEN]);
            InventoryService::deduct($data['items']);
            foreach ($data['items'] as $item) {
                $this->addProductToCheckout($checkout, (int) $item['product_id'], (int) $item['quantity']);
            }

            return $checkout;
        }, 3);

        return response()->json([
            'checkout_id' => $checkout->id,
        ]);
    }

    private function addProductToCheckout(CheckoutSession $checkout, int $productId, int $quantity): void
    {
        $product = Product::findOrFail($productId);
        PosItemUpserter::upsertProduct($checkout, $product, $quantity);
    }

    public function complete(Request $request, CheckoutSession $checkout)
    {
        return PosTransaction::checkout($checkout, function (CheckoutSession $checkout) use ($request) {
            if (! $checkout->isOpen()) {
                throw ValidationException::withMessages(['checkout' => 'This tab is already closed.']);
            }

            $totals = $this->checkoutTotals($checkout);
            $grandTotal = $totals['grand_total'];
            $timeTotal = $totals['time_total'];
            $itemsTotal = $totals['items_total'];
            $amountPaid = CheckoutBalance::amountPaid($checkout);
            $remaining = CheckoutBalance::remaining($grandTotal, $amountPaid);

            $normalizedPayments = PaymentPayload::normalizeTowardBalance(
                PaymentPayload::fromRequest($request),
                $remaining,
            );
            if ($normalizedPayments['error'] === 'payment_required') {
                throw ValidationException::withMessages(['payments' => 'Enter a payment amount.']);
            }
            if ($normalizedPayments['error'] === 'card_transfer_exceeds') {
                throw ValidationException::withMessages(['payments' => 'Card and transfer combined cannot exceed the remaining balance.']);
            }
            $validPayments = $normalizedPayments['payments'];
            $applied = (float) $normalizedPayments['applied'];
            $closes = (bool) $normalizedPayments['closes'];

            $customerEmail = $request->input('customer_email') ? trim((string) $request->input('customer_email')) : null;
            if ($customerEmail !== null && $customerEmail === '') {
                $customerEmail = null;
            }

            $receiptId = null;
            // Persist checkout timestamps in UTC; convert only when presenting them.
            $endedAt = now('UTC');

            DB::transaction(function () use (
                $checkout,
                $timeTotal,
                $itemsTotal,
                $amountPaid,
                $remaining,
                $applied,
                $closes,
                $validPayments,
                $customerEmail,
                $endedAt,
                &$receiptId
            ) {
                if ($closes) {
                    $receiptTimeTotal = $amountPaid > 0.01 ? 0.0 : $timeTotal;
                    $receiptProductsTotal = $amountPaid > 0.01 ? 0.0 : $itemsTotal;
                    $receiptGrandTotal = $remaining;
                } else {
                    $receiptTimeTotal = 0.0;
                    $receiptProductsTotal = 0.0;
                    $receiptGrandTotal = $applied;
                }

                $receipt = Receipt::create([
                    'checkout_session_id' => $checkout->id,
                    'receipt_number' => 'R-'.Str::ulid(),
                    'time_total' => $receiptTimeTotal,
                    'products_total' => $receiptProductsTotal,
                    'grand_total' => $receiptGrandTotal,
                    'customer_email' => $customerEmail,
                    'paid_at' => $receiptGrandTotal > 0 ? $endedAt : null,
                    'status' => $receiptGrandTotal > 0 ? 'paid' : 'unpaid',
                ]);
                $receiptId = $receipt->id;
                foreach ($validPayments as $p) {
                    ReceiptPayment::create([
                        'receipt_id' => $receipt->id,
                        'method' => $p['method'],
                        'amount' => $p['amount'],
                    ]);
                }

                if ($closes) {
                    $checkout->update(['status' => 'completed', 'completed_at' => $endedAt]);
                }
            });

            $receipt = Receipt::findOrFail($receiptId);

            if ($closes && $amountPaid <= 0.01) {
                $invoicePayload = ReceiptPresenter::payload($receipt);
                ReceiptLineItemSnapshot::ensureFromPayload($receipt, $invoicePayload['line_items']);
            } else {
                $lineItems = [[
                    'type' => $closes ? 'balance' : 'partial',
                    'description' => $closes
                        ? 'Balance payment · Tab #'.$checkout->id
                        : 'Partial payment · Tab #'.$checkout->id,
                    'quantity' => 1,
                    'unit_price' => $applied,
                    'subtotal' => $applied,
                    'tab_total' => $grandTotal,
                    'previously_paid' => $amountPaid,
                    'remaining_after' => $closes ? 0.0 : round(max(0, $remaining - $applied), 2),
                ]];
                ReceiptLineItemSnapshot::ensureFromPayload($receipt, $lineItems);
                $invoicePayload = ReceiptPresenter::payload($receipt->fresh('lineItems'));
            }

            $message = $closes ? 'Payment completed.' : 'Partial payment recorded.';

            if ($request->expectsJson()) {
                return response()->json([
                    'message' => $message,
                    'receipt' => $invoicePayload,
                    'partial' => ! $closes,
                    'remaining' => $closes ? 0.0 : round(max(0, $remaining - $applied), 2),
                ]);
            }

            return redirect()->route('checkouts.index')->with('receipt', $invoicePayload)->with('message', $message);
        });
    }

    /** Merge multiple open checkout sessions into a single target session. */
    public function merge(Request $request)
    {
        $data = $request->validate([
            'target_id' => ['required', 'integer', 'exists:checkout_sessions,id'],
            'source_ids' => ['required', 'array', 'min:1'],
            'source_ids.*' => ['integer', 'different:target_id'],
        ]);

        return DB::transaction(function () use ($data) {
            $ids = collect($data['source_ids'])->push($data['target_id'])->map(fn ($id) => (int) $id)->unique()->sort()->values();
            $checkouts = CheckoutSession::query()->whereIn('id', $ids)->orderBy('id')->lockForUpdate()->get();
            if ($checkouts->count() !== $ids->count() || $checkouts->contains(fn ($checkout) => ! $checkout->isOpen())) {
                throw ValidationException::withMessages(['merge' => 'All selected tabs must still be open.']);
            }
            $target = $checkouts->firstWhere('id', (int) $data['target_id']);
            $sources = $checkouts->where('id', '!=', $target->id);
            if ($sources->isEmpty()) {
                throw ValidationException::withMessages(['merge' => 'Select at least one other tab to merge.']);
            }
            $latestTabAt = $checkouts->map(fn (CheckoutSession $checkout) => $checkout->latest_tab_at ?? $checkout->created_at)->max();
            $target->update(['latest_tab_at' => $latestTabAt]);

            foreach ($sources as $source) {
                foreach ($source->gameSessions as $session) {
                    $session->update(['checkout_session_id' => $target->id]);
                }

                foreach ($source->items as $item) {
                    $itemDay = $item->created_at->copy()->setTimezone(config('app.display_timezone'))->startOfDay();
                    $existing = CheckoutSessionItem::query()
                        ->where('checkout_session_id', $target->id)
                        // Keep separate lines for products added on different business days.
                        ->where('created_at', '>=', $itemDay->copy()->utc())
                        ->where('created_at', '<', $itemDay->copy()->addDay()->utc())
                        ->when(
                            $item->product_id !== null,
                            fn ($query) => $query->where('product_id', $item->product_id)->where('unit_price', $item->unit_price),
                            fn ($query) => $query
                                ->whereNull('product_id')
                                ->where('product_name', $item->product_name)
                                ->where('product_category', $item->product_category)
                                ->where('unit_price', $item->unit_price),
                        )
                        ->first();

                    if ($existing) {
                        $existing->quantity += $item->quantity;
                        $existing->total_price = $existing->quantity * $existing->unit_price;
                        $existing->save();
                        $item->delete();
                    } else {
                        $item->update(['checkout_session_id' => $target->id]);
                    }
                }

                // Keep partial payments with the surviving tab so remaining balance stays correct.
                Receipt::query()
                    ->where('checkout_session_id', $source->id)
                    ->where('status', 'paid')
                    ->update(['checkout_session_id' => $target->id]);

                $source->update(['status' => 'merged']);
            }

            return redirect()->route('checkouts.index')->with('message', 'Tabs merged successfully.');
        }, 3);
    }
}
