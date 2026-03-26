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
}
