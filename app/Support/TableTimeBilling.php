<?php

namespace App\Support;

final class TableTimeBilling
{
    public static function ratePerHour(): float
    {
        return (float) config('pos.rate_per_hour', 20000);
    }

    public static function ratePerMinute(): float
    {
        return self::ratePerHour() / 60;
    }

    public static function roundingIncrement(): int
    {
        return max(1, (int) config('pos.rounding_increment', 500));
    }

    public static function roundToIncrement(float $amount): float
    {
        $increment = self::roundingIncrement();

        return round($amount / $increment) * $increment;
    }

    public static function totalForSeconds(int $playedSeconds): float
    {
        $minutes = self::chargedMinutesForSeconds($playedSeconds);
        $rawTotal = $minutes * self::ratePerMinute();

        return self::roundToIncrement($rawTotal);
    }

    public static function chargedMinutesForSeconds(int $playedSeconds): int
    {
        $seconds = max(0, $playedSeconds);

        return (int) round($seconds / 300) * 5;
    }
}
