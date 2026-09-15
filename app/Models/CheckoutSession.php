<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class CheckoutSession extends Model
{
    public const STATUS_OPEN = 'open';

    protected $fillable = [
        'status',
        'completed_at',
        'void_reason',
        'voided_by_user_id',
        'stock_restored',
    ];

    protected $casts = [
        'completed_at' => 'datetime',
        'stock_restored' => 'boolean',
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
        return $this->hasOne(Receipt::class)->latestOfMany();
    }

    public function receipts(): HasMany
    {
        return $this->hasMany(Receipt::class);
    }

    public function voidedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'voided_by_user_id');
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
