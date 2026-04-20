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
    ];

    public function sessions()
    {
        return $this->hasMany(GameSession::class);
    }

    public static function activeSessionStatuses(): array
    {
        return GameSession::activeStatuses();
    }

    public function latestSession(array $with = []): ?GameSession
    {
        $query = $this->sessions()->latest();
        if (! empty($with)) {
            $query->with($with);
        }

        return $query->first();
    }

    public function latestActiveSession(array $with = []): ?GameSession
    {
        $session = $this->latestSession($with);

        return $session?->isActive() ? $session : null;
    }
}
