<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class CheckoutSession extends Model
{
    public const STATUS_OPEN = 'open';

    protected $fillable = [
        'status',
        'completed_at',
    ];

    protected $casts = [
        'completed_at' => 'datetime',
    ];

    public function gameSessions(): HasMany
    {
        return $this->hasMany(GameSession::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(CheckoutSessionItem::class, 'checkout_session_id');
    }

    public function receipt(): HasOne
    {
        return $this->hasOne(Receipt::class);
    }

    public function scopeOpen(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_OPEN);
    }

    public function isOpen(): bool
    {
        return (string) $this->status === self::STATUS_OPEN;
    }
}
