<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\BilliardTable;
use App\Models\Product;
use App\Models\SessionItem;
use App\Support\PosItemUpserter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class TableAdminController extends Controller
{
    public function cancelSession(Request $request, BilliardTable $table)
    {
        $session = $table->latestActiveSession(['items']);
        if (! $session) {
            return response()->json(['message' => 'No active session to cancel.'], 422);
        }

        DB::transaction(function () use ($session, $table) {
            $session->update([
                'status' => 'cancelled',
                'ended_at' => now(),
                'total_played_seconds' => $session->total_played_seconds ?? 0,
                'total_minutes' => 0,
                'time_total' => 0,
            ]);

            foreach ($session->items as $item) {
                $item->update([
                    'total_price' => 0,
                ]);
            }

            $table->update(['status' => 'available']);
        });

        return response()->json(['message' => 'Session cancelled.']);
    }

    public function setMaintenance(Request $request, BilliardTable $table)
    {
        $data = $request->validate([
            'status' => ['required', 'string', 'in:available,maintenance'],
        ]);

        if (in_array($table->status, BilliardTable::activeSessionStatuses(), true)) {
            return response()->json(['message' => 'Cannot change maintenance status during an active session.'], 422);
        }

        $table->update(['status' => $data['status']]);

        return response()->json(['message' => 'Table status updated.']);
    }

    /** Edit line items on the table’s current running/paused session (admin). */
    public function updateSessionItems(Request $request, BilliardTable $table)
    {
        $session = $table->latestActiveSession();
        if (! $session) {
            return response()->json(['message' => 'No active session to edit.'], 422);
        }

        $data = $request->validate([
            'items' => ['required', 'array'],
            'items.*.id' => ['nullable', 'integer'],
            'items.*.product_id' => ['nullable', 'integer', 'exists:products,id'],
            'items.*.product_name' => ['nullable', 'string', 'max:255'],
            'items.*.product_category' => ['nullable', 'string', 'max:255'],
            'items.*.unit_price' => ['nullable', 'numeric', 'min:0'],
            'items.*.quantity' => ['required', 'integer', 'min:0'],
        ]);

        DB::transaction(function () use ($session, $data) {
            foreach ($data['items'] as $row) {
                $qty = (int) $row['quantity'];
                $id = $row['id'] ?? null;

                if ($id) {
                    /** @var SessionItem $item */
                    $item = SessionItem::where('game_session_id', $session->id)->findOrFail($id);
                    if ($qty <= 0) {
                        $item->delete();

                        continue;
                    }
                    $item->quantity = $qty;
                    $item->total_price = round($item->quantity * (float) $item->unit_price, 2);
                    $item->save();

                    continue;
                }

                if (! empty($row['product_id'])) {
                    $product = Product::findOrFail((int) $row['product_id']);
                    PosItemUpserter::upsertSessionProduct($session, $product, $qty, increment: false);

                    continue;
                }

                if ($qty <= 0) {
                    continue;
                }

                $name = (string) ($row['product_name'] ?? '');
                $category = (string) ($row['product_category'] ?? '');
                $unitPrice = (float) data_get($row, 'unit_price', 0);
                if (trim($name) === '') {
                    continue;
                }
                PosItemUpserter::createSessionManualItem($session, $name, $category, $qty, $unitPrice);
            }
        });

        return response()->json(['message' => 'Session items updated.']);
    }
}
