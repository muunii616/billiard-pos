import { Head, Link, router } from '@inertiajs/react';
import { Wallet } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/layouts/app-layout';
import { formatMoney, roundToNearestIncrement } from '@/lib/payments';
import { dashboard } from '@/routes';
import tablesRoutes from '@/routes/tables';
import type { BreadcrumbItem } from '@/types';

type TodayStats = {
    revenue: number;
    revenue_time: number;
    revenue_products: number;
    sessions_count: number;
    tables_in_use: number;
    tables_total: number;
    open_tabs_count: number;
};

type TableRow = {
    id: number;
    name: string;
    status: string;
    elapsed_seconds: number | null;
    elapsed_formatted: string | null;
    current_bill: number | null;
    started_at: string | null;
    duration_formatted: string | null;
    session_status: string | null;
    last_resume_at: string | null;
    items_total: number;
};

type RunningSession = {
    table_id: number;
    table_name: string;
    started_at: string | null;
    duration_formatted: string | null;
    current_bill: number;
    elapsed_seconds: number;
    session_status: string | null;
    last_resume_at: string | null;
    items_total: number;
};

type Props = {
    today: TodayStats;
    rate_per_minute: number;
    rounding_increment: number;
    tables: TableRow[];
    running_sessions: RunningSession[];
    isAdmin: boolean;
};

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Dashboard', href: dashboard.url() },
];

const RATE_PER_MINUTE = 20000 / 60;
const ROUNDING_INCREMENT = 500;

function formatElapsed(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');

    return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);

    if (m >= 60) {
        return `${Math.floor(m / 60)}h ${m % 60}m`;
    }

    return `${m}m`;
}

