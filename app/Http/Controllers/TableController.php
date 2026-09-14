<?php

namespace App\Http\Controllers;

use App\Models\BilliardTable;
use App\Models\CheckoutSession;
use App\Models\GameSession;
use App\Models\Product;
use App\Models\Receipt;
use App\Models\ReceiptPayment;
use App\Support\InventoryService;
use App\Support\PaymentPayload;
use App\Support\PosItemUpserter;
use App\Support\PosTransaction;
use App\Support\ReceiptLineItemSnapshot;
use App\Support\ReceiptPresenter;
use App\Support\TableTimeBilling;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class TableController extends Controller
{
    public function index(): Response
    {
        $tables = BilliardTable::with(['latestGameSession.items'])->orderBy('id')->get()
            ->map(function (BilliardTable $table) {
                $currentSession = $table->latestGameSession;

                $elapsed = null;
                $elapsedSeconds = null;
                $lastResumeAt = null;
                $sessionItems = [];

                if ($currentSession?->isActive()) {
                    $playedSeconds = $currentSession->playedSeconds();
                    $elapsed = gmdate('H:i:s', $playedSeconds);
                    // The browser adds the current running segment from last_resume_at.
                    // Send only accumulated completed segments to avoid counting it twice.
                    $elapsedSeconds = (int) ($currentSession->total_played_seconds ?? 0);
                    if ($currentSession->status === 'running' && $currentSession->last_resume_at) {
                        $lastResumeAt = $currentSession->last_resume_at->toIso8601String();
                    }
                    $sessionItems = $currentSession->items->map(fn ($item) => [
                        'id' => $item->id,
                        'product_id' => $item->product_id,
                        'product_name' => $item->product_name ?? $item->product?->name ?? 'Deleted product',
                        'quantity' => $item->quantity,
                        'unit_price' => (float) $item->unit_price,
                        'total_price' => (float) $item->total_price,
                    ])->all();
                }

                return [
                    'id' => $table->id,
                    'name' => $table->name,
                    'status' => $table->status,
                    'current_session' => $currentSession ? [
                        'id' => $currentSession->id,
                        'status' => $currentSession->status,
                        'elapsed' => $elapsed,
                        'elapsed_seconds' => $elapsedSeconds,
                        'last_resume_at' => $lastResumeAt,
                        'ended_at' => $currentSession->ended_at,
                        'time_total' => $currentSession->time_total,
                        'items' => $sessionItems,
                    ] : null,
                ];
            });

        $receipt = session('receipt');
        if ($receipt !== null) {
            request()->session()->forget('receipt');
        }

        $isAdmin = auth()->user()?->role === 'admin';

        return Inertia::render('tables/index', [
            'tables' => $tables,
            'products' => Product::where('is_active', true)
                ->orderBy('name')
                ->get(['id', 'name', 'price', 'category', 'stock_quantity', 'low_stock_threshold']),
            'receipt' => $receipt,
            'isAdmin' => $isAdmin,
        ]);
    }

    public function start(Request $request, BilliardTable $table)
    {
        return PosTransaction::table($table, function (BilliardTable $table) use ($request) {
            if ($table->status !== 'available' || $table->sessions()->whereIn('status', GameSession::ACTIVE_STATUSES)->exists()) {
                throw ValidationException::withMessages(['table' => 'Only available tables can be started.']);
            }

            // Persist lifecycle timestamps explicitly in UTC. Display conversion is
            // handled at the presentation boundary (Asia/Ulaanbaatar).
            $now = now('UTC');
            $session = GameSession::create([
                'billiard_table_id' => $table->id,
                'user_id' => $request->user()->id,
                'status' => 'running',
                'started_at' => $now,
                'last_resume_at' => $now,
                'total_played_seconds' => 0,
                'time_total' => 0,
            ]);

            $table->update(['status' => 'running']);

            return redirect()->back()->with('session_started', $session->id);
        });
    }

    public function pause(BilliardTable $table)
    {
        return PosTransaction::table($table, function (BilliardTable $table) {
            $session = $table->sessions()->latest()->first();

            if (! $session || $session->status !== 'running') {
                throw ValidationException::withMessages(['table' => 'No running session to pause.']);
            }

            $now = now('UTC');
            $playedSeconds = $session->playedSeconds($now);
            $session->update([
                'status' => 'paused',
                'paused_at' => $now,
                'total_played_seconds' => $playedSeconds,
            ]);

            $table->update(['status' => 'paused']);

            return redirect()->back();
        });
    }

    public function resume(BilliardTable $table)
    {
        return PosTransaction::table($table, function (BilliardTable $table) {
            $session = $table->sessions()->latest()->first();

            if (! $session || $session->status !== 'paused') {
                throw ValidationException::withMessages(['table' => 'No paused session to resume.']);
            }

            $session->update([
                'status' => 'running',
                'paused_at' => null,
                'last_resume_at' => now('UTC'),
            ]);

            $table->update(['status' => 'running']);

            return redirect()->back();
        });
    }

    public function checkoutSummary(BilliardTable $table)
    {
        $session = $table->latestActiveSession(['items']);

        if (! $session) {
            abort(404);
        }

        $playedSeconds = $session->playedSeconds();
        $timeTotal = TableTimeBilling::totalForSeconds($playedSeconds);
        $itemsTotal = (float) $session->items->sum('total_price');
        $grandTotal = round(max(0, $timeTotal + $itemsTotal), 2);

        return response()->json([
            'table_id' => $table->id,
            'table_name' => $table->name,
            'session_id' => $session->id,
            'time_total' => $timeTotal,
            'items_total' => $itemsTotal,
            'grand_total' => $grandTotal,
        ]);
    }

    public function end(Request $request, BilliardTable $table)
    {
        return PosTransaction::table($table, function (BilliardTable $table) use ($request) {
            $session = $table->latestActiveSession(['items']);

            if (! $session) {
                throw ValidationException::withMessages(['table' => 'No active session to end.']);
            }

            $endedAt = now('UTC');
            $playedSeconds = $session->playedSeconds($endedAt);
            $timeTotal = TableTimeBilling::totalForSeconds($playedSeconds);
            $itemsTotal = (float) $session->items->sum('total_price');
            $grandTotal = round(max(0, $timeTotal + $itemsTotal), 2);

            $normalizedPayments = PaymentPayload::normalizeForTotal(
                PaymentPayload::fromRequest($request),
                $grandTotal,
                allowOverpay: true,
            );
            if ($normalizedPayments['error'] === 'minimum_total_required') {
                throw ValidationException::withMessages(['payments' => 'Total paid must be at least the grand total.']);
            }
            if ($normalizedPayments['error'] === 'card_transfer_exceeds') {
                throw ValidationException::withMessages(['payments' => 'Card and transfer combined cannot exceed the grand total.']);
            }
            $validPayments = $normalizedPayments['payments'];

            $customerEmail = $request->input('customer_email') ? trim((string) $request->input('customer_email')) : null;
            if ($customerEmail !== null && $customerEmail === '') {
                $customerEmail = null;
            }

            $receiptId = null;

            $timeMinutes = (int) round($playedSeconds / 60);

            DB::transaction(function () use ($session, $table, $endedAt, $timeMinutes, $timeTotal, $itemsTotal, $grandTotal, $validPayments, $customerEmail, $playedSeconds, &$receiptId) {
                $session->update([
                    'status' => 'completed',
                    'ended_at' => $endedAt,
                    'total_played_seconds' => $playedSeconds,
                    'total_minutes' => $timeMinutes,
                    'time_total' => $timeTotal,
                ]);

                $table->update(['status' => 'available']);

                $receipt = Receipt::create([
                    'game_session_id' => $session->id,
                    'receipt_number' => 'R-'.Str::ulid(),
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
            });

            $receipt = Receipt::findOrFail($receiptId);
            $invoicePayload = ReceiptPresenter::payload($receipt);
            ReceiptLineItemSnapshot::ensureFromPayload($receipt, $invoicePayload['line_items']);

            return redirect()->back()->with('session_ended', $session->id)->with('receipt', $invoicePayload);
        });
    }

    public function moveToCheckout(Request $request, BilliardTable $table)
    {
        return PosTransaction::table($table, function (BilliardTable $table) use ($request) {
            $session = $table->latestActiveSession(['items']);

            if (! $session) {
                throw ValidationException::withMessages(['table' => 'No active session to move.']);
            }

            $checkoutId = $request->input('checkout_session_id');

            $endedAt = now('UTC');
            $playedSeconds = $session->playedSeconds($endedAt);
            $timeTotal = TableTimeBilling::totalForSeconds($playedSeconds);

            DB::transaction(function () use ($session, $table, $endedAt, $playedSeconds, $timeTotal, $checkoutId) {
                if ($checkoutId) {
                    $checkout = CheckoutSession::query()->lockForUpdate()->open()->findOrFail($checkoutId);
                } else {
                    $checkout = CheckoutSession::create(['status' => CheckoutSession::STATUS_OPEN]);
                }

                $timeMinutes = (int) round($playedSeconds / 60);
                $session->update([
                    'checkout_session_id' => $checkout->id,
                    'status' => 'completed',
                    'ended_at' => $endedAt,
                    'total_played_seconds' => $playedSeconds,
                    'total_minutes' => $timeMinutes,
                    'time_total' => $timeTotal,
                ]);
                $table->update(['status' => 'available']);
            });

            return redirect()->back()->with('message', 'Session moved to open tab.');
        });
    }

    public function addItem(Request $request, BilliardTable $table)
    {
        return PosTransaction::table($table, function (BilliardTable $table) use ($request) {
            $session = $table->latestActiveSession();

            if (! $session) {
                throw ValidationException::withMessages(['table' => 'No active session for this table.']);
            }

            $data = $request->validate([
                'product_id' => ['required', 'exists:products,id'],
                'quantity' => ['required', 'integer', 'min:1'],
            ]);

            DB::transaction(function () use ($session, $data) {
                InventoryService::deduct([$data]);
                $this->addProductToSession($session, (int) $data['product_id'], (int) $data['quantity']);
            });

            return redirect()->back();
        });
    }

    public function addItemsBulk(Request $request, BilliardTable $table)
    {
        return PosTransaction::table($table, function (BilliardTable $table) use ($request) {
            $session = $table->latestActiveSession();

            if (! $session) {
                throw ValidationException::withMessages(['table' => 'No active session for this table.']);
            }

            $data = $request->validate([
                'items' => ['required', 'array', 'min:1'],
                'items.*.product_id' => ['required', 'exists:products,id'],
                'items.*.quantity' => ['required', 'integer', 'min:1'],
            ]);

            DB::transaction(function () use ($session, $data) {
                InventoryService::deduct($data['items']);
                foreach ($data['items'] as $item) {
                    $this->addProductToSession($session, (int) $item['product_id'], (int) $item['quantity']);
                }
            });

            return redirect()->back();
        });
    }

    private function addProductToSession(GameSession $session, int $productId, int $quantity): void
    {
        $product = Product::findOrFail($productId);
        PosItemUpserter::upsertProduct($session, $product, $quantity);
    }
}
