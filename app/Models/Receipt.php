<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Receipt extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $fillable = [
        'game_session_id',
        'checkout_session_id',
        'receipt_number',
        'time_total',
        'products_total',
        'grand_total',
        'customer_email',
        'paid_at',
        'status',
        'voided_at',
        'void_reason',
    ];

    protected $casts = [
        'paid_at' => 'datetime',
        'voided_at' => 'datetime',
    ];

    public function session()
    {
        return $this->belongsTo(GameSession::class, 'game_session_id');
    }

    public function checkoutSession()
    {
        return $this->belongsTo(CheckoutSession::class);
    }

    public function payments()
    {
        return $this->hasMany(ReceiptPayment::class);
    }

    public function lineItems()
    {
        return $this->hasMany(ReceiptLineItem::class);
    }
}
