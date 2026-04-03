<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ReceiptLineItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'receipt_id',
        'type',
        'description',
        'quantity',
        'unit_price',
        'subtotal',
        'meta',
    ];

    protected $casts = [
        'quantity' => 'decimal:2',
        'unit_price' => 'decimal:2',
        'subtotal' => 'decimal:2',
        'meta' => 'array',
    ];

    public function receipt()
    {
        return $this->belongsTo(Receipt::class);
    }
}

