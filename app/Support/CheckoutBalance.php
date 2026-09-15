<?php

namespace App\Support;

use App\Models\CheckoutSession;
use App\Models\Receipt;

final class CheckoutBalance
{
    /** Sum of paid (non-voided) receipts already applied to this tab. */
    public static function amountPaid(CheckoutSession $checkout): float
    {
        return round((float) Receipt::query()
            ->where('checkout_session_id', $checkout->id)
            ->where('status', 'paid')
            ->sum('grand_total'), 2);
    }

    public static function remaining(float $grandTotal, float $amountPaid): float
    {
        return round(max(0, $grandTotal - $amountPaid), 2);
    }
}
