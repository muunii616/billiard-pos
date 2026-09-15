<?php

namespace App\Http\Controllers;

use App\Models\BilliardTable;
use App\Models\CheckoutSession;
use App\Models\GameSession;
use App\Models\Receipt;
use App\Support\PosDate;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    public function __invoke(): Response
    {
        $todayStart = PosDate::now()->startOfDay()->utc();
        $todayEnd = PosDate::now()->endOfDay()->utc();

        $revenueSums = Receipt::paid()->whereBetween('paid_at', [$todayStart, $todayEnd])
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
        $appTz = config('app.display_timezone');

        $tables = BilliardTable::with(['latestGameSession.items'])->orderBy('id')->get()->map(function (BilliardTable $table) use ($now, $appTz) {
            $session = $table->latestGameSession;
            $inPlay = $session?->isActive() ?? false;

            $elapsedSeconds = null;
            $elapsedFormatted = null;
            $currentBill = null;
            $startedAt = null;
            $durationFormatted = null;
            $lastResumeAt = null;
            $itemsTotal = 0;

            if ($inPlay) {
                $playedSeconds = $session->playedSeconds($now);
                $elapsedFormatted = gmdate('H:i:s', $playedSeconds);
                $itemsTotal = (float) $session->items->sum('total_price');
                // Table time is billed manually in blocks at checkout — no live ₮ estimate.
                $currentBill = $itemsTotal > 0 ? round($itemsTotal, 2) : null;
                $startedAt = $session->started_at?->copy()->setTimezone($appTz)->format('g:i A');
                $minutes = (int) floor($playedSeconds / 60);
                $durationFormatted = $minutes >= 60
                    ? (int) floor($minutes / 60).'h '.($minutes % 60).'m'
                    : $minutes.'m';
                // The client derives the live segment from last_resume_at.
                $elapsedSeconds = (int) ($session->total_played_seconds ?? 0);
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
            'tables' => $tables,
            'running_sessions' => $runningSessions,
            'isAdmin' => $isAdmin,
        ]);
    }
}
