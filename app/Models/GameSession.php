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
        'alert_at_played_seconds',
        'time_blocks',
        'cancel_reason',
        'cancelled_by_user_id',
        'stock_restored',
    ];

    protected $casts = [
        'started_at' => 'datetime',
        'paused_at' => 'datetime',
        'last_resume_at' => 'datetime',
        'ended_at' => 'datetime',
        'time_blocks' => 'array',
        'stock_restored' => 'boolean',
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

    public function cancelledBy()
    {
        return $this->belongsTo(User::class, 'cancelled_by_user_id');
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

    public function playedSeconds(?\DateTimeInterface $asOf = null): int
    {
        $base = (int) $this->total_played_seconds;
        $resumeAt = $this->last_resume_at ?? $this->started_at;

        if ($this->status !== 'running' || ! $resumeAt) {
            return $base;
        }

        return $base + max(0, (int) $resumeAt->diffInSeconds($asOf ?? now('UTC'), false));
    }

    /** Remaining seconds until the play-time alert target; null when no alert is set. */
    public function alertRemainingSeconds(?\DateTimeInterface $asOf = null): ?int
    {
        if ($this->alert_at_played_seconds === null) {
            return null;
        }

        return max(0, (int) $this->alert_at_played_seconds - $this->playedSeconds($asOf));
    }

    public function hasAlert(): bool
    {
        return $this->alert_at_played_seconds !== null;
    }

    public function clearAlert(): void
    {
        $this->alert_at_played_seconds = null;
    }

    /** @param  array<string, int>  $counts */
    public function setAlertFromBlocks(array $counts, bool $extend = false, ?\DateTimeInterface $asOf = null): void
    {
        $addSeconds = \App\Support\TableTimeBilling::secondsForBlocks($counts);
        if ($addSeconds <= 0) {
            return;
        }

        $played = $this->playedSeconds($asOf);
        $currentTarget = $this->alert_at_played_seconds;

        if ($extend && $currentTarget !== null && $currentTarget > $played) {
            $this->alert_at_played_seconds = (int) $currentTarget + $addSeconds;
        } else {
            $this->alert_at_played_seconds = $played + $addSeconds;
        }
    }
}
