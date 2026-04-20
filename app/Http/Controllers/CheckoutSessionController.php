<?php

namespace App\Http\Controllers;

use App\Models\CheckoutSession;
use App\Models\CheckoutSessionItem;
use App\Models\Product;
use App\Models\Receipt;
use App\Models\ReceiptPayment;
use App\Support\PaymentPayload;
use App\Support\PosItemUpserter;
use App\Support\ReceiptLineItemSnapshot;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class CheckoutSessionController extends Controller
{
    /** Compute time_total, items_total, grand_total for a checkout session. */
    private function checkoutTotals(CheckoutSession $checkout): array
    {
        $checkout->load(['gameSessions.items', 'items']);
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

    public function index(Request $request): Response
    {
        $isAdmin = $request->user()?->role === 'admin';
        $includeAll = $isAdmin && $request->boolean('all');

        // Merged source tabs are not shown as separate rows — their sessions/items moved to the target tab.
        $checkoutsQuery = CheckoutSession::with(['gameSessions.table', 'items'])
            ->when(! $includeAll, fn ($q) => $q->open())
            ->when($includeAll, fn ($q) => $q->where('status', '!=', 'merged'))
            ->orderByDesc('id')
            ->get()
            ->map(function (CheckoutSession $c) {
                $totals = $this->checkoutTotals($c);
                $tableNames = $c->gameSessions->map(fn ($s) => $s->table->name ?? 'Table')->unique()->values()->all();

                return [
                    'id' => $c->id,
                    'status' => $c->status,
                    'created_at' => $c->created_at->toIso8601String(),
                    'table_names' => $tableNames,
                    'time_total' => $totals['time_total'],
                    'items_total' => $totals['items_total'],
                    'grand_total' => $totals['grand_total'],
                ];
            });

        $receipt = session('receipt');
        if ($receipt !== null) {
            request()->session()->forget('receipt');
        }

        return Inertia::render('checkouts/index', [
            'checkouts' => $checkoutsQuery,
            'products' => Product::where('is_active', true)->orderBy('name')->get(['id', 'name', 'price', 'category']),
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
        $checkout->load('gameSessions.table');
        $tableNames = $checkout->gameSessions->map(fn ($s) => $s->table->name ?? 'Table')->unique()->values()->all();

        return response()->json([
            'checkout_id' => $checkout->id,
            'table_name' => implode(', ', $tableNames),
            'time_total' => $totals['time_total'],
            'items_total' => $totals['items_total'],
            'grand_total' => $totals['grand_total'],
            'tab_items' => $checkout->items->map(fn ($i) => [
                'id' => $i->id,
                'product_id' => $i->product_id,
                'product_name' => $i->product_name,
                'product_category' => $i->product_category,
                'quantity' => $i->quantity,
                'unit_price' => (float) $i->unit_price,
                'total_price' => (float) $i->total_price,
            ])->values()->all(),
        ]);
    }

    public function addItem(Request $request, CheckoutSession $checkout)
    {
        if (! $checkout->isOpen()) {
            return back()->withErrors(['checkout' => 'This tab is already closed.']);
        }

        $data = $request->validate([
            'product_id' => ['required', 'exists:products,id'],
            'quantity' => ['required', 'integer', 'min:1'],
        ]);

        $this->addProductToCheckout($checkout, (int) $data['product_id'], (int) $data['quantity']);

        return redirect()->back();
    }

    public function addItemsBulk(Request $request, CheckoutSession $checkout)
    {
        if (! $checkout->isOpen()) {
            return back()->withErrors(['checkout' => 'This tab is already closed.']);
        }

        $data = $request->validate([
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'exists:products,id'],
            'items.*.quantity' => ['required', 'integer', 'min:1'],
        ]);

        foreach ($data['items'] as $item) {
            $this->addProductToCheckout($checkout, (int) $item['product_id'], (int) $item['quantity']);
        }

        return redirect()->back();
    }

    /** Create a products-only open tab and attach provided items. */
    public function createFromProducts(Request $request)
    {
        $data = $request->validate([
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'exists:products,id'],
            'items.*.quantity' => ['required', 'integer', 'min:1'],
        ]);

        $checkout = CheckoutSession::create(['status' => CheckoutSession::STATUS_OPEN]);

        foreach ($data['items'] as $item) {
            $this->addProductToCheckout($checkout, (int) $item['product_id'], (int) $item['quantity']);
        }

        return response()->json([
            'checkout_id' => $checkout->id,
        ]);
    }

    private function addProductToCheckout(CheckoutSession $checkout, int $productId, int $quantity): void
    {
        $product = Product::findOrFail($productId);
        PosItemUpserter::upsertCheckoutProduct($checkout, $product, $quantity, increment: true);
    }

    public function complete(Request $request, CheckoutSession $checkout)
    {
        if (! $checkout->isOpen()) {
            return back()->withErrors(['checkout' => 'This tab is already closed.']);
        }

        $totals = $this->checkoutTotals($checkout);
        $grandTotal = $totals['grand_total'];
        $timeTotal = $totals['time_total'];
        $itemsTotal = $totals['items_total'];

        $normalizedPayments = PaymentPayload::normalizeForTotal(
            PaymentPayload::fromRequest($request),
            $grandTotal,
            allowOverpay: true,
        );
        if ($normalizedPayments['error'] === 'minimum_total_required') {
            return back()->withErrors(['payments' => 'Total paid must be at least the grand total.']);
        }
        if ($normalizedPayments['error'] === 'card_transfer_exceeds') {
            return back()->withErrors(['payments' => 'Card and transfer combined cannot exceed the grand total.']);
        }
        $validPayments = $normalizedPayments['payments'];

        $customerEmail = $request->input('customer_email') ? trim((string) $request->input('customer_email')) : null;
        if ($customerEmail !== null && $customerEmail === '') {
            $customerEmail = null;
        }

        $receiptId = null;
        $endedAt = now();

        DB::transaction(function () use ($checkout, $timeTotal, $itemsTotal, $grandTotal, $validPayments, $customerEmail, $endedAt, &$receiptId) {
            $receipt = Receipt::create([
                'checkout_session_id' => $checkout->id,
                'receipt_number' => 'R-'.now()->format('YmdHis').'-C'.$checkout->id,
                'time_total' => $timeTotal,
                'products_total' => $itemsTotal,
                'grand_total' => $grandTotal,
                'customer_email' => $customerEmail,
                'paid_at' => $grandTotal > 0 ? $endedAt : null,
                'status' => $grandTotal > 0 ? 'paid' : 'unpaid',
            ]);
            $receiptId = $receipt->id;
            foreach ($validPayments as $p) {
                ReceiptPayment::create([
                    'receipt_id' => $receipt->id,
                    'method' => $p['method'],
                    'amount' => $p['amount'],
                ]);
            }
            $checkout->update(['status' => 'completed', 'completed_at' => $endedAt]);
        });

        $receipt = Receipt::with(['checkoutSession.gameSessions.table', 'checkoutSession.gameSessions.items', 'checkoutSession.items', 'payments'])
            ->findOrFail($receiptId);

        $ratePerMinute = (float) config('pos.rate_per_minute', 0.20);
        $lineItems = [];
        foreach ($receipt->checkoutSession->gameSessions as $session) {
            if ($session->time_total > 0 && $session->started_at && $session->ended_at) {
                $dur = max(0, (int) $session->started_at->diffInSeconds($session->ended_at, true));
                $lineItems[] = [
                    'type' => 'time',
                    'description' => 'Table '.($session->table->name ?? '').' — time',
                    'from' => $session->started_at->copy()->setTimezone(config('app.timezone'))->format('d-m-Y h:i:s A'),
                    'to' => $session->ended_at->copy()->setTimezone(config('app.timezone'))->format('d-m-Y h:i:s A'),
                    'duration' => gmdate('H:i:s', $dur),
                    'rate' => $ratePerMinute,
                    'quantity' => round($session->total_played_seconds / 60, 2),
                    'subtotal' => (float) $session->time_total,
                ];
            }
            foreach ($session->items as $item) {
                $lineItems[] = [
                    'type' => 'product',
                    'description' => $item->product_name ?? $item->product?->name ?? 'Deleted product',
                    'quantity' => $item->quantity,
                    'unit_price' => (float) $item->unit_price,
                    'subtotal' => (float) $item->total_price,
                ];
            }
        }
        foreach ($receipt->checkoutSession->items as $item) {
            $lineItems[] = [
                'type' => 'product',
                'description' => $item->product_name ?? $item->product?->name ?? 'Deleted product',
                'quantity' => $item->quantity,
                'unit_price' => (float) $item->unit_price,
                'subtotal' => (float) $item->total_price,
            ];
        }

        $invoicePayload = [
            'id' => $receipt->id,
            'receipt_number' => $receipt->receipt_number,
            'date' => $receipt->paid_at?->format('d-m-Y') ?? now()->format('d-m-Y'),
            'time' => $receipt->paid_at?->format('h:i:s A') ?? now()->format('h:i:s A'),
            'table_name' => $receipt->checkoutSession->gameSessions->map(fn ($s) => $s->table->name ?? '')->filter()->unique()->implode(', '),
            'customer_email' => $receipt->customer_email,
            'time_total' => (float) $receipt->time_total,
            'products_total' => (float) $receipt->products_total,
            'grand_total' => (float) $receipt->grand_total,
            'line_items' => $lineItems,
            'payments' => $receipt->payments->map(fn ($p) => ['method' => $p->method, 'amount' => (float) $p->amount])->all(),
        ];

        ReceiptLineItemSnapshot::ensureFromPayload($receipt, $invoicePayload['line_items']);

        if ($request->expectsJson()) {
            return response()->json([
                'message' => 'Payment completed.',
                'receipt' => $invoicePayload,
            ]);
        }

        return redirect()->route('checkouts.index')->with('receipt', $invoicePayload);
    }

    /** Merge multiple open checkout sessions into a single target session. */
    public function merge(Request $request)
    {
        $data = $request->validate([
            'target_id' => ['required', 'integer', 'exists:checkout_sessions,id'],
            'source_ids' => ['required', 'array', 'min:1'],
            'source_ids.*' => ['integer', 'different:target_id'],
        ]);

        $target = CheckoutSession::query()->open()->findOrFail($data['target_id']);

        $sourceIds = collect($data['source_ids'])->unique()->filter(fn ($id) => (int) $id !== (int) $target->id)->all();
        if (empty($sourceIds)) {
            return back()->withErrors(['merge' => 'Select at least one other tab to merge.']);
        }

        $sources = CheckoutSession::query()->open()
            ->whereIn('id', $sourceIds)
            ->get();

        if ($sources->isEmpty()) {
            return back()->withErrors(['merge' => 'No valid open tabs to merge.']);
        }

        DB::transaction(function () use ($target, $sources) {
            foreach ($sources as $source) {
                // Move game sessions
                foreach ($source->gameSessions as $session) {
                    $session->update(['checkout_session_id' => $target->id]);
                }

                // Move items, merging by product
                foreach ($source->items as $item) {
                    $existing = CheckoutSessionItem::query()
                        ->where('checkout_session_id', $target->id)
                        ->when(
                            $item->product_id !== null,
                            fn ($query) => $query->where('product_id', $item->product_id),
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

                $source->update(['status' => 'merged']);
            }
        });

        return redirect()->route('checkouts.index')->with('message', 'Tabs merged successfully.');
    }
}
