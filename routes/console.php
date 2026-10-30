<?php

use Illuminate\Support\Facades\Schedule;

Schedule::command('pos:backup')
    ->hourly()
    ->withoutOverlapping();

if (config('operations.offsite_backup.directory')) {
    Schedule::command('pos:backup-offsite')
        ->dailyAt('02:15')
        ->withoutOverlapping();
}
