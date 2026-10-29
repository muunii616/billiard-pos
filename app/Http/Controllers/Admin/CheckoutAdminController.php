<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\CheckoutSession;
use App\Models\GameSession;
use App\Models\Receipt;
use App\Support\CheckoutBalance;
use App\Support\InventoryService;
use App\Support\PosItemEditor;
use App\Support\PosTransaction;
use App\Support\TableTimeBilling;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CheckoutAdminController extends Controller
{
    public function updateItems(Request $request, CheckoutSession $checkout)
    {
        return PosTransaction::checkout($checkout, function (CheckoutSession $checkout) use ($request) {
            if (! $checkout->isOpen()) {
                return response()->json(['message' => 'Only open tabs can be edited.'], 422);
            }

            $data = $request->validate(array_merge(PosItemEditor::rules(), [
                'time_sessions' => ['sometimes', 'array'],
                'time_sessions.*.id' => ['required', 'integer', 'distinct'],
                'time_sessions.*.time_blocks' => ['required', 'array'],
            ]));

            $items = $data['items'] ?? [];
            $timeSessions = $data['time_sessions'] ?? [];

            if ($items === [] && $timeSessions === []) {
                throw ValidationException::withMessages([
                    'items' => 'Nothing to update.',
                ]);
            }

            if ($items !== []) {
                PosItemEditor::update($checkout, $items);
            }

            foreach ($timeSessions as $row) {
                $session = GameSession::query()
                    ->where('checkout_session_id', $checkout->id)
                    ->whereKey($row['id'])
                    ->lockForUpdate()
                    ->first();

                if (! $session) {
                    throw ValidationException::withMessages([
                        'time_sessions' => 'One or more table sessions are not on this tab.',
                    ]);
                }

                $blocks = TableTimeBilling::parseOrFail($row['time_blocks'] ?? []);
                $session->update([
                    'time_blocks' => $blocks['counts'],
                    'time_total' => $blocks['time_total'],
                    'total_minutes' => $blocks['total_minutes'],
                ]);
            }

            return response()->json(['message' => 'Tab items updated.']);
        });
    }

    public function void(Request $request, CheckoutSession $checkout)
    {
        return PosTransaction::checkout($checkout, function (CheckoutSession $checkout) use ($request) {
            if (! $checkout->isOpen()) {
                return response()->json(['message' => 'This tab is not open.'], 422);
            }

            $amountPaid = CheckoutBalance::amountPaid($checkout);
            if ($amountPaid > 0.01) {
                return response()->json([
                    'message' => 'This tab has partial payments. Void those receipts first, or settle the remaining balance.',
                ], 422);
            }

            $isAdmin = $request->user()?->role === 'admin';
            $data = $request->validate([
                'reason' => [$isAdmin ? 'nullable' : 'required', 'string', 'max:2000'],
                'restock' => ['sometimes', 'boolean'],
            ]);
            $reason = trim((string) ($data['reason'] ?? ''));
            $restock = $request->boolean('restock', true);

            DB::transaction(function () use ($checkout, $request, $reason, $restock) {
                $checkout->load(['items', 'gameSessions.items']);
                if ($restock) {
                    InventoryService::restore($checkout->items);
                    foreach ($checkout->gameSessions as $session) {
                        InventoryService::restore($session->items);
                    }
                }
                $checkout->update([
                    'status' => 'voided',
                    'completed_at' => now('UTC'),
                    'void_reason' => $reason !== '' ? $reason : null,
                    'voided_by_user_id' => $request->user()?->id,
                    'stock_restored' => $restock,
                ]);
                foreach ($checkout->gameSessions as $session) {
                    $session->update(['stock_restored' => $restock]);
                }
            });

            return response()->json([
                'message' => $restock
                    ? 'Tab voided. Products returned to stock.'
                    : 'Tab voided. Products were not returned to stock.',
            ]);
        });
    }

    public function reopen(CheckoutSession $checkout)
    {
        return PosTransaction::checkout($checkout, function (CheckoutSession $checkout) {
            if (! in_array($checkout->status, ['completed', 'voided'], true)) {
                return response()->json(['message' => 'Only completed or voided tabs can be reopened.'], 422);
            }
            $checkout->load(['items', 'gameSessions.items']);
            if ($checkout->status === 'voided' && $checkout->stock_restored !== false) {
                InventoryService::deduct($checkout->items->concat($checkout->gameSessions->flatMap->items));
            }
            Receipt::query()->where('checkout_session_id', $checkout->id)
                ->where('status', '!=', 'voided')->lockForUpdate()->get()->each->update([
                    'status' => 'voided', 'voided_at' => now('UTC'), 'void_reason' => 'Tab reopened for correction.',
                ]);
            $checkout->update([
                'status' => CheckoutSession::STATUS_OPEN,
                'completed_at' => null,
                'stock_restored' => null,
            ]);

            return response()->json(['message' => 'Tab reopened.', 'checkout_id' => $checkout->id]);
        });
    }
}
