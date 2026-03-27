<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SessionItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'game_session_id',
        'product_id',
        'product_name',
        'product_category',
        'quantity',
        'unit_price',
        'total_price',
    ];

    public function session()
    {
        return $this->belongsTo(GameSession::class, 'game_session_id');
    }

    public function product()
    {
        return $this->belongsTo(Product::class);
    }
}
