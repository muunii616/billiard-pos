<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class GameSession extends Model
{
    use HasFactory;

    public const ACTIVE_STATUSES = ['running', 'paused'];

    protected $fillable = [
        'billiard_table_id',
        'checkout_session_id',
        'user_id',
        'status',
        'started_at',
        'paused_at',
        'total_played_seconds',
        'last_resume_at',
        'ended_at',
        'total_minutes',
        'time_total',
    ];

    protected $casts = [
        'started_at' => 'datetime',
        'paused_at' => 'datetime',
        'last_resume_at' => 'datetime',
        'ended_at' => 'datetime',
    ];

    public function table()
    {
        return $this->belongsTo(BilliardTable::class, 'billiard_table_id');
    }

    public function checkoutSession()
    {
        return $this->belongsTo(CheckoutSession::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function items()
    {
        return $this->hasMany(SessionItem::class);
    }

    public function receipt()
    {
        return $this->hasOne(Receipt::class);
    }

    public static function activeStatuses(): array
    {
        return self::ACTIVE_STATUSES;
    }

    public function isActive(): bool
    {
        return in_array((string) $this->status, self::ACTIVE_STATUSES, true);
    }
}
