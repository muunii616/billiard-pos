<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StockUsage extends Model
{
    protected $fillable = ['product_id', 'user_id', 'quantity', 'unit_cost', 'total_cost', 'note', 'used_at'];

    protected $casts = ['quantity' => 'integer', 'unit_cost' => 'decimal:2', 'total_cost' => 'decimal:2', 'used_at' => 'datetime'];

    public function product()
    {
        return $this->belongsTo(Product::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
