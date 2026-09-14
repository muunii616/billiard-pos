<?php

namespace App\Support;

use App\Models\BilliardTable;
use App\Models\CheckoutSession;
use App\Models\Receipt;
use Illuminate\Support\Facades\DB;

final class PosTransaction
{
    // Every writer locks the owner before reading its state or changing its items.
    // Refetching also prevents stale route-bound models from repeating an operation.
    public static function table(BilliardTable $table, callable $action): mixed
    {
        return DB::transaction(fn () => $action(
            BilliardTable::query()->lockForUpdate()->findOrFail($table->id),
        ), 3);
    }

    public static function checkout(CheckoutSession $checkout, callable $action): mixed
    {
        return DB::transaction(fn () => $action(
            CheckoutSession::query()->lockForUpdate()->findOrFail($checkout->id),
        ), 3);
    }

    public static function receipt(Receipt $receipt, callable $action): mixed
    {
        return DB::transaction(function () use ($receipt, $action) {
            if ($receipt->checkout_session_id) {
                CheckoutSession::query()->lockForUpdate()->findOrFail($receipt->checkout_session_id);
            }

            return $action(Receipt::query()->lockForUpdate()->findOrFail($receipt->id));
        }, 3);
    }
}
