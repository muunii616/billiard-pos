<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\CheckoutSession;
use App\Models\Receipt;
use App\Support\InventoryService;
use App\Support\PosItemEditor;
use App\Support\PosTransaction;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CheckoutAdminController extends Controller
{
    public function updateItems(Request $request, CheckoutSession $checkout)
    {
        return PosTransaction::checkout($checkout, function (CheckoutSession $checkout) use ($request) {
            if (! $checkout->isOpen()) {
                return response()->json(['message' => 'Only open tabs can be edited.'], 422);
            }

            $data = $request->validate(PosItemEditor::rules());
            PosItemEditor::update($checkout, $data['items']);

            return response()->json(['message' => 'Tab items updated.']);
        });
    }

    public function void(Request $request, CheckoutSession $checkout)
    {
        return PosTransaction::checkout($checkout, function (CheckoutSession $checkout) use ($request) {
            if (! $checkout->isOpen()) {
                return response()->json(['message' => 'This tab is not open.'], 422);
            }

            $isAdmin = $request->user()?->role === 'admin';
            $data = $request->validate([
                'reason' => [$isAdmin ? 'nullable' : 'required', 'string', 'max:2000'],
            ]);
            $reason = trim((string) ($data['reason'] ?? ''));

            DB::transaction(function () use ($checkout, $request, $reason) {
                $checkout->load(['items', 'gameSessions.items']);
                InventoryService::restore($checkout->items);
                foreach ($checkout->gameSessions as $session) {
                    InventoryService::restore($session->items);
                }
                $checkout->update([
                    'status' => 'voided',
                    'completed_at' => now('UTC'),
                    'void_reason' => $reason !== '' ? $reason : null,
                    'voided_by_user_id' => $request->user()?->id,
                ]);
            });

            return response()->json(['message' => 'Tab voided.']);
        });
    }

    public function reopen(CheckoutSession $checkout)
    {
        return PosTransaction::checkout($checkout, function (CheckoutSession $checkout) {
            if (! in_array($checkout->status, ['completed', 'voided'], true)) {
                return response()->json(['message' => 'Only completed or voided tabs can be reopened.'], 422);
            }
            $checkout->load(['items', 'gameSessions.items']);
            if ($checkout->status === 'voided') {
                InventoryService::deduct($checkout->items->concat($checkout->gameSessions->flatMap->items));
            }
            Receipt::query()->where('checkout_session_id', $checkout->id)
                ->where('status', '!=', 'voided')->lockForUpdate()->get()->each->update([
                    'status' => 'voided', 'voided_at' => now('UTC'), 'void_reason' => 'Tab reopened for correction.',
                ]);
            $checkout->update(['status' => CheckoutSession::STATUS_OPEN, 'completed_at' => null]);

            return response()->json(['message' => 'Tab reopened.', 'checkout_id' => $checkout->id]);
        });
    }
}
