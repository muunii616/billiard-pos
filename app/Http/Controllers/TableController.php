<?php

namespace App\Http\Controllers;

use App\Models\BilliardTable;
use App\Models\CheckoutSession;
use App\Models\GameSession;
use App\Models\Product;
use App\Models\Receipt;
use App\Models\ReceiptPayment;
use App\Support\PosItemUpserter;
use App\Support\PaymentPayload;
use App\Support\ReceiptLineItemSnapshot;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class TableController extends Controller
{
    /** Current billable/display seconds for a running or paused session (actual played time only). */
    private function sessionPlayedSeconds(GameSession $session, ?\DateTimeInterface $asOf = null): int
    {
        $asOf = $asOf ?? now();
        $base = (int) ($session->total_played_seconds ?? 0);
        if ($session->status === 'paused') {
            return $base;
        }
        $resumeAt = $session->last_resume_at ?? $session->started_at;
        if (! $resumeAt) {
            return $base;
        }
        $resumeAt = $resumeAt instanceof \Carbon\Carbon ? $resumeAt->copy()->setTimezone(config('app.timezone')) : \Carbon\Carbon::parse($resumeAt, config('app.timezone'));
        $now = $asOf instanceof \Carbon\Carbon ? $asOf->copy()->setTimezone(config('app.timezone')) : \Carbon\Carbon::parse($asOf, config('app.timezone'));
        return $base + max(0, (int) $resumeAt->diffInSeconds($now, true));
    }

    public function index(): Response
    {
        $tables = BilliardTable::with(['sessions' => function ($query) {
            $query->with('items')->latest()->limit(1);
        }])->orderBy('id')->get()
            ->map(function (BilliardTable $table) {
                $currentSession = $table->sessions->first();

                $elapsed = null;
                $elapsedSeconds = null;
                $lastResumeAt = null;
                $sessionItems = [];

                if ($currentSession?->isActive()) {
                    $elapsedSeconds = $this->sessionPlayedSeconds($currentSession);
                    $elapsed = gmdate('H:i:s', $elapsedSeconds);
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
                ->get(['id', 'name', 'price', 'category']),
            'receipt' => $receipt,
            'isAdmin' => $isAdmin,
        ]);
    }

    public function start(Request $request, BilliardTable $table)
    {
        if ($table->status === 'running') {
            return back()->withErrors(['table' => 'Table already running.']);
        }

        $now = now();
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
    }

    public function pause(BilliardTable $table)
    {
        $session = $table->sessions()->latest()->first();

        if (! $session || $session->status !== 'running') {
            return back()->withErrors(['table' => 'No running session to pause.']);
        }

        $now = now();
        $resumeAt = $session->last_resume_at ?? $session->started_at;
        $addSeconds = $resumeAt
            ? max(0, (int) $resumeAt->diffInSeconds($now, true))
            : 0;
        $session->update([
            'status' => 'paused',
            'paused_at' => $now,
            'total_played_seconds' => $session->total_played_seconds + $addSeconds,
        ]);

        $table->update(['status' => 'paused']);

        return redirect()->back();
    }

    public function resume(BilliardTable $table)
    {
        $session = $table->sessions()->latest()->first();

        if (! $session || $session->status !== 'paused') {
            return back()->withErrors(['table' => 'No paused session to resume.']);
        }

        $session->update([
            'status' => 'running',
            'paused_at' => null,
            'last_resume_at' => now(),
        ]);

        $table->update(['status' => 'running']);

        return redirect()->back();
    }

    public function checkoutSummary(BilliardTable $table)
    {
        $session = $table->latestActiveSession(['items']);

        if (! $session) {
            abort(404);
        }

        $playedSeconds = $this->sessionPlayedSeconds($session);
        $ratePerMinute = (float) config('pos.rate_per_minute', 0.20);
        $timeTotal = round(($playedSeconds / 60) * $ratePerMinute, 2);
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
        $session = $table->latestActiveSession(['items']);

        if (! $session) {
            return back()->withErrors(['table' => 'No active session to end.']);
        }

        $endedAt = now();
        $playedSeconds = $this->sessionPlayedSeconds($session, $endedAt);
        $ratePerMinute = (float) config('pos.rate_per_minute', 0.20);
        $timeTotal = round(($playedSeconds / 60) * $ratePerMinute, 2);
        $itemsTotal = (float) $session->items->sum('total_price');
        $grandTotal = round(max(0, $timeTotal + $itemsTotal), 2);

        $normalizedPayments = PaymentPayload::normalizeForTotal(
            PaymentPayload::fromRequest($request),
            $grandTotal,
            allowOverpay: false,
        );
        if ($normalizedPayments['error'] === 'exact_total_required') {
            return back()->withErrors(['payments' => 'Total paid must equal grand total.']);
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
                'receipt_number' => 'R-' . now()->format('YmdHis') . '-' . $session->id,
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

        $receipt = Receipt::with(['session.table', 'session.items', 'payments'])
            ->findOrFail($receiptId);

        $session = $receipt->session;
        $ratePerMinute = (float) config('pos.rate_per_minute', 0.20);
        $durationFormatted = gmdate('H:i:s', $playedSeconds);

        $invoicePayload = [
            'id' => $receipt->id,
            'receipt_number' => $receipt->receipt_number,
            'date' => $receipt->paid_at?->format('d-m-Y') ?? now()->format('d-m-Y'),
            'time' => $receipt->paid_at?->format('h:i:s A') ?? now()->format('h:i:s A'),
            'table_name' => $session->table->name,
            'customer_email' => $receipt->customer_email,
            'time_total' => (float) $receipt->time_total,
            'products_total' => (float) $receipt->products_total,
            'grand_total' => (float) $receipt->grand_total,
            'started_at' => $session->started_at?->copy()->setTimezone(config('app.timezone'))->format('d-m-Y h:i:s A'),
            'ended_at' => $session->ended_at?->copy()->setTimezone(config('app.timezone'))->format('d-m-Y h:i:s A'),
            'duration_formatted' => $durationFormatted,
            'rate_per_minute' => $ratePerMinute,
            'line_items' => [],
            'payments' => $receipt->payments->map(fn ($p) => ['method' => $p->method, 'amount' => (float) $p->amount])->all(),
        ];

        if ($playedSeconds > 0) {
            $invoicePayload['line_items'][] = [
                'type' => 'time',
                'description' => 'Table time',
                'from' => $session->started_at?->copy()->setTimezone(config('app.timezone'))->format('d-m-Y h:i:s A'),
                'to' => $session->ended_at?->copy()->setTimezone(config('app.timezone'))->format('d-m-Y h:i:s A'),
                'duration' => $durationFormatted,
                'rate' => $ratePerMinute,
                'quantity' => round($playedSeconds / 60, 2),
                'subtotal' => (float) $receipt->time_total,
            ];
        }

        foreach ($session->items as $item) {
            $invoicePayload['line_items'][] = [
                'type' => 'product',
                'description' => $item->product_name ?? $item->product?->name ?? 'Deleted product',
                'quantity' => $item->quantity,
                'unit_price' => (float) $item->unit_price,
                'subtotal' => (float) $item->total_price,
            ];
        }

        ReceiptLineItemSnapshot::ensureFromPayload($receipt, $invoicePayload['line_items']);

        return redirect()->back()->with('session_ended', $session->id)->with('receipt', $invoicePayload);
    }

    public function moveToCheckout(Request $request, BilliardTable $table)
    {
        $session = $table->latestActiveSession(['items']);

        if (! $session) {
            return back()->withErrors(['table' => 'No active session to move.']);
        }

        $checkoutId = $request->input('checkout_session_id');

        $endedAt = now();
        $playedSeconds = $this->sessionPlayedSeconds($session, $endedAt);
        $ratePerMinute = (float) config('pos.rate_per_minute', 0.20);
        $timeTotal = round(($playedSeconds / 60) * $ratePerMinute, 2);
        $itemsTotal = (float) $session->items->sum('total_price');

        DB::transaction(function () use ($session, $table, $endedAt, $playedSeconds, $timeTotal, $checkoutId) {
            if ($checkoutId) {
                $checkout = CheckoutSession::query()->open()->findOrFail($checkoutId);
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
    }

    public function addItem(Request $request, BilliardTable $table)
    {
        $session = $table->latestActiveSession();

        if (! $session) {
            return back()->withErrors(['table' => 'No active session for this table.']);
        }

        $data = $request->validate([
            'product_id' => ['required', 'exists:products,id'],
            'quantity' => ['required', 'integer', 'min:1'],
        ]);

        $this->addProductToSession($session, (int) $data['product_id'], (int) $data['quantity']);

        return redirect()->back();
    }

    public function addItemsBulk(Request $request, BilliardTable $table)
    {
        $session = $table->latestActiveSession();

        if (! $session) {
            return back()->withErrors(['table' => 'No active session for this table.']);
        }

        $data = $request->validate([
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'exists:products,id'],
            'items.*.quantity' => ['required', 'integer', 'min:1'],
        ]);

        foreach ($data['items'] as $item) {
            $this->addProductToSession($session, (int) $item['product_id'], (int) $item['quantity']);
        }

        return redirect()->back();
    }

    private function addProductToSession(GameSession $session, int $productId, int $quantity): void
    {
        $product = Product::findOrFail($productId);
        PosItemUpserter::upsertSessionProduct($session, $product, $quantity, increment: true);
    }
}
