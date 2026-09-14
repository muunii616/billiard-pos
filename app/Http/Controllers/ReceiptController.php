<?php

namespace App\Http\Controllers;

use App\Mail\ReceiptMail;
use App\Models\Receipt;
use App\Support\ReceiptPresenter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;

class ReceiptController extends Controller
{
    public function sendEmail(Request $request, Receipt $receipt)
    {
        if (empty($receipt->customer_email)) {
            return response()->json(['message' => 'No customer email on this receipt.'], 422);
        }
        $payload = ReceiptPresenter::payload($receipt);
        Mail::to($receipt->customer_email)->queue(new ReceiptMail(
            $payload['receipt_number'], $payload['date'], $payload['time'],
            $payload['table_name'], $payload['customer_email'],
            $payload['line_items'], $payload['grand_total'],
        ));

        return response()->json(['message' => 'Receipt queued for delivery to '.$receipt->customer_email]);
    }
}
