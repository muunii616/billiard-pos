<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CashSessionProductStock extends Model
{
    protected $fillable = ['cash_session_id', 'product_id', 'opening_stock'];

    protected $casts = ['opening_stock' => 'integer'];

    public function product()
    {
        return $this->belongsTo(Product::class);
    }
}
