<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\BilliardTable;
use App\Models\Product;
use App\Models\SessionItem;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class TableAdminController extends Controller
{
    public function cancelSession(Request $request, BilliardTable $table)
    {
        $session = $table->sessions()->with('items')->latest()->first();
        if (! $session || ! in_array($session->status, ['running', 'paused'], true)) {
            return response()->json(['message' => 'No active session to cancel.'], 422);
        }

        DB::transaction(function () use ($session, $table) {
            // Mark session cancelled and zero-out charges. Keep item rows for audit, but treat as voided by totals=0.
            $session->update([
                'status' => 'cancelled',
                'ended_at' => now(),
                'total_played_seconds' => $session->total_played_seconds ?? 0,
                'total_minutes' => 0,
                'time_total' => 0,
            ]);

            // Optionally also zero item totals for clarity.
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

        // Only allow maintenance toggle when not running/paused (so we don't break active sessions).
        if (in_array($table->status, ['running', 'paused'], true)) {
            return response()->json(['message' => 'Cannot change maintenance status during an active session.'], 422);
        }

        $table->update(['status' => $data['status']]);

        return response()->json(['message' => 'Table status updated.']);
    }

    /** Edit line items on the table’s current running/paused session (admin). */
    public function updateSessionItems(Request $request, BilliardTable $table)
    {
        $session = $table->sessions()->latest()->first();
        if (! $session || ! in_array($session->status, ['running', 'paused'], true)) {
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
                    $item = $session->items()->firstOrNew(['product_id' => $product->id]);
                    $item->quantity = $qty;
                    $item->product_name = $product->name;
                    $item->product_category = $product->category;
                    $item->unit_price = $product->price;
                    $item->total_price = round($qty * (float) $item->unit_price, 2);
                    $item->save();

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
                $session->items()->create([
                    'product_id' => null,
                    'product_name' => $name,
                    'product_category' => $category ?: null,
                    'quantity' => $qty,
                    'unit_price' => $unitPrice,
                    'total_price' => round($qty * $unitPrice, 2),
                ]);
            }
        });

        return response()->json(['message' => 'Session items updated.']);
    }
}
