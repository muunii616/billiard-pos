import { Head, Link, usePage } from '@inertiajs/react';
import {
    ArrowRight,
    ArrowRightLeft,
    Banknote,
    CheckCircle2,
    Download,
    RefreshCw,
    Wallet,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AppLayout from '@/layouts/app-layout';
import { formatDateTime } from '@/lib/dates';
import { postJson } from '@/lib/http';
import { useI18n } from '@/lib/i18n';
import { formatMoney as money } from '@/lib/payments';

type Shift = {
    id: number;
    opening_cash: number;
    opened_at: string | null;
    closed_at: string | null;
    counted_cash: number | null;
    expected_cash: number;
    variance: number | null;
    receipts_count: number;
    total_sales: number;
    cash_sales: number;
    card_sales: number;
    transfer_sales: number;
    opened_by: string | null;
    opened_by_user_id: number | null;
    closed_by: string | null;
};
type RegisterData = {
    open_session: Shift | null;
    needs_handover: boolean;
    history: {
        data: Shift[];
        current_page: number;
        last_page: number;
        total: number;
    };
    users: string[];
};

export default function RegisterPage() {
    const { t } = useI18n();
    const { auth } = usePage<{ auth: { user: { id: number; name: string } } }>()
        .props;
    const [data, setData] = useState<RegisterData | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [reportUrl, setReportUrl] = useState<string | null>(null);
    const [openingCash, setOpeningCash] = useState('');
    const [countedCash, setCountedCash] = useState('');
    const [newOpeningCash, setNewOpeningCash] = useState<string | null>(null);
    const [reason, setReason] = useState('');
    const [mode, setMode] = useState<'close' | 'handover' | null>(null);
    const [historyUser, setHistoryUser] = useState('');
    const [historyMonth, setHistoryMonth] = useState('');
    const [page, setPage] = useState(1);
    const requestNumber = useRef(0);
    const submitting = useRef(false);
    const shift = data?.open_session;
    const needsChoice = !!data?.needs_handover && !!shift;
    const validAmount = (value: string) =>
        value.trim() !== '' &&
        Number.isFinite(Number(value)) &&
        Number(value) >= 0;
    const variance =
        shift && validAmount(countedCash)
            ? Math.round((Number(countedCash) - shift.expected_cash) * 100) /
              100
            : null;
    const nextOpening = newOpeningCash ?? countedCash;

    const loadCurrent = useCallback(async () => {
        const request = ++requestNumber.current;
        setLoading(true);

        try {
            const params = new URLSearchParams({ page: String(page) });

            if (historyUser) {
                params.set('user', historyUser);
            }

            if (historyMonth) {
                params.set('month', historyMonth);
            }

            const response = await fetch(`/admin/cash/current?${params}`, {
                headers: { Accept: 'application/json' },
            });

            if (!response.ok) {
                throw new Error('Failed to load register shift.');
            }

            const next: RegisterData = await response.json();

            if (request === requestNumber.current) {
                setData(next);
                setLoadError(null);
            }
        } catch (e) {
            if (request === requestNumber.current) {
                setLoadError(
                    e instanceof Error
                        ? e.message
                        : 'Failed to load register shift.',
                );
            }
        } finally {
            if (request === requestNumber.current) {
                setLoading(false);
            }
        }
    }, [page, historyUser, historyMonth]);

    useEffect(() => {
        const requests = requestNumber;
        void loadCurrent();
        const interval = window.setInterval(() => {
            if (document.visibilityState === 'visible' && !submitting.current) {
                void loadCurrent();
            }
        }, 15000);

        return () => {
            window.clearInterval(interval);
            requests.current++;
        };
    }, [loadCurrent]);

    useEffect(() => {
        setMode(null);
        setCountedCash('');
        setNewOpeningCash(null);
        setReason('');
    }, [shift?.id]);

    const act = async (action: 'open' | 'close' | 'continue' | 'handover') => {
        if (submitting.current) {
            return;
        }

        submitting.current = true;
        setBusy(true);
        setError(null);
        setMessage(null);
        requestNumber.current++;

        try {
            const result = await postJson(`/admin/cash/${action}`, {
                session_id: shift?.id,
                ...(action === 'open'
                    ? { opening_cash: Number(openingCash) }
                    : {}),
                ...(action === 'close' || action === 'handover'
                    ? {
                          counted_cash: Number(countedCash),
                          variance_reason: reason.trim() || null,
                      }
                    : {}),
                ...(action === 'handover'
                    ? { opening_cash: Number(nextOpening) }
                    : {}),
            });
            setMode(null);
            setMessage(result.message);
            setReportUrl(result.receipt_url ?? null);
            setOpeningCash('');
            await loadCurrent();
        } catch (e) {
            setError(
                e instanceof Error ? e.message : 'Unable to update register.',
            );
            await loadCurrent();
        } finally {
            submitting.current = false;
            setBusy(false);
        }
    };

    const beginClose = (nextMode: 'close' | 'handover') => {
        setError(null);
        setCountedCash('');
        setNewOpeningCash(null);
        setReason('');
        setMode(nextMode);
    };
    const errorAlert = error && (
        <Alert variant="destructive" role="alert">
            <AlertDescription>{t(error)}</AlertDescription>
        </Alert>
    );

    return (
        <AppLayout breadcrumbs={[]}>
            <Head title={t('Register')} />
            <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4 md:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <PageHeader
                        title={t('Register')}
                        description={t(
                            'Start your shift here. Check the cash and who is responsible for the register.',
                        )}
                    />
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={loading || busy}
                        onClick={() => void loadCurrent()}
                    >
                        <RefreshCw className={loading ? 'animate-spin' : ''} />
                        {t('Refresh')}
                    </Button>
                </div>
                {loadError && (
                    <Alert variant="destructive">
                        <AlertDescription>{t(loadError)}</AlertDescription>
                    </Alert>
                )}
                {!mode && !needsChoice && errorAlert}
                {message && (
                    <Alert className="border-emerald-500/30 bg-emerald-500/5">
                        <CheckCircle2 />
                        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                            {t(message)}
                            {reportUrl && (
                                <a
                                    className="font-medium underline"
                                    href={reportUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    {t('Download report')}
                                </a>
                            )}
                        </AlertDescription>
                    </Alert>
                )}
                {!data ? (
                    <Card>
                        <CardContent className="py-10 text-center text-muted-foreground">
                            {t(
                                loading
                                    ? 'Loading…'
                                    : 'Failed to load register shift.',
                            )}
                        </CardContent>
                    </Card>
                ) : shift ? (
                    <>
                        <Card className="overflow-hidden border-emerald-500/30 py-0">
                            <div className="flex flex-wrap items-center justify-between gap-6 bg-emerald-500/5 p-5 md:p-6">
                                <div className="flex items-start gap-4">
                                    <div className="rounded-2xl bg-emerald-600 p-3 text-white">
                                        <Wallet className="size-6" />
                                    </div>
                                    <div className="space-y-2">
                                        <Badge className="bg-emerald-600 text-white">
                                            {t('Register open')}
                                        </Badge>
                                        <h2 className="text-xl font-semibold">
                                            {t('Shift #{id}', { id: shift.id })}{' '}
                                            · {shift.opened_by ?? t('Unknown')}
                                        </h2>
                                        <p className="text-sm text-muted-foreground">
                                            {t('Opened')}{' '}
                                            {shift.opened_at
                                                ? formatDateTime(
                                                      shift.opened_at,
                                                  )
                                                : '—'}
                                        </p>
                                        <p className="text-sm">
                                            {t('Signed in as {name}', {
                                                name: auth.user.name,
                                            })}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Button asChild>
                                        <Link href="/tables">
                                            {t('Go to tables')}
                                            <ArrowRight />
                                        </Link>
                                    </Button>
                                    {shift.opened_by_user_id !==
                                        auth.user.id && (
                                        <Button
                                            variant="outline"
                                            onClick={() =>
                                                beginClose('handover')
                                            }
                                            disabled={busy}
                                        >
                                            {t('Start my own shift')}
                                        </Button>
                                    )}
                                    <Button
                                        variant="outline"
                                        onClick={() => beginClose('close')}
                                        disabled={busy}
                                    >
                                        {t('Close shift')}
                                    </Button>
                                </div>
                            </div>
                            <CardContent className="grid gap-5 p-5 sm:grid-cols-3 md:p-6">
                                <div>
                                    <p className="text-sm text-muted-foreground">
                                        {t('Expected cash in drawer')}
                                    </p>
                                    <p className="mt-1 text-3xl font-semibold tabular-nums">
                                        {money(shift.expected_cash)}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {t('Opening cash + cash sales')}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">
                                        {t('Total sales')}
                                    </p>
                                    <p className="mt-1 text-2xl font-semibold tabular-nums">
                                        {money(shift.total_sales)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">
                                        {t('Receipts')}
                                    </p>
                                    <p className="mt-1 text-2xl font-semibold tabular-nums">
                                        {shift.receipts_count}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                            {[
                                ['Opening cash', shift.opening_cash],
                                ['Cash sales', shift.cash_sales],
                                ['Card sales', shift.card_sales],
                                ['Transfer sales', shift.transfer_sales],
                            ].map(([label, value]) => (
                                <Card key={label} className="py-4">
                                    <CardContent className="px-4">
                                        <p className="text-sm text-muted-foreground">
                                            {t(String(label))}
                                        </p>
                                        <p className="mt-2 text-lg font-semibold tabular-nums">
                                            {money(Number(value))}
                                        </p>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </>
                ) : (
                    <Card className="border-amber-500/30 bg-amber-500/5">
                        <CardContent className="grid gap-6 py-2 md:grid-cols-2 md:items-center">
                            <div className="space-y-3">
                                <Banknote className="size-9 text-amber-600" />
                                <Badge variant="outline">
                                    {t('Register closed')}
                                </Badge>
                                <h2 className="text-2xl font-semibold">
                                    {t('Start your shift, {name}', {
                                        name: auth.user.name,
                                    })}
                                </h2>
                                <p className="max-w-md text-sm text-muted-foreground">
                                    {t(
                                        'Count the cash in the drawer before taking payments. This shift will be recorded under your name.',
                                    )}
                                </p>
                            </div>
                            <form
                                className="space-y-4 rounded-xl border bg-background p-5"
                                onSubmit={(event) => {
                                    event.preventDefault();

                                    if (validAmount(openingCash)) {
                                        void act('open');
                                    }
                                }}
                            >
                                <div className="space-y-2">
                                    <Label htmlFor="opening-cash">
                                        {t('Opening cash')}
                                    </Label>
                                    <Input
                                        id="opening-cash"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        required
                                        value={openingCash}
                                        onChange={(e) =>
                                            setOpeningCash(e.target.value)
                                        }
                                        placeholder="0"
                                        className="h-12 text-lg"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        {t('Enter 0 if the drawer is empty.')}
                                    </p>
                                </div>
                                <Button
                                    className="h-11 w-full"
                                    disabled={busy || !validAmount(openingCash)}
                                >
                                    {t(busy ? 'Opening…' : 'Open shift')}
                                    <ArrowRight />
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                )}
                <Card>
                    <CardHeader className="gap-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <CardTitle>{t('Shift history')}</CardTitle>
                            <span className="text-sm text-muted-foreground">
                                {t('{count} closed shifts', {
                                    count: data?.history.total ?? 0,
                                })}
                            </span>
                        </div>
                        <div className="grid gap-3 sm:max-w-lg sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label htmlFor="history-user">
                                    {t('Opened by')}
                                </Label>
                                <select
                                    id="history-user"
                                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                                    value={historyUser}
                                    onChange={(event) => {
                                        setHistoryUser(event.target.value);
                                        setPage(1);
                                    }}
                                >
                                    <option value="">{t('All staff')}</option>
                                    {data?.users.map((user) => (
                                        <option key={user} value={user}>
                                            {user}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="history-month">
                                    {t('Opening month')}
                                </Label>
                                <Input
                                    id="history-month"
                                    type="month"
                                    value={historyMonth}
                                    onChange={(event) => {
                                        setHistoryMonth(event.target.value);
                                        setPage(1);
                                    }}
                                />
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {t(
                                'Shifts are listed by their opening date, even when closed after midnight.',
                            )}
                        </p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="overflow-x-auto rounded-lg border">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-muted/50 text-muted-foreground">
                                    <tr>
                                        {[
                                            'Shift',
                                            'Opened',
                                            'Closed',
                                            'Sales',
                                            'Counted cash',
                                            'Difference',
                                            'Report',
                                        ].map((heading) => (
                                            <th
                                                className="px-4 py-3 font-medium whitespace-nowrap"
                                                key={heading}
                                            >
                                                {t(heading)}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {data?.history.data.map((entry) => (
                                        <tr key={entry.id} className="border-t">
                                            <td className="px-4 py-3">
                                                <p className="font-medium">
                                                    #{entry.id} ·{' '}
                                                    {entry.opened_by ??
                                                        t('Unknown')}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {t('Closed by')}{' '}
                                                    {entry.closed_by ?? '—'}
                                                </p>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                                                {entry.opened_at
                                                    ? formatDateTime(
                                                          entry.opened_at,
                                                      )
                                                    : '—'}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                                                {entry.closed_at
                                                    ? formatDateTime(
                                                          entry.closed_at,
                                                      )
                                                    : '—'}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                                                {money(entry.total_sales)}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                                                {money(entry.counted_cash ?? 0)}
                                            </td>
                                            <td
                                                className={`px-4 py-3 font-medium whitespace-nowrap tabular-nums ${Number(entry.variance) === 0 ? 'text-emerald-600' : 'text-amber-600'}`}
                                            >
                                                {money(entry.variance ?? 0)}
                                            </td>
                                            <td className="px-4 py-3">
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    asChild
                                                >
                                                    <a
                                                        href={`/admin/cash/${entry.id}/receipt`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        aria-label={t(
                                                            'Download report',
                                                        )}
                                                    >
                                                        <Download />
                                                    </a>
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                    {data?.history.data.length === 0 && (
                                        <tr>
                                            <td
                                                colSpan={7}
                                                className="py-10 text-center text-muted-foreground"
                                            >
                                                {t('No closed shifts found.')}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={loading || page <= 1}
                                onClick={() => setPage(page - 1)}
                            >
                                {t('Previous')}
                            </Button>
                            <p className="text-xs text-muted-foreground">
                                {t('Page {page} of {total}', {
                                    page: data?.history.current_page ?? 1,
                                    total: data?.history.last_page ?? 1,
                                })}
                            </p>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={
                                    loading ||
                                    page >= (data?.history.last_page ?? 1)
                                }
                                onClick={() => setPage(page + 1)}
                            >
                                {t('Next')}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
            <Dialog open={needsChoice && mode !== 'handover'}>
                <DialogContent
                    className="sm:max-w-lg [&>button]:hidden"
                    onEscapeKeyDown={(event) => event.preventDefault()}
                    onPointerDownOutside={(event) => event.preventDefault()}
                >
                    <DialogHeader>
                        <div className="mb-2 flex size-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
                            <ArrowRightLeft />
                        </div>
                        <DialogTitle>
                            {t('A register is already open')}
                        </DialogTitle>
                        <DialogDescription>
                            {t(
                                '{owner} opened this shift. Choose how you want to continue as {name}.',
                                {
                                    owner: shift?.opened_by ?? t('Unknown'),
                                    name: auth.user.name,
                                },
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="rounded-lg bg-muted/50 p-4 text-sm">
                        <p>
                            {t('Shift #{id}', { id: shift?.id ?? 0 })} ·{' '}
                            {shift?.opened_at
                                ? formatDateTime(shift.opened_at)
                                : '—'}
                        </p>
                        <p className="mt-1 font-medium">
                            {t('Expected cash in drawer')}:{' '}
                            {money(shift?.expected_cash ?? 0)}
                        </p>
                    </div>
                    {errorAlert}
                    <div className="grid gap-3">
                        <Button
                            className="h-auto py-3 whitespace-normal"
                            disabled={busy}
                            onClick={() => beginClose('handover')}
                        >
                            {t('Close and open under my name')}
                        </Button>
                        <Button
                            variant="outline"
                            className="h-auto py-3 whitespace-normal"
                            disabled={busy}
                            onClick={() => void act('continue')}
                        >
                            {t('Continue the current shift')}
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {t(
                            'Continuing keeps the current owner and cash totals unchanged.',
                        )}
                    </p>
                </DialogContent>
            </Dialog>
            <Dialog
                open={mode !== null && !!shift}
                onOpenChange={(open) => {
                    if (!open && !busy) {
                        setMode(null);
                    }
                }}
            >
                <DialogContent
                    className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
                    onEscapeKeyDown={(e) => {
                        if (busy) {
                            e.preventDefault();
                        }
                    }}
                    onPointerDownOutside={(e) => {
                        if (busy) {
                            e.preventDefault();
                        }
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>
                            {t(
                                mode === 'handover'
                                    ? 'Close and open under my name'
                                    : 'Close shift',
                            )}
                        </DialogTitle>
                        <DialogDescription>
                            {t(
                                'Count the cash in the drawer. The old shift stays in history with its original owner.',
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <form
                        className="space-y-4"
                        onSubmit={(e) => {
                            e.preventDefault();

                            if (mode) {
                                void act(mode);
                            }
                        }}
                    >
                        <div className="rounded-lg bg-muted/50 p-4">
                            <p className="text-sm text-muted-foreground">
                                {t('Expected cash in drawer')}
                            </p>
                            <p className="text-2xl font-semibold tabular-nums">
                                {money(shift?.expected_cash ?? 0)}
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="counted-cash">
                                {t('Counted cash')}
                            </Label>
                            <Input
                                autoFocus
                                id="counted-cash"
                                type="number"
                                min="0"
                                step="0.01"
                                required
                                value={countedCash}
                                onChange={(e) => setCountedCash(e.target.value)}
                                placeholder="0"
                                disabled={busy}
                            />
                        </div>
                        {variance !== null && (
                            <p
                                className={`rounded-md p-3 text-sm font-medium ${variance === 0 ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'}`}
                            >
                                {t(
                                    variance === 0
                                        ? 'Cash matches the register.'
                                        : 'Cash difference: {amount}',
                                    { amount: money(variance) },
                                )}
                            </p>
                        )}
                        {variance !== null && variance !== 0 && (
                            <div className="space-y-2">
                                <Label htmlFor="variance-reason">
                                    {t('Reason for the difference (required)')}
                                </Label>
                                <Input
                                    id="variance-reason"
                                    required
                                    maxLength={2000}
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    disabled={busy}
                                />
                            </div>
                        )}
                        {mode === 'handover' && (
                            <div className="space-y-2 border-t pt-4">
                                <Label htmlFor="handover-opening">
                                    {t('Opening cash for your shift')}
                                </Label>
                                <Input
                                    id="handover-opening"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    required
                                    value={nextOpening}
                                    onChange={(e) =>
                                        setNewOpeningCash(e.target.value)
                                    }
                                    disabled={busy}
                                />
                                <p className="text-xs text-muted-foreground">
                                    {t(
                                        'Defaults to the cash you counted. Change it if cash is removed or added.',
                                    )}
                                </p>
                                <p className="text-sm">
                                    {t('New shift owner: {name}', {
                                        name: auth.user.name,
                                    })}
                                </p>
                            </div>
                        )}
                        {errorAlert}
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                disabled={busy}
                                onClick={() => setMode(null)}
                            >
                                {t('Cancel')}
                            </Button>
                            <Button
                                disabled={
                                    busy ||
                                    !validAmount(countedCash) ||
                                    (variance !== 0 && !reason.trim()) ||
                                    (mode === 'handover' &&
                                        !validAmount(nextOpening))
                                }
                            >
                                {t(
                                    busy
                                        ? 'Saving…'
                                        : mode === 'handover'
                                          ? 'Close old shift and open mine'
                                          : 'Confirm close',
                                )}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
