<?php

namespace App\Support;

use Illuminate\Validation\ValidationException;

final class TableTimeBilling
{
    /**
     * @return array<int, array{minutes: int, price: float, label: string, key: string}>
     */
    public static function blocks(): array
    {
        $configured = config('pos.time_blocks', []);
        if (! is_array($configured) || $configured === []) {
            $configured = [
                ['minutes' => 60, 'price' => 20000, 'label' => '1 hour'],
                ['minutes' => 30, 'price' => 10000, 'label' => '30 min'],
                ['minutes' => 15, 'price' => 5000, 'label' => '15 min'],
            ];
        }

        $blocks = [];
        foreach ($configured as $block) {
            $minutes = (int) ($block['minutes'] ?? 0);
            if ($minutes <= 0) {
                continue;
            }

            $blocks[] = [
                'minutes' => $minutes,
                'price' => round((float) ($block['price'] ?? 0), 2),
                'label' => (string) ($block['label'] ?? $minutes.' min'),
                'key' => (string) $minutes,
            ];
        }

        return $blocks;
    }

    /**
     * @return array<string, array{minutes: int, price: float, label: string, key: string}>
     */
    public static function blocksByKey(): array
    {
        $map = [];
        foreach (self::blocks() as $block) {
            $map[$block['key']] = $block;
        }

        return $map;
    }

    /**
     * Normalize request counts keyed by block minutes.
     *
     * @param  array<string|int, mixed>  $input
     * @return array<string, int>
     */
    public static function normalizeCounts(array $input): array
    {
        $counts = [];
        foreach (self::blocks() as $block) {
            $raw = $input[$block['key']] ?? $input[$block['minutes']] ?? 0;
            $count = max(0, (int) $raw);
            if ($count > 0) {
                $counts[$block['key']] = $count;
            }
        }

        return $counts;
    }

    /**
     * @param  array<string, int>  $counts
     */
    public static function totalMinutesForBlocks(array $counts): int
    {
        $catalog = self::blocksByKey();
        $total = 0;
        foreach ($counts as $key => $count) {
            if (! isset($catalog[$key]) || $count <= 0) {
                continue;
            }
            $total += $catalog[$key]['minutes'] * $count;
        }

        return $total;
    }

    /**
     * @param  array<string, int>  $counts
     */
    public static function totalForBlocks(array $counts): float
    {
        $catalog = self::blocksByKey();
        $total = 0.0;
        foreach ($counts as $key => $count) {
            if (! isset($catalog[$key]) || $count <= 0) {
                continue;
            }
            $total += $catalog[$key]['price'] * $count;
        }

        return round($total, 2);
    }

    /**
     * @param  array<string|int, mixed>|null  $input
     * @return array{counts: array<string, int>, time_total: float, total_minutes: int}
     */
    public static function fromRequestInput(?array $input): array
    {
        $counts = self::normalizeCounts(is_array($input) ? $input : []);

        return [
            'counts' => $counts,
            'time_total' => self::totalForBlocks($counts),
            'total_minutes' => self::totalMinutesForBlocks($counts),
        ];
    }

    /**
     * Validate that every key is a known block. Empty counts are allowed (products-only / free end).
     *
     * @param  array<string|int, mixed>|null  $input
     * @return array{counts: array<string, int>, time_total: float, total_minutes: int}
     */
    public static function parseOrFail(?array $input): array
    {
        if ($input === null) {
            $input = [];
        }

        if (! is_array($input)) {
            throw ValidationException::withMessages(['time_blocks' => 'Invalid time blocks.']);
        }

        // PHP coerces numeric string keys to ints; compare as strings.
        $allowed = array_map(strval(...), array_keys(self::blocksByKey()));
        foreach (array_keys($input) as $key) {
            if (! in_array((string) $key, $allowed, true)) {
                throw ValidationException::withMessages(['time_blocks' => 'Unknown time block selected.']);
            }
            if (! is_numeric($input[$key]) || (int) $input[$key] < 0) {
                throw ValidationException::withMessages(['time_blocks' => 'Time block counts must be zero or positive integers.']);
            }
        }

        return self::fromRequestInput($input);
    }

    /**
     * Receipt-ready line items for selected blocks.
     *
     * @param  array<string, int>  $counts
     * @return array<int, array<string, mixed>>
     */
    public static function lineItemsForBlocks(array $counts): array
    {
        $catalog = self::blocksByKey();
        $lines = [];
        foreach ($counts as $key => $count) {
            if (! isset($catalog[$key]) || $count <= 0) {
                continue;
            }
            $block = $catalog[$key];
            $lines[] = [
                'type' => 'time',
                'description' => $block['label'],
                'quantity' => $count,
                'unit_price' => $block['price'],
                'subtotal' => round($block['price'] * $count, 2),
                'minutes' => $block['minutes'],
                'block_key' => $block['key'],
            ];
        }

        return $lines;
    }

    /** Total alert seconds for stacked block counts. */
    public static function secondsForBlocks(array $counts): int
    {
        return self::totalMinutesForBlocks($counts) * 60;
    }
}
