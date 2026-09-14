<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StockAdjustment extends Model
{
    protected $fillable = ['product_id', 'user_id', 'quantity_change', 'stock_after', 'note', 'adjusted_at'];

    protected $casts = ['quantity_change' => 'integer', 'stock_after' => 'integer', 'adjusted_at' => 'datetime'];

    public function product()
    {
        return $this->belongsTo(Product::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
