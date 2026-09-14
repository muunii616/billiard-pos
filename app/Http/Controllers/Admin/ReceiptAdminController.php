<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Receipt;
use App\Models\ReceiptLineItem;
use App\Models\ReceiptPayment;
use App\Support\PosDate;
use App\Support\PosTransaction;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ReceiptAdminController extends Controller
{
    public function show(Receipt $receipt)
    {
        $receipt->load(['payments', 'lineItems']);

        return response()->json([
            'id' => $receipt->id,
            'receipt_number' => $receipt->receipt_number,
            'status' => $receipt->status ?? ($receipt->paid_at ? 'paid' : 'unpaid'),
            'paid_at' => optional($receipt->paid_at)->toIso8601String(),
            'customer_email' => $receipt->customer_email,
            'time_total' => (float) $receipt->time_total,
            'products_total' => (float) $receipt->products_total,
            'grand_total' => (float) $receipt->grand_total,
            'voided_at' => optional($receipt->voided_at)->toIso8601String(),
            'void_reason' => $receipt->void_reason,
            'line_items' => $receipt->lineItems->map(fn (ReceiptLineItem $li) => [
                'id' => $li->id,
                'type' => $li->type,
                'description' => $li->description,
                'quantity' => (float) $li->quantity,
                'unit_price' => (float) $li->unit_price,
                'subtotal' => (float) $li->subtotal,
                'meta' => $li->meta,
            ])->values()->all(),
            'payments' => $receipt->payments->map(fn (ReceiptPayment $p) => [
                'id' => $p->id,
                'method' => $p->method,
                'amount' => (float) $p->amount,
            ])->values()->all(),
        ]);
    }

    public function update(Request $request, Receipt $receipt)
    {
        return PosTransaction::receipt($receipt, function (Receipt $receipt) use ($request) {
            $data = $request->validate([
                'status' => ['sometimes', 'required', 'string', 'in:paid,unpaid,voided'],
                'paid_at' => ['nullable', 'date'],
                'customer_email' => ['nullable', 'email', 'max:255'],
                'line_items' => ['sometimes', 'array', 'min:1'],
                'line_items.*.type' => ['required_with:line_items', 'string', 'in:time,product,adjustment'],
                'line_items.*.description' => ['required_with:line_items', 'string', 'max:255'],
                'line_items.*.quantity' => ['required_with:line_items', 'numeric', 'min:0'],
                'line_items.*.unit_price' => ['required_with:line_items', 'numeric', 'min:0'],
                'line_items.*.subtotal' => ['required_with:line_items', 'numeric', 'min:0'],
                'payments' => ['sometimes', 'array'],
                'payments.*.method' => ['required_with:payments', 'string', Rule::in(config('pos.payment_methods', []))],
                'payments.*.amount' => ['required_with:payments', 'numeric', 'min:0'],
            ]);

            DB::transaction(function () use ($receipt, $data) {
                if (array_key_exists('customer_email', $data)) {
                    $receipt->customer_email = $data['customer_email'] ?: null;
                }

                if (array_key_exists('status', $data)) {
                    if ($data['status'] === 'paid' && $receipt->checkout_session_id) {
                        $latest = Receipt::where('checkout_session_id', $receipt->checkout_session_id)->latest('id')->first();
                        if ($receipt->checkoutSession->isOpen() || $latest->id !== $receipt->id) {
                            throw ValidationException::withMessages(['status' => 'Complete the open tab to issue its payment receipt.']);
                        }
                    }
                    $receipt->status = $data['status'];
                    if ($data['status'] === 'paid') {
                        $receipt->paid_at ??= now('UTC');
                    } elseif ($data['status'] === 'unpaid') {
                        $receipt->paid_at = null;
                    }
                    if ($data['status'] === 'voided') {
                        $receipt->voided_at = $receipt->voided_at ?? now();
                    } else {
                        $receipt->voided_at = null;
                        $receipt->void_reason = null;
                    }
                }

                if (array_key_exists('paid_at', $data)) {
                    $receipt->paid_at = $data['paid_at'] ? Carbon::parse($data['paid_at'], PosDate::timezone())->utc() : null;
                    if ($receipt->status !== 'voided') {
                        $receipt->status = $receipt->paid_at ? 'paid' : 'unpaid';
                    }
                }

                if (array_key_exists('line_items', $data)) {
                    $receipt->lineItems()->delete();
                    foreach ($data['line_items'] as $li) {
                        $receipt->lineItems()->create([
                            'type' => $li['type'],
                            'description' => $li['description'],
                            'quantity' => $li['quantity'],
                            'unit_price' => $li['unit_price'],
                            'subtotal' => $li['subtotal'],
                        ]);
                    }

                    $timeTotal = (float) collect($data['line_items'])->where('type', 'time')->sum('subtotal');
                    $productsTotal = (float) collect($data['line_items'])->whereIn('type', ['product', 'adjustment'])->sum('subtotal');
                    $grandTotal = round($timeTotal + $productsTotal, 2);
                    $receipt->time_total = round($timeTotal, 2);
                    $receipt->products_total = round($productsTotal, 2);
                    $receipt->grand_total = $grandTotal;
                }

                if (array_key_exists('payments', $data)) {
                    $receipt->payments()->delete();
                    foreach ($data['payments'] as $p) {
                        if ((float) $p['amount'] <= 0) {
                            continue;
                        }
                        $receipt->payments()->create([
                            'method' => $p['method'],
                            'amount' => round((float) $p['amount'], 2),
                        ]);
                    }
                }

                $receipt->save();
            });

            return response()->json(['message' => 'Receipt updated.']);
        });
    }

    public function void(Request $request, Receipt $receipt)
    {
        return PosTransaction::receipt($receipt, function (Receipt $receipt) use ($request) {
            $data = $request->validate([
                'reason' => ['nullable', 'string', 'max:255'],
            ]);

            $receipt->update([
                'status' => 'voided',
                'voided_at' => now(),
                'void_reason' => $data['reason'] ?? null,
            ]);

            return response()->json(['message' => 'Receipt voided.']);
        });
    }

    public function destroy(Receipt $receipt)
    {
        return PosTransaction::receipt($receipt, function (Receipt $receipt) {
            $receipt->delete();

            return response()->json(['message' => 'Receipt deleted.']);
        });
    }

    public function exportCsv(Request $request)
    {
        [$localStart, $localEnd, $mode, $date, $month] = PosDate::reportRange($request);
        $start = $localStart->utc();
        $end = $localEnd->utc();

        $receipts = Receipt::paid()
            ->whereBetween('paid_at', [$start, $end])
            ->with(['lineItems', 'payments'])
            ->orderByDesc('paid_at')
            ->get(['id', 'receipt_number', 'paid_at', 'customer_email', 'time_total', 'products_total', 'grand_total', 'status']);

        $lines = [];
        $lines[] = ['id', 'receipt_number', 'paid_at', 'status', 'customer_email', 'line_type', 'description', 'quantity', 'unit_price', 'line_subtotal', 'table_time_started', 'table_time_ended', 'table_duration', 'payment_split', 'time_total', 'products_total', 'grand_total'];
        foreach ($receipts as $r) {
            $paymentSplit = $r->payments->map(fn ($payment) => $payment->method.' '.number_format((float) $payment->amount, 2, '.', ''))->implode(' | ');
            $items = $r->lineItems;
            if ($items->isEmpty()) {
                $items = collect([null]);
            }
            foreach ($items as $item) {
                $meta = $item?->meta ?? [];
                $lines[] = [
                    $r->id, $r->receipt_number, $r->paid_at?->copy()->setTimezone(PosDate::timezone())->toIso8601String(), $r->status, $r->customer_email,
                    $item?->type, $item?->description, $item ? (float) $item->quantity : null, $item ? (float) $item->unit_price : null,
                    $item ? (float) $item->subtotal : null, $meta['from'] ?? null, $meta['to'] ?? null, $meta['duration'] ?? null,
                    $paymentSplit, (float) $r->time_total, (float) $r->products_total, (float) $r->grand_total,
                ];
            }
        }

        $filename = 'receipts_'.($mode === 'monthly' ? $month : $date).'.csv';

        $handle = fopen('php://temp', 'r+');
        foreach ($lines as $row) {
            fputcsv($handle, $row);
        }
        rewind($handle);
        $csv = stream_get_contents($handle);
        fclose($handle);

        return response($csv, 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="'.$filename.'"',
        ]);
    }
}
