import { Head } from '@inertiajs/react';
import { Download } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { formatDateTime } from '@/lib/dates';
import { jsonHeaders } from '@/lib/http';
import { formatMoney } from '@/lib/payments';

type CashSessionInfo = {
    id: number;
    status: 'open' | 'closed';
    opening_cash: number;
    opened_at: string | null;
    closed_at: string | null;
    counted_cash: number | null;
    expected_cash: number;
    variance: number | null;
    variance_reason: string | null;
    receipts_count: number;
    total_sales: number;
    cash_sales: number;
    card_sales: number;
    transfer_sales: number;
    opened_by: string | null;
    closed_by: string | null;
};
type HistoryResponse = {
    data: CashSessionInfo[];
    current_page: number;
    last_page: number;
    total: number;
};

export default function RegisterPage() {
    const money = formatMoney;
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [openSession, setOpenSession] = useState<CashSessionInfo | null>(
        null,
    );
    const [openingCash, setOpeningCash] = useState('');
    const [countedCash, setCountedCash] = useState('');
    const [varianceReason, setVarianceReason] = useState('');
    const [history, setHistory] = useState<HistoryResponse>({
        data: [],
        current_page: 1,
        last_page: 1,
        total: 0,
    });
    const [historyUsers, setHistoryUsers] = useState<string[]>([]);
    const [historyUser, setHistoryUser] = useState('all');
    const [historyMonth, setHistoryMonth] = useState('');
    const [historyPage, setHistoryPage] = useState(1);

    const closeVariancePreview = useMemo(() => {
        if (!openSession) {
            return 0;
        }

        return (
            Math.round(
                ((Number(countedCash) || 0) -
                    Number(openSession.expected_cash || 0)) *
                    100,
            ) / 100
        );
    }, [countedCash, openSession]);

    const loadCurrent = useCallback(
        async (
            page = historyPage,
            filters = { user: historyUser, month: historyMonth },
        ) => {
            setLoading(true);
            setError(null);

            try {
                const params = new URLSearchParams({ page: String(page) });

                if (filters.user !== 'all') {
                    params.set('user', filters.user);
                }

                if (filters.month) {
                    params.set('month', filters.month);
                }

                const res = await fetch(`/admin/cash/current?${params}`, {
                    headers: { Accept: 'application/json' },
                });

                if (!res.ok) {
                    throw new Error('Failed to load register shift.');
                }

                const data = await res.json();
                const open = (data.open_session ??
                    null) as CashSessionInfo | null;
                setOpenSession(open);
                setHistory(
                    data.history ?? {
                        data: [],
                        current_page: 1,
                        last_page: 1,
                        total: 0,
                    },
                );
                setHistoryUsers(data.users ?? []);
            } catch (e) {
                setError(
                    e instanceof Error
                        ? e.message
                        : 'Failed to load register shift.',
                );
            } finally {
                setLoading(false);
            }
        },
        [historyPage, historyUser, historyMonth],
    );

    useEffect(() => {
        void loadCurrent();
    }, [loadCurrent]);

    const handleOpenShift = async () => {
        setActionLoading(true);
        setError(null);

        try {
            const res = await fetch('/admin/cash/open', {
                method: 'POST',
                headers: jsonHeaders(),
                credentials: 'same-origin',
                body: JSON.stringify({
                    opening_cash: Number(openingCash) || 0,
                }),
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(data.message || 'Failed to open shift.');
            }

            setOpeningCash('');
            await loadCurrent();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to open shift.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleCloseShift = async () => {
        if (!openSession) {
            return;
        }

        const variance = closeVariancePreview;

        if (Math.abs(variance) > 0.0001 && varianceReason.trim() === '') {
            setError('Reason is required when variance is not zero.');

            return;
        }

        setActionLoading(true);
        setError(null);

        try {
            const res = await fetch('/admin/cash/close', {
                method: 'POST',
                headers: jsonHeaders(),
                credentials: 'same-origin',
                body: JSON.stringify({
                    counted_cash: Number(countedCash) || 0,
                    variance_reason: varianceReason.trim() || null,
                }),
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(data.message || 'Failed to close shift.');
            }

            const receiptUrl =
                typeof data.receipt_url === 'string' ? data.receipt_url : null;
            setCountedCash('');
            setVarianceReason('');

            if (receiptUrl) {
                window.open(receiptUrl, '_blank', 'noopener,noreferrer');
            }

            await loadCurrent();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to close shift.');
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <AppLayout breadcrumbs={[]}>
            <Head title="Register" />
            <div className="flex flex-1 flex-col gap-4 rounded-xl p-4">
                <PageHeader
                    title="Register"
                    description="Open the shift, count cash, and download reports."
                />
                <Card className="border-sidebar-border/70 bg-background py-4 dark:border-sidebar-border">
                    <CardHeader className="px-4 pb-2">
                        <CardTitle className="text-sm font-semibold">
                            Register Shift
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 px-4">
                        {loading && (
                            <p className="text-sm text-muted-foreground">
                                Loading…
                            </p>
                        )}
                        {!loading && !openSession && (
                            <div className="space-y-3">
                                <p className="text-sm text-muted-foreground">
                                    No open shift. Count cash in register and
                                    open shift.
                                </p>
                                <div className="max-w-xs space-y-2">
                                    <Label htmlFor="opening-cash">
                                        Opening cash
                                    </Label>
                                    <Input
                                        id="opening-cash"
                                        type="number"
                                        min={0}
                                        step="1"
                                        value={openingCash}
                                        onChange={(e) =>
                                            setOpeningCash(e.target.value)
                                        }
                                        placeholder="0.00"
                                    />
                                </div>
                                <Button
                                    onClick={handleOpenShift}
                                    disabled={actionLoading}
                                >
                                    {actionLoading ? 'Opening…' : 'Open shift'}
                                </Button>
                            </div>
                        )}

                        {!loading && openSession && (
                            <div className="space-y-4">
                                <div className="grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
                                    <div>
                                        <span className="text-muted-foreground">
                                            Status:
                                        </span>{' '}
                                        <Badge>Open</Badge>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">
                                            Opened:
                                        </span>{' '}
                                        {openSession.opened_at
                                            ? formatDateTime(
                                                  openSession.opened_at,
                                              )
                                            : '—'}
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">
                                            Opening cash:
                                        </span>{' '}
                                        {money(openSession.opening_cash)}
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">
                                            Expected cash:
                                        </span>{' '}
                                        {money(openSession.expected_cash)}
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">
                                            Receipts:
                                        </span>{' '}
                                        {openSession.receipts_count}
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">
                                            Sales:
                                        </span>{' '}
                                        {money(openSession.total_sales)}
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">
                                            Card:
                                        </span>{' '}
                                        {money(openSession.card_sales)}
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">
                                            Transfer:
                                        </span>{' '}
                                        {money(openSession.transfer_sales)}
                                    </div>
                                </div>

                                <div className="max-w-xs space-y-2">
                                    <Label htmlFor="counted-cash">
                                        Counted cash
                                    </Label>
                                    <Input
                                        id="counted-cash"
                                        type="number"
                                        min={0}
                                        step="1"
                                        value={countedCash}
                                        onChange={(e) =>
                                            setCountedCash(e.target.value)
                                        }
                                        placeholder="0.00"
                                    />
                                </div>

                                <div className="text-sm">
                                    <span className="text-muted-foreground">
                                        Variance preview:{' '}
                                    </span>
                                    <span
                                        className={
                                            Math.abs(closeVariancePreview) >
                                            0.0001
                                                ? 'text-amber-600 dark:text-amber-400'
                                                : ''
                                        }
                                    >
                                        {money(closeVariancePreview)}
                                    </span>
                                </div>

                                <div className="max-w-lg space-y-2">
                                    <Label htmlFor="variance-reason">
                                        Reason{' '}
                                        {Math.abs(closeVariancePreview) > 0.0001
                                            ? '(required)'
                                            : '(optional)'}
                                    </Label>
                                    <Input
                                        id="variance-reason"
                                        value={varianceReason}
                                        onChange={(e) =>
                                            setVarianceReason(e.target.value)
                                        }
                                        placeholder="Explain difference when variance is not zero"
                                    />
                                </div>

                                <Button
                                    variant="destructive"
                                    onClick={handleCloseShift}
                                    disabled={actionLoading}
                                >
                                    {actionLoading ? 'Closing…' : 'Close shift'}
                                </Button>
                            </div>
                        )}

                        {error && (
                            <p className="text-sm text-destructive">{error}</p>
                        )}
                    </CardContent>
                </Card>

                <Card className="border-sidebar-border/70 bg-background py-4 dark:border-sidebar-border">
                    <CardHeader className="px-4 pb-2">
                        <CardTitle className="text-sm font-semibold">
                            Shift reports ({history.total})
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 px-4">
                        <div className="grid gap-2 md:grid-cols-3">
                            <Select
                                value={historyUser}
                                onValueChange={(value) => {
                                    setHistoryUser(value);
                                    setHistoryPage(1);
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Filter by user" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">
                                        All users
                                    </SelectItem>
                                    {historyUsers.map((user) => (
                                        <SelectItem key={user} value={user}>
                                            {user}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Input
                                type="month"
                                value={historyMonth}
                                onChange={(e) => {
                                    setHistoryMonth(e.target.value);
                                    setHistoryPage(1);
                                }}
                            />
                        </div>
                        <div className="divide-y rounded-md border">
                            {history.data.map((shift) => (
                                <div
                                    key={shift.id}
                                    className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"
                                >
                                    <div>
                                        <div className="font-medium">
                                            Shift #{shift.id} ·{' '}
                                            {shift.opened_by ?? 'Unknown'}
                                        </div>
                                        <div className="text-muted-foreground">
                                            {shift.closed_at
                                                ? formatDateTime(
                                                      shift.closed_at,
                                                  )
                                                : '—'}{' '}
                                            · {shift.receipts_count} receipts
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="font-semibold">
                                            {money(shift.total_sales)}
                                        </span>
                                        <Button
                                            size="icon"
                                            variant="outline"
                                            asChild
                                            title="Download report"
                                        >
                                            <a
                                                href={`/admin/cash/${shift.id}/receipt`}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                <Download className="h-4 w-4" />
                                                <span className="sr-only">
                                                    Download report
                                                </span>
                                            </a>
                                        </Button>
                                    </div>
                                </div>
                            ))}
                            {history.data.length === 0 && (
                                <div className="p-4 text-sm text-muted-foreground">
                                    No closed shifts found.
                                </div>
                            )}
                        </div>
                        <div className="flex items-center justify-between">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={history.current_page <= 1}
                                onClick={() => {
                                    const page = history.current_page - 1;
                                    setHistoryPage(page);
                                }}
                            >
                                Previous
                            </Button>
                            <span className="text-xs text-muted-foreground">
                                Page {history.current_page} of{' '}
                                {history.last_page}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={
                                    history.current_page >= history.last_page
                                }
                                onClick={() => {
                                    const page = history.current_page + 1;
                                    setHistoryPage(page);
                                    loadCurrent(page);
                                }}
                            >
                                Next
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
