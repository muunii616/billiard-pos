<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BilliardTable extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'status',
        'rotation',
        'sort_order',
    ];

    protected $casts = [
        'rotation' => 'integer',
        'sort_order' => 'integer',
    ];

    public function sessions()
    {
        return $this->hasMany(GameSession::class);
    }

    public function latestGameSession()
    {
        return $this->hasOne(GameSession::class)->latestOfMany();
    }

    public static function activeSessionStatuses(): array
    {
        return GameSession::activeStatuses();
    }

    public function latestActiveSession(array $with = []): ?GameSession
    {
        // Look up any running/paused session — not only when the newest row is active.
        // Older "ghost" sessions can otherwise block Start while Cancel thinks nothing is open.
        $query = $this->sessions()
            ->whereIn('status', GameSession::ACTIVE_STATUSES)
            ->latest('id');

        if (! empty($with)) {
            $query->with($with);
        }

        return $query->first();
    }
}
