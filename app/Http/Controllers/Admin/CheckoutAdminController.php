<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\CheckoutSession;
use App\Models\CheckoutSessionItem;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CheckoutAdminController extends Controller
{
    public function updateItems(Request $request, CheckoutSession $checkout)
    {
        if ($checkout->status !== 'open') {
            return response()->json(['message' => 'Only open tabs can be edited.'], 422);
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

        DB::transaction(function () use ($checkout, $data) {
            foreach ($data['items'] as $row) {
                $qty = (int) $row['quantity'];
                $id = $row['id'] ?? null;

                if ($id) {
                    /** @var CheckoutSessionItem $item */
                    $item = CheckoutSessionItem::where('checkout_session_id', $checkout->id)->findOrFail($id);
                    if ($qty <= 0) {
                        $item->delete();
                        continue;
                    }
                    $item->quantity = $qty;
                    $item->total_price = round($item->quantity * (float) $item->unit_price, 2);
                    $item->save();
                    continue;
                }

                // New line item: prefer product_id lookup when available
                if (! empty($row['product_id'])) {
                    $product = Product::findOrFail((int) $row['product_id']);
                    $item = $checkout->items()->firstOrNew(['product_id' => $product->id]);
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
                $unitPrice = (float) ($row['unit_price'] ?? 0);
                if (trim($name) === '') {
                    continue;
                }
                $checkout->items()->create([
                    'product_id' => null,
                    'product_name' => $name,
                    'product_category' => $category ?: null,
                    'quantity' => $qty,
                    'unit_price' => $unitPrice,
                    'total_price' => round($qty * $unitPrice, 2),
                ]);
            }
        });

        return response()->json(['message' => 'Tab items updated.']);
    }

    public function void(CheckoutSession $checkout)
    {
        if ($checkout->status !== 'open') {
            return response()->json(['message' => 'This tab is not open.'], 422);
        }

        $checkout->update([
            'status' => 'voided',
            'completed_at' => now(),
        ]);

        return response()->json(['message' => 'Tab voided.']);
    }

    public function reopen(CheckoutSession $checkout)
    {
        if (! in_array($checkout->status, ['completed', 'voided', 'merged'], true)) {
            return response()->json(['message' => 'Only completed/voided/merged tabs can be reopened.'], 422);
        }

        $checkout->load(['items', 'gameSessions.items']);

        $new = CheckoutSession::create(['status' => 'open']);

        DB::transaction(function () use ($checkout, $new) {
            foreach ($checkout->items as $item) {
                $new->items()->create([
                    'product_id' => $item->product_id,
                    'product_name' => $item->product_name,
                    'product_category' => $item->product_category,
                    'quantity' => $item->quantity,
                    'unit_price' => $item->unit_price,
                    'total_price' => $item->total_price,
                ]);
            }
            // Note: we intentionally do NOT move historical game sessions to avoid rewriting history.
        });

        return response()->json(['message' => 'Tab reopened.', 'checkout_id' => $new->id]);
    }
}

