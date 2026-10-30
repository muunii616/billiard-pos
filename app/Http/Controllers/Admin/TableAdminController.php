<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\BilliardTable;
use App\Support\InventoryService;
use App\Support\PosItemEditor;
use App\Support\PosTransaction;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class TableAdminController extends Controller
{
    public function cancelSession(Request $request, BilliardTable $table)
    {
        return PosTransaction::table($table, function (BilliardTable $table) use ($request) {
            $session = $table->latestActiveSession(['items']);
            if (! $session) {
                return response()->json(['message' => 'No active session to cancel.'], 422);
            }

            $data = $request->validate([
                'reason' => ['required', 'string', 'max:2000'],
                'restock' => ['sometimes', 'boolean'],
            ]);
            $reason = trim((string) ($data['reason'] ?? ''));
            $restock = $request->boolean('restock', true);

            DB::transaction(function () use ($session, $table, $request, $reason, $restock) {
                if ($restock) {
                    InventoryService::restore($session->items);
                }
                $session->clearAlert();
                $session->update([
                    'status' => 'cancelled',
                    'ended_at' => now('UTC'),
                    'total_played_seconds' => $session->playedSeconds(),
                    'total_minutes' => 0,
                    'time_total' => 0,
                    'cancel_reason' => $reason !== '' ? $reason : null,
                    'cancelled_by_user_id' => $request->user()?->id,
                    'stock_restored' => $restock,
                    'alert_at_played_seconds' => null,
                ]);

                foreach ($session->items as $item) {
                    $item->update([
                        'total_price' => 0,
                    ]);
                }

                $table->update(['status' => 'available']);
            });

            return response()->json([
                'message' => $restock
                    ? 'Session cancelled. Products returned to stock.'
                    : 'Session cancelled. Products were not returned to stock.',
            ]);
        });
    }

    public function setMaintenance(Request $request, BilliardTable $table)
    {
        return PosTransaction::table($table, function (BilliardTable $table) use ($request) {
            $data = $request->validate([
                'status' => ['required', 'string', 'in:available,maintenance'],
            ]);

            if (in_array($table->status, BilliardTable::activeSessionStatuses(), true)) {
                return response()->json(['message' => 'Cannot change maintenance status during an active session.'], 422);
            }

            $table->update(['status' => $data['status']]);

            return response()->json(['message' => 'Table status updated.']);
        });
    }

    /** Edit line items on the table’s current running/paused session (admin). */
    public function updateSessionItems(Request $request, BilliardTable $table)
    {
        return PosTransaction::table($table, function (BilliardTable $table) use ($request) {
            $session = $table->latestActiveSession();
            if (! $session) {
                return response()->json(['message' => 'No active session to edit.'], 422);
            }

            $data = $request->validate(array_merge(PosItemEditor::rules(), [
                'items' => ['required', 'array'],
                'reason' => ['required', 'string', 'max:2000'],
            ]));
            PosItemEditor::update($session, $data['items']);

            return response()->json(['message' => 'Session items updated.']);
        });
    }
}
