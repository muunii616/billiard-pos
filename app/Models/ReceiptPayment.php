<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ReceiptPayment extends Model
{
    use HasFactory;

    protected $fillable = [
        'receipt_id',
        'method',
        'amount',
    ];

    public function receipt()
    {
        return $this->belongsTo(Receipt::class);
    }
}
