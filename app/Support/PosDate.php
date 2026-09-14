<?php

namespace App\Support;

use Carbon\CarbonImmutable;
use Illuminate\Http\Request;

final class PosDate
{
    public static function timezone(): string
    {
        return config('app.display_timezone', 'Asia/Ulaanbaatar');
    }

    public static function now(): CarbonImmutable
    {
        return CarbonImmutable::now(self::timezone());
    }

    public static function day(string $date): CarbonImmutable
    {
        return CarbonImmutable::createFromFormat('!Y-m-d', $date, self::timezone());
    }

    public static function month(string $month): CarbonImmutable
    {
        return CarbonImmutable::createFromFormat('!Y-m', $month, self::timezone());
    }

    /** Local calendar boundaries. Convert to UTC only when querying storage. */
    public static function reportRange(Request $request, string $periodKey = 'mode'): array
    {
        $data = $request->validate([
            $periodKey => ['sometimes', 'required', $periodKey === 'period' ? 'in:daily,monthly,range' : 'in:daily,monthly'],
            'date' => ['sometimes', 'required', 'date_format:Y-m-d'],
            'month' => ['sometimes', 'required', 'date_format:Y-m'],
            'from' => ['required_if:'.$periodKey.',range', 'date_format:Y-m-d'],
            'to' => ['required_if:'.$periodKey.',range', 'date_format:Y-m-d', 'after_or_equal:from'],
        ]);
        $period = $data[$periodKey] ?? 'daily';
        $date = $data['date'] ?? self::now()->toDateString();
        $month = $data['month'] ?? self::now()->format('Y-m');
        [$start, $end] = match ($period) {
            'monthly' => [self::month($month), self::month($month)->endOfMonth()],
            'range' => [self::day($data['from']), self::day($data['to'])->endOfDay()],
            default => [self::day($date), self::day($date)->endOfDay()],
        };

        return [$start, $end, $period, $date, $period === 'monthly' ? $month : $start->format('Y-m')];
    }
}
