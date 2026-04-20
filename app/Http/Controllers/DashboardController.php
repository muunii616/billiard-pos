<?php

namespace App\Http\Controllers;

use App\Models\BilliardTable;
use App\Models\CheckoutSession;
use App\Models\GameSession;
use App\Models\Receipt;
use Illuminate\Support\Carbon;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    /** Billable seconds for a running/paused session (played time only). */
    private function sessionPlayedSeconds(GameSession $session, ?\DateTimeInterface $asOf = null): int
    {
        $asOf = $asOf ?? now();
        $base = (int) ($session->total_played_seconds ?? 0);
        if ($session->status === 'paused') {
            return $base;
        }
        $resumeAt = $session->last_resume_at ?? $session->started_at;
        if (! $resumeAt) {
            return $base;
        }
        $resumeAt = $resumeAt instanceof \Carbon\Carbon ? $resumeAt->copy()->setTimezone(config('app.timezone')) : \Carbon\Carbon::parse($resumeAt, config('app.timezone'));
        $now = $asOf instanceof \Carbon\Carbon ? $asOf->copy()->setTimezone(config('app.timezone')) : \Carbon\Carbon::parse($asOf, config('app.timezone'));

        return $base + max(0, (int) $resumeAt->diffInSeconds($now, true));
    }

    public function __invoke(): Response
    {
        $todayStart = Carbon::today()->startOfDay();
        $todayEnd = Carbon::today()->endOfDay();

        $revenueSums = Receipt::whereBetween('paid_at', [$todayStart, $todayEnd])
            ->selectRaw('COALESCE(SUM(grand_total), 0) as total, COALESCE(SUM(time_total), 0) as time_total, COALESCE(SUM(products_total), 0) as products_total')
            ->first();
        $todayRevenue = (float) ($revenueSums->total ?? 0);
        $todayRevenueTime = (float) ($revenueSums->time_total ?? 0);
        $todayRevenueProducts = (float) ($revenueSums->products_total ?? 0);

        $openTabsCount = CheckoutSession::query()->open()->count();

        $sessionsToday = GameSession::where('status', 'completed')
            ->whereBetween('ended_at', [$todayStart, $todayEnd])
            ->count();

        $tablesInUse = BilliardTable::whereIn('status', BilliardTable::activeSessionStatuses())->count();
        $tablesTotal = BilliardTable::count();

        $isAdmin = auth()->user()?->role === 'admin';

        $now = now();
        $appTz = config('app.timezone');

        $tables = BilliardTable::with(['sessions' => function ($q) {
            $q->with('items')->latest()->limit(1);
        }])->orderBy('id')->get()->map(function (BilliardTable $table) use ($now, $appTz) {
            $session = $table->sessions->first();
            $inPlay = $session?->isActive() ?? false;

            $elapsedSeconds = null;
            $elapsedFormatted = null;
            $currentBill = null;
            $startedAt = null;
            $durationFormatted = null;
            $lastResumeAt = null;
            $itemsTotal = 0;

            if ($inPlay) {
                $elapsedSeconds = $this->sessionPlayedSeconds($session, $now);
                $elapsedFormatted = gmdate('H:i:s', $elapsedSeconds);
                $timeTotal = round(($elapsedSeconds / 60) * (float) config('pos.rate_per_minute', 0.20), 2);
                $itemsTotal = (float) $session->items->sum('total_price');
                $currentBill = round(max(0, $timeTotal + $itemsTotal), 2);
                $startedAt = $session->started_at?->copy()->setTimezone($appTz)->format('g:i A');
                $minutes = (int) floor($elapsedSeconds / 60);
                $durationFormatted = $minutes >= 60
                    ? (int) floor($minutes / 60) . 'h ' . ($minutes % 60) . 'm'
                    : $minutes . 'm';
                if ($session->status === 'running' && $session->last_resume_at) {
                    $lastResumeAt = $session->last_resume_at->toIso8601String();
                }
            }

            return [
                'id' => $table->id,
                'name' => $table->name,
                'status' => $table->status,
                'elapsed_seconds' => $elapsedSeconds,
                'elapsed_formatted' => $elapsedFormatted,
                'current_bill' => $currentBill,
                'started_at' => $startedAt,
                'duration_formatted' => $durationFormatted,
                'session_status' => $session?->status ?? null,
                'last_resume_at' => $lastResumeAt,
                'items_total' => $itemsTotal,
            ];
        });

        $runningSessions = $tables
            ->filter(fn ($t) => $t['elapsed_seconds'] !== null)
            ->values()
            ->map(fn ($t) => [
                'table_id' => $t['id'],
                'table_name' => $t['name'],
                'started_at' => $t['started_at'],
                'duration_formatted' => $t['duration_formatted'],
                'current_bill' => $t['current_bill'],
                'elapsed_seconds' => $t['elapsed_seconds'],
                'session_status' => $t['session_status'],
                'last_resume_at' => $t['last_resume_at'] ?? null,
                'items_total' => $t['items_total'],
            ])
            ->all();

        return Inertia::render('dashboard', [
            'today' => [
                'revenue' => $todayRevenue,
                'revenue_time' => $todayRevenueTime,
                'revenue_products' => $todayRevenueProducts,
                'sessions_count' => $sessionsToday,
                'tables_in_use' => $tablesInUse,
                'tables_total' => $tablesTotal,
                'open_tabs_count' => $openTabsCount,
            ],
            'rate_per_minute' => (float) config('pos.rate_per_minute', 0.20),
            'tables' => $tables,
            'running_sessions' => $runningSessions,
            'isAdmin' => $isAdmin,
        ]);
    }
}
