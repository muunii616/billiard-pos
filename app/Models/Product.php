<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Product extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'category',
        'price',
        'cost_price',
        'is_active',
        'stock_quantity',
        'low_stock_threshold',
        'deal_product_id',
        'deal_buy_qty',
        'deal_get_qty',
        'deal_starts_on',
        'deal_ends_on',
    ];

    protected $casts = [
        'price' => 'decimal:2',
        'cost_price' => 'decimal:2',
        'is_active' => 'boolean',
        'stock_quantity' => 'integer',
        'low_stock_threshold' => 'integer',
        'deal_buy_qty' => 'integer',
        'deal_get_qty' => 'integer',
        'deal_starts_on' => 'date',
        'deal_ends_on' => 'date',
    ];

    public function sessionItems(): HasMany
    {
        return $this->hasMany(SessionItem::class);
    }

    public function dealProduct(): BelongsTo
    {
        return $this->belongsTo(self::class, 'deal_product_id');
    }

    public function dealOffers(): HasMany
    {
        return $this->hasMany(self::class, 'deal_product_id');
    }
}
