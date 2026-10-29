import { Head, Link, router } from '@inertiajs/react';
import { Wallet } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import { formatClock as formatElapsed } from '@/lib/dates';
import { useI18n } from '@/lib/i18n';
import { formatMoney } from '@/lib/payments';
import tablesRoutes from '@/routes/tables';

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
    current_bill: number | null;
    elapsed_seconds: number;
    session_status: string | null;
    last_resume_at: string | null;
    items_total: number;
};

type Props = {
    today: TodayStats;
    tables: TableRow[];
    running_sessions: RunningSession[];
    isAdmin: boolean;
};

function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);

    if (m >= 60) {
        return `${Math.floor(m / 60)}h ${m % 60}m`;
    }

    return `${m}m`;
}

export default function Dashboard({ today, tables, running_sessions }: Props) {
    const { t } = useI18n();
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        router.reload({
            only: ['today', 'tables', 'running_sessions'],
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

    const getRunningSessionLive = useCallback(
        (s: RunningSession) => {
            let sec = s.elapsed_seconds;

            if (s.session_status === 'running' && s.last_resume_at) {
                const resumeMs = new Date(s.last_resume_at).getTime();
                sec =
                    s.elapsed_seconds +
                    Math.max(0, Math.floor((now - resumeMs) / 1000));
            }

            return {
                duration: formatDuration(sec),
                items: Number(s.items_total) || 0,
            };
        },
        [now],
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

    const statusChip = (table: TableRow) => {
        if (table.status === 'maintenance') {
            return 'bg-rose-500/15 text-rose-700 dark:text-rose-300';
        }

        if (table.session_status === 'paused') {
            return 'bg-amber-500/15 text-amber-800 dark:text-amber-300';
        }

        if (table.session_status === 'running') {
            return 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300';
        }

        return 'bg-slate-500/15 text-slate-700 dark:text-slate-300';
    };

    return (
        <AppLayout breadcrumbs={[]}>
            <Head title={t('Dashboard')} />
            <div className="flex flex-1 flex-col gap-6 overflow-x-auto rounded-xl p-4">
                <PageHeader
                    title={t('Dashboard')}
                    description={t("Today's floor and sales at a glance.")}
                />
                <section>
                    <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                        {t('Today at a glance')}
                    </h2>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-xl border border-sidebar-border/70 bg-card p-4 shadow-sm dark:border-sidebar-border">
                            <p className="text-xs font-medium text-muted-foreground">
                                {t('Revenue')}
                            </p>
                            <div className="mt-2 space-y-1 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">
                                        {t('Table time')}
                                    </span>
                                    <span className="font-medium tabular-nums">
                                        {formatMoney(
                                            Number(today.revenue_time) || 0,
                                        )}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">
                                        {t('Food & drinks')}
                                    </span>
                                    <span className="font-medium tabular-nums">
                                        {formatMoney(
                                            Number(today.revenue_products) || 0,
                                        )}
                                    </span>
                                </div>
                            </div>
                            <p className="mt-2 border-t border-sidebar-border/70 pt-2 text-3xl font-semibold tabular-nums">
                                {formatMoney(Number(today.revenue) || 0)}
                            </p>
                        </div>
                        <div className="rounded-xl border border-sidebar-border/70 bg-card p-4 shadow-sm dark:border-sidebar-border">
                            <p className="text-xs font-medium text-muted-foreground">
                                {t('Sessions')}
                            </p>
                            <p className="mt-1 text-3xl font-semibold tabular-nums">
                                {today.sessions_count ?? 0}
                            </p>
                        </div>
                        <div className="rounded-xl border border-sidebar-border/70 bg-card p-4 shadow-sm dark:border-sidebar-border">
                            <p className="text-xs font-medium text-muted-foreground">
                                {t('Tables in use')}
                            </p>
                            <p className="mt-1 text-3xl font-semibold tabular-nums">
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
                                {t('Open tab')}
                            </div>
                            <p className="mt-1 text-3xl font-semibold tabular-nums">
                                {today.open_tabs_count ?? 0}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                {t('unpaid tabs')}
                            </p>
                        </Link>
                    </div>
                </section>

                <section>
                    <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                        {t('All tables')}
                    </h2>
                    <div className="rounded-xl border border-sidebar-border/70 bg-card dark:border-sidebar-border">
                        <ul className="divide-y divide-sidebar-border/70">
                            {tables.map((table) => {
                                const liveElapsed =
                                    getLiveElapsedSeconds(table);
                                const itemsTotal =
                                    Number(table.items_total) || 0;

                                return (
                                    <li key={table.id}>
                                        <Link
                                            href={tablesRoutes.index.url()}
                                            className="flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/50"
                                        >
                                            <div className="flex items-center gap-3">
                                                <span
                                                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                                                        table.status ===
                                                        'maintenance'
                                                            ? 'bg-rose-500'
                                                            : table.session_status ===
                                                                'paused'
                                                              ? 'bg-amber-500'
                                                              : table.session_status ===
                                                                  'running'
                                                                ? 'bg-emerald-500'
                                                                : 'bg-slate-400'
                                                    }`}
                                                    aria-hidden
                                                />
                                                <span className="font-medium">
                                                    {table.name}
                                                </span>
                                                <span
                                                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusChip(table)}`}
                                                >
                                                    {t(statusLabel(table))}
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
                                                        {itemsTotal > 0 && (
                                                            <span className="ml-2 font-medium text-foreground">
                                                                {t('items')}{' '}
                                                                {formatMoney(
                                                                    itemsTotal,
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
                        {t('Currently running sessions')}
                    </h2>
                    {running_sessions.length === 0 ? (
                        <EmptyState
                            title={t('No tables in play')}
                            description={t(
                                'Start a session from the Tables page when guests sit down.',
                            )}
                            action={
                                <Button asChild>
                                    <Link href={tablesRoutes.index.url()}>
                                        {t('Go to Tables')}
                                    </Link>
                                </Button>
                            }
                        />
                    ) : (
                        <div className="overflow-hidden rounded-xl border border-sidebar-border/70 bg-card dark:border-sidebar-border">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-sidebar-border/70 bg-muted/50">
                                        <th className="px-4 py-3 text-left font-medium">
                                            {t('Table')}
                                        </th>
                                        <th className="px-4 py-3 text-left font-medium">
                                            {t('Start time')}
                                        </th>
                                        <th className="px-4 py-3 text-left font-medium">
                                            {t('Duration')}
                                        </th>
                                        <th className="px-4 py-3 text-right font-medium">
                                            {t('Items')}
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
                                                    {formatMoney(live.items)}
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