export default function Dashboard({
    today,
    rate_per_minute,
    rounding_increment,
    tables,
    running_sessions,
}: Props) {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        router.reload({
            only: [
                'today',
                'tables',
                'running_sessions',
                'rate_per_minute',
                'rounding_increment',
            ],
        });
    }, []);

    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);

        return () => clearInterval(id);
    }, []);

    const getLiveElapsedSeconds = useCallback(
        (row: TableRow): number | null => {
            if (row.elapsed_seconds == null) {
                return null;
            }

            if (row.session_status === 'paused') {
                return row.elapsed_seconds;
            }

            if (!row.last_resume_at) {
                return row.elapsed_seconds;
            }

            const resumeMs = new Date(row.last_resume_at).getTime();

            return (
                row.elapsed_seconds +
                Math.max(0, Math.floor((now - resumeMs) / 1000))
            );
        },
        [now],
    );

    const getLiveBill = useCallback(
        (row: TableRow): number | null => {
            const sec = getLiveElapsedSeconds(row);

            if (sec == null) {
                return null;
            }

            const rawTimeTotal =
                (sec / 60) * (rate_per_minute ?? RATE_PER_MINUTE);
            const timeTotal = roundToNearestIncrement(
                rawTimeTotal,
                rounding_increment ?? ROUNDING_INCREMENT,
            );

            return Math.round((timeTotal + (row.items_total ?? 0)) * 100) / 100;
        },
        [getLiveElapsedSeconds, rate_per_minute, rounding_increment],
    );

    const getRunningSessionLive = useCallback(
        (s: RunningSession) => {
            let sec = s.elapsed_seconds;

            if (s.session_status === 'running' && s.last_resume_at) {
                const resumeMs = new Date(s.last_resume_at).getTime();
                sec =
                    s.elapsed_seconds +
                    Math.max(0, Math.floor((now - resumeMs) / 1000));
            }

            const rawTimeTotal =
                (sec / 60) * (rate_per_minute ?? RATE_PER_MINUTE);
            const timeTotal = roundToNearestIncrement(
                rawTimeTotal,
                rounding_increment ?? ROUNDING_INCREMENT,
            );
            const bill =
                Math.round((timeTotal + (s.items_total ?? 0)) * 100) / 100;

            return { duration: formatDuration(sec), bill };
        },
        [now, rate_per_minute, rounding_increment],
    );

    const statusLabel = (table: TableRow) => {
        if (table.status === 'maintenance') {
            return 'Maintenance';
        }

        if (table.session_status === 'paused') {
            return 'Paused';
        }

        if (table.session_status === 'running') {
            return 'In Play';
        }

        return 'Available';
    };

    const statusDot = (table: TableRow) => {
        if (table.status === 'maintenance') {
            return 'bg-red-500';
        }

        if (table.session_status === 'paused') {
            return 'bg-amber-500';
        }

        if (table.session_status === 'running') {
            return 'bg-emerald-500';
        }

        return 'bg-slate-400';
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Dashboard" />
            <div className="flex flex-1 flex-col gap-6 overflow-x-auto rounded-xl p-4">
                <section>
                    <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                        Today at a glance
                    </h2>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-xl border border-sidebar-border/70 bg-card p-4 shadow-sm dark:border-sidebar-border">
                            <p className="text-xs font-medium text-muted-foreground">
                                Revenue
                            </p>
                            <div className="mt-2 space-y-1 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">
                                        Table time
                                    </span>
                                    <span className="font-medium tabular-nums">
                                        {formatMoney(
                                            Number(today.revenue_time) || 0,
                                        )}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">
                                        Food & drinks
                                    </span>
                                    <span className="font-medium tabular-nums">
                                        {formatMoney(
                                            Number(today.revenue_products) || 0,
                                        )}
                                    </span>
                                </div>
                            </div>
                            <p className="mt-2 border-t border-sidebar-border/70 pt-2 text-xl font-semibold tabular-nums">
                                {formatMoney(Number(today.revenue) || 0)}
                            </p>
                        </div>
                        <div className="rounded-xl border border-sidebar-border/70 bg-card p-4 shadow-sm dark:border-sidebar-border">
                            <p className="text-xs font-medium text-muted-foreground">
                                Sessions
                            </p>
                            <p className="mt-1 text-2xl font-semibold tabular-nums">
                                {today.sessions_count ?? 0}
                            </p>
                        </div>
                        <div className="rounded-xl border border-sidebar-border/70 bg-card p-4 shadow-sm dark:border-sidebar-border">
                            <p className="text-xs font-medium text-muted-foreground">
                                Tables in use
                            </p>
                            <p className="mt-1 text-2xl font-semibold tabular-nums">
                                {today.tables_in_use ?? 0}
                                <span className="ml-1 text-base font-normal text-muted-foreground">
                                    / {today.tables_total ?? 0}
                                </span>
                            </p>
                        </div>
                        <Link
                            href="/checkouts"
                            className="rounded-xl border border-sidebar-border/70 bg-card p-4 shadow-sm transition-colors hover:bg-muted/50 dark:border-sidebar-border"
                        >
                            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                <Wallet className="h-4 w-4" />
                                Open tab
                            </div>
                            <p className="mt-1 text-2xl font-semibold tabular-nums">
                                {today.open_tabs_count ?? 0}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                unpaid tabs
                            </p>
                        </Link>
                    </div>
                </section>

                <section>
                    <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                        All tables
                    </h2>
                    <div className="rounded-xl border border-sidebar-border/70 bg-card dark:border-sidebar-border">
                        <ul className="divide-y divide-sidebar-border/70">
                            {tables.map((table) => {
                                const liveElapsed =
                                    getLiveElapsedSeconds(table);
                                const liveBill = getLiveBill(table);

                                return (
                                    <li key={table.id}>
                                        <Link
                                            href={tablesRoutes.index.url()}
                                            className="flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/50"
                                        >
                                            <div className="flex items-center gap-3">
                                                <span
                                                    className={`h-3 w-3 shrink-0 rounded-full ${statusDot(table)}`}
                                                    aria-hidden
                                                />
                                                <span className="font-medium">
                                                    {table.name}
                                                </span>
                                                <span className="text-sm text-muted-foreground">
                                                    {statusLabel(table)}
                                                </span>
                                            </div>
                                            {(table.session_status ===
                                                'running' ||
                                                table.session_status ===
                                                    'paused') &&
                                                liveElapsed != null && (
                                                    <span className="text-muted-foreground tabular-nums">
                                                        {formatElapsed(
                                                            liveElapsed,
                                                        )}
                                                        {liveBill != null && (
                                                            <span className="ml-2 font-medium text-foreground">
                                                                {formatMoney(
                                                                    liveBill,
                                                                )}
                                                            </span>
                                                        )}
                                                    </span>
                                                )}
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                </section>

                <section>
                    <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                        Currently running sessions
                    </h2>
                    {running_sessions.length === 0 ? (
                        <div className="rounded-xl border border-sidebar-border/70 bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground dark:border-sidebar-border">
                            No active sessions. Start a game from Tables.
                        </div>
                    ) : (
                        <div className="overflow-hidden rounded-xl border border-sidebar-border/70 bg-card dark:border-sidebar-border">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-sidebar-border/70 bg-muted/50">
                                        <th className="px-4 py-3 text-left font-medium">
                                            Table
                                        </th>
                                        <th className="px-4 py-3 text-left font-medium">
                                            Start time
                                        </th>
                                        <th className="px-4 py-3 text-left font-medium">
                                            Duration
                                        </th>
                                        <th className="px-4 py-3 text-right font-medium">
                                            Current bill
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {running_sessions.map((s) => {
                                        const live = getRunningSessionLive(s);

                                        return (
                                            <tr
                                                key={s.table_id}
                                                className="border-b border-sidebar-border/50 last:border-0"
                                            >
                                                <td className="px-4 py-3">
                                                    <Link
                                                        href={tablesRoutes.index.url()}
                                                        className="font-medium text-primary underline-offset-4 hover:underline"
                                                    >
                                                        {s.table_name}
                                                    </Link>
                                                </td>
                                                <td className="px-4 py-3 text-muted-foreground">
                                                    {s.started_at ?? '—'}
                                                </td>
                                                <td className="px-4 py-3 tabular-nums">
                                                    {live.duration}
                                                </td>
                                                <td className="px-4 py-3 text-right font-medium tabular-nums">
                                                    {formatMoney(live.bill)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </div>
        </AppLayout>
    );
}
