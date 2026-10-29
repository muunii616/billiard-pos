import { Head, router, usePage } from '@inertiajs/react';
import { CalendarDays, Download } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Pie,
    PieChart,
    XAxis,
} from 'recharts';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ChartConfig } from '@/components/ui/chart';
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from '@/components/ui/chart';
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
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableFooter,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import {
    businessYear,
    formatClock as formatPlayed,
    formatDateTime,
    POS_TIME_ZONE,
} from '@/lib/dates';
import { jsonHeaders } from '@/lib/http';
import { paymentMethodName, useCategoryLabel, useI18n } from '@/lib/i18n';
import { formatMoney } from '@/lib/payments';

type Summary = {
    total_revenue: number;
    sessions_count: number;
    receipts_count: number;
    payments: Record<string, number>;
};

type Props = {
    isAdmin?: boolean;
    mode: 'daily' | 'monthly';
    date: string;
    month: string;
    summary: Summary;
    charts: {
        sales: Record<string, number>;
        payments: Record<string, number>;
        monthly_income: { month: string; income: number }[];
    };
    invoices: {
        id: number;
        invoice: string;
        status: string;
        method: string;
        amount: number;
        paid_at: string | null;
    }[];
    cancelled_sessions: {
        id: number;
        table_name: string;
        cancelled_at: string | null;
        cancelled_by: string;
        reason: string | null;
        played_seconds: number;
        stock_restored: boolean | null;
        items: {
            product_name: string;
            quantity: number;
            unit_price: number;
            line_total: number;
        }[];
    }[];
    voided_tabs?: {
        id: number;
        voided_at: string | null;
        voided_by: string;
        reason: string | null;
        table_names: string[];
        stock_restored: boolean | null;
        time_total: number;
        items: {
            source: string;
            product_name: string;
            quantity: number;
            unit_price: number;
            line_total: number;
        }[];
    }[];
    selected_year: number;
};

type AdminReceipt = {
    id: number;
    receipt_number: string;
    status: 'paid' | 'unpaid' | 'voided';
    paid_at: string | null;
    customer_email: string | null;
    grand_total: number;
    line_items: {
        id: number;
        type: 'time' | 'product' | 'adjustment' | 'partial' | 'balance';
        description: string;
        quantity: number;
        unit_price: number;
        subtotal: number;
        meta?: Record<string, unknown> | null;
        components?: {
            type: string;
            description: string;
            quantity: number;
            unit_price: number;
            subtotal: number;
            meta?: Record<string, unknown> | null;
        }[];
    }[];
    payments: {
        id: number;
        method: 'cash' | 'card' | 'transfer_qr';
        amount: number;
    }[];
};

type InvoiceDetail = {
    id: number;
    invoice: string;
    status: string;
    method: string;
    amount: number;
    paid_at: string | null;
    line_items: {
        type: string;
        description: string;
        quantity: number;
        unit_price: number;
        subtotal: number;
        meta?: Record<string, unknown> | null;
        components?: {
            type: string;
            description: string;
            quantity: number;
            unit_price: number;
            subtotal: number;
            meta?: Record<string, unknown> | null;
        }[];
    }[];
    payments: { method: string; amount: number }[];
};

export default function Overview({
    isAdmin = false,
    mode,
    date,
    month,
    summary,
    charts,
    invoices,
    cancelled_sessions,
    voided_tabs = [],
    selected_year,
}: Props) {
    const { t } = useI18n();
    const categoryLabel = useCategoryLabel();
    const salesLabel = (name: string) =>
        name === 'Table time' ? t('Table time') : categoryLabel(name);
    const payLabel = (name: string) => paymentMethodName(name, t);
    const INVOICES_PER_PAGE = 15;
    const [invoicePage, setInvoicePage] = useState(1);
    const [calendarOpen, setCalendarOpen] = useState(false);
    const [downloadOpen, setDownloadOpen] = useState(false);
    const [downloadPeriod, setDownloadPeriod] = useState<
        'daily' | 'range' | 'monthly'
    >(mode);
    const [downloadFrom, setDownloadFrom] = useState(date);
    const [downloadTo, setDownloadTo] = useState(date);
    const [downloadMonth, setDownloadMonth] = useState(month);
    const [downloading, setDownloading] = useState(false);
    const [downloadError, setDownloadError] = useState<string | null>(null);

    const downloadReport = async () => {
        setDownloading(true);
        setDownloadError(null);
        const params = new URLSearchParams({ period: downloadPeriod });

        if (downloadPeriod === 'monthly') {
            params.set('month', downloadMonth);
        } else if (downloadPeriod === 'daily') {
            params.set('date', downloadFrom);
        } else {
            params.set('from', downloadFrom);
            params.set('to', downloadTo);
        }

        try {
            const response = await fetch(`/overview/download?${params}`, {
                headers: { Accept: 'application/pdf, application/json' },
            });

            if (
                !response.ok ||
                !response.headers
                    .get('Content-Type')
                    ?.includes('application/pdf')
            ) {
                const error = await response.json().catch(() => ({}));

                throw new Error(
                    error.message ||
                        'Could not download the report. Please try again.',
                );
            }

            const url = URL.createObjectURL(await response.blob());
            const link = document.createElement('a');
            link.href = url;
            link.download = `overview-${downloadPeriod}-${downloadPeriod === 'monthly' ? downloadMonth : downloadFrom}${downloadPeriod === 'range' ? `-to-${downloadTo}` : ''}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 60000);
            setDownloadOpen(false);
        } catch (error) {
            setDownloadError(
                error instanceof Error
                    ? error.message
                    : 'Could not download the report.',
            );
        } finally {
            setDownloading(false);
        }
    };
    const [monthlyYear, setMonthlyYear] = useState<number>(
        () => Number(month.slice(0, 4)) || businessYear(),
    );
    const money = formatMoney;
    const { auth } = usePage().props as { auth?: { user?: { role?: string } } };
    const adminEnabled = isAdmin || auth?.user?.role === 'admin';

    const [receiptOpen, setReceiptOpen] = useState(false);
    const [receiptLoading, setReceiptLoading] = useState(false);
    const [receiptError, setReceiptError] = useState<string | null>(null);
    const [receipt, setReceipt] = useState<AdminReceipt | null>(null);
    const [editCustomerEmail, setEditCustomerEmail] = useState('');
    const [editStatus, setEditStatus] = useState<'paid' | 'unpaid' | 'voided'>(
        'paid',
    );
    const [detailInvoice, setDetailInvoice] = useState<InvoiceDetail | null>(
        null,
    );
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState<string | null>(null);

    const openInvoiceDetail = async (receiptId: number) => {
        setDetailLoading(true);
        setDetailError(null);
        setDetailInvoice(null);

        try {
            const res = await fetch(`/admin/receipts/${receiptId}`, {
                headers: { Accept: 'application/json' },
                credentials: 'same-origin',
            });

            if (!res.ok) {
                throw new Error('Failed to load invoice details.');
            }

            const data = (await res.json()) as AdminReceipt;
            const methods = data.payments
                .map((payment) =>
                    payment.method
                        .replaceAll('_', ' ')
                        .replace(/\b\w/g, (c) => c.toUpperCase()),
                )
                .filter(Boolean);

            setDetailInvoice({
                id: data.id,
                invoice: data.receipt_number,
                status: data.status,
                method: methods.length === 0 ? '—' : methods.join(', '),
                amount: Number(data.grand_total) || 0,
                paid_at: data.paid_at,
                line_items: data.line_items.map((item) => ({
                    type: item.type,
                    description: item.description,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    subtotal: item.subtotal,
                    meta: item.meta ?? null,
                    components: (item.components ?? []).map((component) => ({
                        type: component.type,
                        description: component.description,
                        quantity: component.quantity,
                        unit_price: component.unit_price,
                        subtotal: component.subtotal,
                        meta: component.meta ?? null,
                    })),
                })),
                payments: data.payments.map((payment) => ({
                    method: payment.method,
                    amount: payment.amount,
                })),
            });
        } catch (e) {
            setDetailError(
                e instanceof Error
                    ? e.message
                    : 'Failed to load invoice details.',
            );
        } finally {
            setDetailLoading(false);
        }
    };

    const openReceipt = async (receiptId: number) => {
        if (!adminEnabled) {
            return;
        }

        setReceiptOpen(true);
        setReceiptLoading(true);
        setReceiptError(null);

        try {
            const res = await fetch(`/admin/receipts/${receiptId}`, {
                headers: { Accept: 'application/json' },
            });

            if (!res.ok) {
                throw new Error('Failed to load receipt.');
            }

            const data = (await res.json()) as AdminReceipt;
            setReceipt(data);
            setEditCustomerEmail(data.customer_email ?? '');
            setEditStatus(data.status);
        } catch (e) {
            setReceiptError(
                e instanceof Error ? e.message : 'Failed to load receipt.',
            );
        } finally {
            setReceiptLoading(false);
        }
    };

    const saveReceiptBasics = async () => {
        if (!receipt) {
            return;
        }

        setReceiptError(null);

        try {
            const headers = jsonHeaders();

            const res = await fetch(`/admin/receipts/${receipt.id}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({
                    customer_email: editCustomerEmail.trim() || null,
                    status: editStatus,
                }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));

                throw new Error(data.message || 'Failed to save receipt.');
            }

            router.reload();
        } catch (e) {
            setReceiptError(
                e instanceof Error ? e.message : 'Failed to save receipt.',
            );
        }
    };

    const monthLabels = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
    ];
    const salesColorMap: Record<string, string> = {
        'Table time': 'var(--chart-1)',
        Snacks: 'var(--chart-3)',
        Drinks: 'var(--chart-2)',
        Sets: 'var(--chart-4)',
        Other: 'var(--chart-5)',
    };
    const paymentPalette = [
        'var(--chart-1)',
        'var(--chart-2)',
        'var(--chart-3)',
        'var(--chart-4)',
        'var(--chart-5)',
    ];

    const parseIsoDate = (value: string) => {
        const d = new Date(`${value}T00:00:00`);

        return Number.isNaN(d.getTime()) ? new Date() : d;
    };

    const formatIsoDate = (value: Date) => {
        const y = value.getFullYear();
        const m = String(value.getMonth() + 1).padStart(2, '0');
        const d = String(value.getDate()).padStart(2, '0');

        return `${y}-${m}-${d}`;
    };

    const switchMode = (nextMode: 'daily' | 'monthly') => {
        const params =
            nextMode === 'daily'
                ? { mode: 'daily', date }
                : {
                      mode: 'monthly',
                      month,
                      date, // preserve daily date when switching back
                  };

        router.get('/overview', params, {
            preserveScroll: true,
            replace: true,
        });
    };

    const handleDateChange = (selected?: Date) => {
        if (!selected) {
            return;
        }

        router.get(
            '/overview',
            {
                mode: 'daily',
                date: formatIsoDate(selected),
            },
            {
                preserveScroll: true,
                replace: true,
                onSuccess: () => setCalendarOpen(false),
            },
        );
    };

    const calendarMonth =
        mode === 'daily' ? parseIsoDate(date) : parseIsoDate(`${month}-01`);
    const selectedMonthIndex = Math.max(
        0,
        Math.min(11, Number(month.slice(5, 7)) - 1 || 0),
    );
    const yearOptions = Array.from(
        { length: businessYear() + 2 - 2024 + 1 },
        (_, i) => 2024 + i,
    );
    const salesData = Object.entries(charts.sales)
        .map(([name, value]) => ({ name, value: Number(value) || 0 }))
        .filter((item) => item.value > 0);
    const paymentData = Object.entries(charts.payments)
        .map(([name, value]) => ({ name, value: Number(value) || 0 }))
        .filter((item) => item.value > 0);
    const monthlyIncomeData = charts.monthly_income.map((item) => ({
        month: item.month,
        income: Number(item.income) || 0,
    }));
    const invoicesTotal = invoices.reduce(
        (sum, row) => sum + (Number(row.amount) || 0),
        0,
    );
    const invoicePageCount = Math.max(
        1,
        Math.ceil(invoices.length / INVOICES_PER_PAGE),
    );
    const pagedInvoices = useMemo(() => {
        const start = (invoicePage - 1) * INVOICES_PER_PAGE;

        return invoices.slice(start, start + INVOICES_PER_PAGE);
    }, [INVOICES_PER_PAGE, invoicePage, invoices]);

    useEffect(() => {
        setInvoicePage(1);
    }, [date, month, mode, invoices.length]);

    useEffect(() => {
        if (invoicePage > invoicePageCount) {
            setInvoicePage(invoicePageCount);
        }
    }, [invoicePage, invoicePageCount]);
    const formatCancelledAt = (value: string | null) => {
        if (!value) {
            return '—';
        }

        return new Date(value).toLocaleTimeString('en-GB', {
            timeZone: POS_TIME_ZONE,
            hour: '2-digit',
            minute: '2-digit',
        });
    };
    const stockLabel = (restored: boolean | null) => {
        if (restored === true) {
            return t('Restocked');
        }

        if (restored === false) {
            return t('Not restocked');
        }

        return '—';
    };
    const chartName = (name: unknown) => {
        const raw = String(name ?? '');

        if (raw === 'Income' || raw === 'income') {
            return t('Income');
        }

        if (Object.prototype.hasOwnProperty.call(charts.payments, raw)) {
            return payLabel(raw);
        }

        return salesLabel(raw);
    };
    const moneyTooltipFormatter = (value: unknown, name: unknown) => (
        <div className="flex w-full items-center justify-between gap-3">
            <span className="text-muted-foreground">{chartName(name)}</span>
            <span className="font-mono font-medium text-foreground tabular-nums">
                {money(Number(value) || 0)}
            </span>
        </div>
    );

    const salesChartConfig: ChartConfig = Object.fromEntries(
        salesData.map((item, i) => [
            item.name,
            {
                label: salesLabel(item.name),
                color:
                    salesColorMap[item.name] ??
                    paymentPalette[i % paymentPalette.length],
            },
        ]),
    );
    const paymentsChartConfig: ChartConfig = Object.fromEntries(
        paymentData.map((item, i) => [
            item.name,
            {
                label: payLabel(item.name),
                color: paymentPalette[i % paymentPalette.length],
            },
        ]),
    );
    const incomeChartConfig: ChartConfig = {
        income: { label: t('Income'), color: 'var(--chart-1)' },
    };

    const handleMonthlyPick = (monthIndex: number) => {
        const nextMonth = `${monthlyYear}-${String(monthIndex + 1).padStart(2, '0')}`;
        router.get(
            '/overview',
            {
                mode: 'monthly',
                month: nextMonth,
                date,
            },
            {
                preserveScroll: true,
                replace: true,
                onSuccess: () => setCalendarOpen(false),
            },
        );
    };

    return (
        <AppLayout breadcrumbs={[]}>
            <Head title={t('Overview')} />
            <div className="flex flex-1 flex-col gap-4 rounded-xl p-4">
                <PageHeader
                    title={t('Overview')}
                    description={t('Sales, payments, and receipts.')}
                >
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="inline-flex rounded-lg border border-sidebar-border/70 p-1 dark:border-sidebar-border">
                            <Button
                                size="sm"
                                variant={mode === 'daily' ? 'default' : 'ghost'}
                                className="rounded-md"
                                onClick={() => switchMode('daily')}
                            >
                                {t('Daily')}
                            </Button>
                            <Button
                                size="sm"
                                variant={
                                    mode === 'monthly' ? 'default' : 'ghost'
                                }
                                className="rounded-md"
                                onClick={() => switchMode('monthly')}
                            >
                                {t('Monthly')}
                            </Button>
                        </div>

                        <Popover
                            open={calendarOpen}
                            onOpenChange={(open) => {
                                if (open) {
                                    setMonthlyYear(
                                        Number(month.slice(0, 4)) ||
                                            businessYear(),
                                    );
                                }

                                setCalendarOpen(open);
                            }}
                        >
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-2"
                                >
                                    <CalendarDays className="h-4 w-4" />
                                    {mode === 'daily' ? date : month}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent
                                className="w-auto p-0"
                                align="start"
                            >
                                {mode === 'daily' ? (
                                    <Calendar
                                        mode="single"
                                        selected={calendarMonth}
                                        defaultMonth={calendarMonth}
                                        onSelect={handleDateChange}
                                        showOutsideDays
                                        captionLayout="dropdown"
                                        fromYear={2024}
                                        toYear={businessYear() + 2}
                                        className="rounded-lg"
                                    />
                                ) : (
                                    <div className="w-[280px] p-3">
                                        <div className="mb-3 flex items-center justify-between">
                                            <span className="text-sm font-medium">
                                                {t('Select month')}
                                            </span>
                                            <Select
                                                value={String(monthlyYear)}
                                                onValueChange={(value) =>
                                                    setMonthlyYear(
                                                        Number(value),
                                                    )
                                                }
                                            >
                                                <SelectTrigger className="h-8 w-24">
                                                    <SelectValue
                                                        placeholder={t('Year')}
                                                    />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {yearOptions.map((year) => (
                                                        <SelectItem
                                                            key={year}
                                                            value={String(year)}
                                                        >
                                                            {year}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2">
                                            {monthLabels.map((label, index) => (
                                                <Button
                                                    key={label}
                                                    type="button"
                                                    size="sm"
                                                    variant={
                                                        monthlyYear ===
                                                            Number(
                                                                month.slice(
                                                                    0,
                                                                    4,
                                                                ),
                                                            ) &&
                                                        index ===
                                                            selectedMonthIndex
                                                            ? 'default'
                                                            : 'outline'
                                                    }
                                                    className="justify-center"
                                                    onClick={() =>
                                                        handleMonthlyPick(index)
                                                    }
                                                >
                                                    {t(label)}
                                                </Button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </PopoverContent>
                        </Popover>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setDownloadPeriod(mode);
                                setDownloadFrom(date);
                                setDownloadTo(date);
                                setDownloadMonth(month);
                                setDownloadError(null);
                                setDownloadOpen(true);
                            }}
                        >
                            <Download className="h-4 w-4" /> {t('Download')}
                        </Button>
                    </div>
                </PageHeader>

                <Dialog
                    open={downloadOpen}
                    onOpenChange={(open) => {
                        if (!downloading) {
                            setDownloadOpen(open);
                        }
                    }}
                >
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>
                                {t('Download sales overview')}
                            </DialogTitle>
                            <DialogDescription>
                                {t(
                                    'Choose a day, an inclusive date range, or a whole month. The PDF includes paid sales across all register sessions.',
                                )}
                            </DialogDescription>
                        </DialogHeader>
                        <form
                            className="space-y-4"
                            onSubmit={(event) => {
                                event.preventDefault();
                                void downloadReport();
                            }}
                        >
                            <div className="space-y-2">
                                <Label htmlFor="download-period">
                                    {t('Report period')}
                                </Label>
                                <Select
                                    value={downloadPeriod}
                                    onValueChange={(value) =>
                                        setDownloadPeriod(
                                            value as typeof downloadPeriod,
                                        )
                                    }
                                    disabled={downloading}
                                >
                                    <SelectTrigger id="download-period">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="daily">
                                            {t('Single day')}
                                        </SelectItem>
                                        <SelectItem value="range">
                                            {t('Date range')}
                                        </SelectItem>
                                        <SelectItem value="monthly">
                                            {t('Whole month')}
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            {downloadPeriod === 'monthly' ? (
                                <div className="space-y-2">
                                    <Label htmlFor="download-month">
                                        {t('Month')}
                                    </Label>
                                    <Input
                                        id="download-month"
                                        type="month"
                                        required
                                        value={downloadMonth}
                                        onChange={(event) =>
                                            setDownloadMonth(event.target.value)
                                        }
                                        disabled={downloading}
                                    />
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="download-from">
                                            {downloadPeriod === 'range'
                                                ? t('Start date')
                                                : t('Date')}
                                        </Label>
                                        <Input
                                            id="download-from"
                                            type="date"
                                            required
                                            value={downloadFrom}
                                            onChange={(event) =>
                                                setDownloadFrom(
                                                    event.target.value,
                                                )
                                            }
                                            disabled={downloading}
                                        />
                                    </div>
                                    {downloadPeriod === 'range' && (
                                        <div className="space-y-2">
                                            <Label htmlFor="download-to">
                                                {t('End date (included)')}
                                            </Label>
                                            <Input
                                                id="download-to"
                                                type="date"
                                                required
                                                min={downloadFrom}
                                                value={downloadTo}
                                                onChange={(event) =>
                                                    setDownloadTo(
                                                        event.target.value,
                                                    )
                                                }
                                                disabled={downloading}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                            {downloadError && (
                                <p
                                    role="alert"
                                    className="text-sm text-destructive"
                                >
                                    {t(downloadError)}
                                </p>
                            )}
                            <DialogFooter>
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={downloading}
                                    onClick={() => setDownloadOpen(false)}
                                >
                                    {t('Cancel')}
                                </Button>
                                <Button type="submit" disabled={downloading}>
                                    {downloading
                                        ? t('Preparing PDF…')
                                        : t('Download PDF')}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>

                <div className="grid gap-4 md:grid-cols-3">
                    <Card className="border-sidebar-border/70 bg-background py-4 dark:border-sidebar-border">
                        <CardHeader className="px-4 pb-0">
                            <CardTitle className="text-xs font-medium text-muted-foreground">
                                {t('Total revenue')}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="px-4">
                            <div className="text-3xl font-semibold tabular-nums">
                                {money(Number(summary.total_revenue) || 0)}
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="border-sidebar-border/70 bg-background py-4 dark:border-sidebar-border">
                        <CardHeader className="px-4 pb-0">
                            <CardTitle className="text-xs font-medium text-muted-foreground">
                                {t('Sessions')}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="px-4">
                            <div className="text-3xl font-semibold tabular-nums">
                                {summary.sessions_count}
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="border-sidebar-border/70 bg-background py-4 dark:border-sidebar-border">
                        <CardHeader className="px-4 pb-0">
                            <CardTitle className="text-xs font-medium text-muted-foreground">
                                {t('Receipts')}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="px-4">
                            <div className="text-3xl font-semibold tabular-nums">
                                {summary.receipts_count}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                    <Card className="border-sidebar-border/70 bg-background py-4 dark:border-sidebar-border">
                        <CardHeader className="px-4 pb-0">
                            <CardTitle className="text-sm font-semibold">
                                {t('Sales breakdown')}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="px-4">
                            {salesData.length === 0 ? (
                                <p className="py-8 text-center text-sm text-muted-foreground">
                                    {t('No sales this period.')}
                                </p>
                            ) : (
                                <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
                                    <ChartContainer
                                        config={salesChartConfig}
                                        className="mx-auto aspect-auto h-[200px] w-[200px]"
                                    >
                                        <PieChart>
                                            <ChartTooltip
                                                content={
                                                    <ChartTooltipContent
                                                        hideLabel
                                                        formatter={
                                                            moneyTooltipFormatter
                                                        }
                                                    />
                                                }
                                            />
                                            <Pie
                                                data={salesData}
                                                dataKey="value"
                                                nameKey="name"
                                                innerRadius={48}
                                                outerRadius={80}
                                            >
                                                {salesData.map(
                                                    (item, index) => (
                                                        <Cell
                                                            key={item.name}
                                                            fill={
                                                                salesColorMap[
                                                                    item.name
                                                                ] ??
                                                                paymentPalette[
                                                                    index %
                                                                        paymentPalette.length
                                                                ]
                                                            }
                                                        />
                                                    ),
                                                )}
                                            </Pie>
                                        </PieChart>
                                    </ChartContainer>
                                    <ul className="space-y-2 text-sm">
                                        {salesData.map((item, index) => {
                                            const total = salesData.reduce(
                                                (sum, row) => sum + row.value,
                                                0,
                                            );
                                            const color =
                                                salesColorMap[item.name] ??
                                                paymentPalette[
                                                    index %
                                                        paymentPalette.length
                                                ];

                                            return (
                                                <li
                                                    key={item.name}
                                                    className="flex items-center justify-between gap-3"
                                                >
                                                    <span className="flex items-center gap-2">
                                                        <span
                                                            className="h-2.5 w-2.5 rounded-full"
                                                            style={{
                                                                backgroundColor:
                                                                    color,
                                                            }}
                                                        />
                                                        {salesLabel(item.name)}
                                                    </span>
                                                    <span className="text-muted-foreground tabular-nums">
                                                        {money(item.value)} (
                                                        {Math.round(
                                                            (item.value /
                                                                total) *
                                                                100,
                                                        )}
                                                        %)
                                                    </span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="border-sidebar-border/70 bg-background py-4 dark:border-sidebar-border">
                        <CardHeader className="px-4 pb-0">
                            <CardTitle className="text-sm font-semibold">
                                {t('Payment type breakdown')}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="px-4">
                            {paymentData.length === 0 ? (
                                <p className="py-8 text-center text-sm text-muted-foreground">
                                    {t('No payments this period.')}
                                </p>
                            ) : (
                                <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
                                    <ChartContainer
                                        config={paymentsChartConfig}
                                        className="mx-auto aspect-auto h-[200px] w-[200px]"
                                    >
                                        <PieChart>
                                            <ChartTooltip
                                                content={
                                                    <ChartTooltipContent
                                                        hideLabel
                                                        formatter={
                                                            moneyTooltipFormatter
                                                        }
                                                    />
                                                }
                                            />
                                            <Pie
                                                data={paymentData}
                                                dataKey="value"
                                                nameKey="name"
                                                innerRadius={48}
                                                outerRadius={80}
                                            >
                                                {paymentData.map(
                                                    (item, index) => (
                                                        <Cell
                                                            key={item.name}
                                                            fill={
                                                                paymentPalette[
                                                                    index %
                                                                        paymentPalette.length
                                                                ]
                                                            }
                                                        />
                                                    ),
                                                )}
                                            </Pie>
                                        </PieChart>
                                    </ChartContainer>
                                    <ul className="space-y-2 text-sm">
                                        {paymentData.map((item, index) => {
                                            const total = paymentData.reduce(
                                                (sum, row) => sum + row.value,
                                                0,
                                            );

                                            return (
                                                <li
                                                    key={item.name}
                                                    className="flex items-center justify-between gap-3"
                                                >
                                                    <span className="flex items-center gap-2">
                                                        <span
                                                            className="h-2.5 w-2.5 rounded-full"
                                                            style={{
                                                                backgroundColor:
                                                                    paymentPalette[
                                                                        index %
                                                                            paymentPalette.length
                                                                    ],
                                                            }}
                                                        />
                                                        {payLabel(item.name)}
                                                    </span>
                                                    <span className="text-muted-foreground tabular-nums">
                                                        {money(item.value)} (
                                                        {Math.round(
                                                            (item.value /
                                                                total) *
                                                                100,
                                                        )}
                                                        %)
                                                    </span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {mode === 'monthly' && (
                    <Card className="border-sidebar-border/70 bg-background py-4 dark:border-sidebar-border">
                        <CardHeader className="px-4 pb-0">
                            <CardTitle className="text-sm font-semibold">
                                {t('Monthly income ({year})', {
                                    year: selected_year,
                                })}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="px-4">
                            <ChartContainer
                                config={incomeChartConfig}
                                className="h-[300px] w-full"
                            >
                                <BarChart
                                    data={monthlyIncomeData}
                                    margin={{ left: 8, right: 8 }}
                                >
                                    <CartesianGrid vertical={false} />
                                    <XAxis
                                        dataKey="month"
                                        tickLine={false}
                                        axisLine={false}
                                        tickMargin={8}
                                        tickFormatter={(value) =>
                                            t(String(value))
                                        }
                                    />
                                    <ChartTooltip
                                        content={
                                            <ChartTooltipContent
                                                formatter={
                                                    moneyTooltipFormatter
                                                }
                                            />
                                        }
                                    />
                                    <Bar
                                        dataKey="income"
                                        fill="var(--color-income)"
                                        radius={6}
                                    />
                                </BarChart>
                            </ChartContainer>
                        </CardContent>
                    </Card>
                )}

                <Card className="border-sidebar-border/70 bg-background py-4 dark:border-sidebar-border">
                    <CardHeader className="px-4 pb-0">
                        <div className="flex items-center justify-between gap-3">
                            <CardTitle className="text-sm font-semibold">
                                {t('Invoices')}
                            </CardTitle>
                            {adminEnabled && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                        const params =
                                            mode === 'daily'
                                                ? `mode=daily&date=${encodeURIComponent(date)}`
                                                : `mode=monthly&month=${encodeURIComponent(month)}&date=${encodeURIComponent(date)}`;
                                        window.open(
                                            `/admin/overview/export/csv?${params}`,
                                            '_blank',
                                        );
                                    }}
                                >
                                    {t('Export CSV')}
                                </Button>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent className="px-4">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t('Invoice')}</TableHead>
                                    <TableHead>{t('Status')}</TableHead>
                                    <TableHead>{t('Method')}</TableHead>
                                    <TableHead className="text-right">
                                        {t('Amount')}
                                    </TableHead>
                                    {adminEnabled && (
                                        <TableHead className="text-right">
                                            {t('Actions')}
                                        </TableHead>
                                    )}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {invoices.length === 0 && (
                                    <TableRow>
                                        <TableCell
                                            colSpan={adminEnabled ? 5 : 4}
                                            className="text-muted-foreground"
                                        >
                                            {t('No invoices for this period.')}
                                        </TableCell>
                                    </TableRow>
                                )}
                                {pagedInvoices.map((row) => (
                                    <TableRow
                                        key={row.invoice}
                                        className="cursor-pointer"
                                        onClick={() =>
                                            void openInvoiceDetail(row.id)
                                        }
                                    >
                                        <TableCell className="font-medium">
                                            {row.invoice}
                                            <div className="text-xs text-muted-foreground">
                                                {row.paid_at
                                                    ? formatDateTime(
                                                          row.paid_at,
                                                      )
                                                    : '—'}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant={
                                                    row.status.toLowerCase() ===
                                                    'paid'
                                                        ? 'secondary'
                                                        : row.status.toLowerCase() ===
                                                            'voided'
                                                          ? 'destructive'
                                                          : 'outline'
                                                }
                                            >
                                                {t(
                                                    row.status
                                                        .charAt(0)
                                                        .toUpperCase() +
                                                        row.status
                                                            .slice(1)
                                                            .toLowerCase(),
                                                )}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {payLabel(row.method)}
                                        </TableCell>
                                        <TableCell className="text-right font-semibold tabular-nums">
                                            {money(Number(row.amount) || 0)}
                                        </TableCell>
                                        {adminEnabled && (
                                            <TableCell className="text-right">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        openReceipt(row.id);
                                                    }}
                                                >
                                                    {t('Edit')}
                                                </Button>
                                            </TableCell>
                                        )}
                                    </TableRow>
                                ))}
                            </TableBody>
                            <TableFooter>
                                <TableRow>
                                    <TableCell colSpan={3}>
                                        {t('Period total')}
                                        {invoices.length > INVOICES_PER_PAGE
                                            ? ` · ${t('{count} invoices', { count: invoices.length })}`
                                            : ''}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {money(invoicesTotal)}
                                    </TableCell>
                                    {adminEnabled && <TableCell />}
                                </TableRow>
                            </TableFooter>
                            <TableCaption>
                                {mode === 'daily'
                                    ? t('Invoices for the selected date.')
                                    : t(
                                          'Invoices for the selected month, newest to oldest.',
                                      )}
                            </TableCaption>
                        </Table>
                        {invoices.length > INVOICES_PER_PAGE && (
                            <div className="mt-3 flex items-center justify-between gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={invoicePage <= 1}
                                    onClick={() =>
                                        setInvoicePage((page) =>
                                            Math.max(1, page - 1),
                                        )
                                    }
                                >
                                    {t('Previous')}
                                </Button>
                                <span className="text-xs text-muted-foreground">
                                    {t('Page {page} of {pages}', {
                                        page: invoicePage,
                                        pages: invoicePageCount,
                                    })}
                                    <span className="mx-1">·</span>
                                    {t('{from}–{to} of {total}', {
                                        from:
                                            (invoicePage - 1) *
                                                INVOICES_PER_PAGE +
                                            1,
                                        to: Math.min(
                                            invoicePage * INVOICES_PER_PAGE,
                                            invoices.length,
                                        ),
                                        total: invoices.length,
                                    })}
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={invoicePage >= invoicePageCount}
                                    onClick={() =>
                                        setInvoicePage((page) =>
                                            Math.min(
                                                invoicePageCount,
                                                page + 1,
                                            ),
                                        )
                                    }
                                >
                                    {t('Next')}
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="border-sidebar-border/70 bg-background py-4 dark:border-sidebar-border">
                    <CardHeader className="px-4 pb-0">
                        <CardTitle className="text-sm font-semibold">
                            {t('Cancelled sessions')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t('Time')}</TableHead>
                                    <TableHead>{t('Table')}</TableHead>
                                    <TableHead>{t('Played')}</TableHead>
                                    <TableHead>{t('Items')}</TableHead>
                                    <TableHead>{t('Stock')}</TableHead>
                                    <TableHead>{t('Cancelled by')}</TableHead>
                                    <TableHead>{t('Reason')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {cancelled_sessions.length === 0 && (
                                    <TableRow>
                                        <TableCell
                                            colSpan={7}
                                            className="text-muted-foreground"
                                        >
                                            {t(
                                                'No cancelled sessions for this period.',
                                            )}
                                        </TableCell>
                                    </TableRow>
                                )}
                                {cancelled_sessions.map((session) => (
                                    <TableRow key={session.id}>
                                        <TableCell className="whitespace-nowrap">
                                            {formatCancelledAt(
                                                session.cancelled_at,
                                            )}
                                        </TableCell>
                                        <TableCell className="font-medium">
                                            {session.table_name}
                                        </TableCell>
                                        <TableCell className="font-mono text-xs tabular-nums">
                                            {formatPlayed(
                                                session.played_seconds ?? 0,
                                            )}
                                        </TableCell>
                                        <TableCell className="max-w-xs">
                                            {(session.items?.length ?? 0) ===
                                            0 ? (
                                                <span className="text-muted-foreground">
                                                    {t('No items')}
                                                </span>
                                            ) : (
                                                <ul className="space-y-0.5 text-xs">
                                                    {session.items.map(
                                                        (item, index) => (
                                                            <li
                                                                key={`${session.id}-${index}`}
                                                            >
                                                                {item.quantity}×{' '}
                                                                {
                                                                    item.product_name
                                                                }{' '}
                                                                <span className="text-muted-foreground">
                                                                    (
                                                                    {money(
                                                                        item.line_total,
                                                                    )}
                                                                    )
                                                                </span>
                                                            </li>
                                                        ),
                                                    )}
                                                </ul>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {stockLabel(
                                                session.stock_restored ?? null,
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {session.cancelled_by}
                                        </TableCell>
                                        <TableCell className="max-w-md">
                                            {session.reason || (
                                                <span className="text-muted-foreground">
                                                    {t('No reason provided')}
                                                </span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                            <TableCaption>
                                {t(
                                    'Cancelled active table sessions for this period.',
                                )}
                            </TableCaption>
                        </Table>
                    </CardContent>
                </Card>

                <Card className="border-sidebar-border/70 bg-background py-4 dark:border-sidebar-border">
                    <CardHeader className="px-4 pb-0">
                        <CardTitle className="text-sm font-semibold">
                            {t('Deleted / voided tabs')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t('Time')}</TableHead>
                                    <TableHead>{t('Tab')}</TableHead>
                                    <TableHead>{t('Tables')}</TableHead>
                                    <TableHead>{t('Items')}</TableHead>
                                    <TableHead>{t('Stock')}</TableHead>
                                    <TableHead>{t('Deleted by')}</TableHead>
                                    <TableHead>{t('Reason')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {voided_tabs.length === 0 && (
                                    <TableRow>
                                        <TableCell
                                            colSpan={7}
                                            className="text-muted-foreground"
                                        >
                                            {t(
                                                'No deleted tabs for this period.',
                                            )}
                                        </TableCell>
                                    </TableRow>
                                )}
                                {voided_tabs.map((tab) => (
                                    <TableRow key={tab.id}>
                                        <TableCell className="whitespace-nowrap">
                                            {formatCancelledAt(tab.voided_at)}
                                        </TableCell>
                                        <TableCell className="font-medium">
                                            #{tab.id}
                                            {tab.time_total > 0 ? (
                                                <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                                                    {t('Time {amount}', {
                                                        amount: money(
                                                            tab.time_total,
                                                        ),
                                                    })}
                                                </span>
                                            ) : null}
                                        </TableCell>
                                        <TableCell>
                                            {tab.table_names.length
                                                ? tab.table_names.join(', ')
                                                : '—'}
                                        </TableCell>
                                        <TableCell className="max-w-xs">
                                            {tab.items.length === 0 ? (
                                                <span className="text-muted-foreground">
                                                    {t('No items')}
                                                </span>
                                            ) : (
                                                <ul className="space-y-0.5 text-xs">
                                                    {tab.items.map(
                                                        (item, index) => (
                                                            <li
                                                                key={`${tab.id}-${index}`}
                                                            >
                                                                {item.quantity}×{' '}
                                                                {
                                                                    item.product_name
                                                                }
                                                                {item.source !==
                                                                'tab' ? (
                                                                    <span className="text-muted-foreground">
                                                                        {' '}
                                                                        (
                                                                        {
                                                                            item.source
                                                                        }
                                                                        )
                                                                    </span>
                                                                ) : null}{' '}
                                                                <span className="text-muted-foreground">
                                                                    (
                                                                    {money(
                                                                        item.line_total,
                                                                    )}
                                                                    )
                                                                </span>
                                                            </li>
                                                        ),
                                                    )}
                                                </ul>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {stockLabel(tab.stock_restored)}
                                        </TableCell>
                                        <TableCell>{tab.voided_by}</TableCell>
                                        <TableCell className="max-w-md">
                                            {tab.reason || (
                                                <span className="text-muted-foreground">
                                                    {t('No reason provided')}
                                                </span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                            <TableCaption>
                                {t(
                                    'Open tabs that were deleted without payment.',
                                )}
                            </TableCaption>
                        </Table>
                    </CardContent>
                </Card>
            </div>

            <Dialog
                open={receiptOpen}
                onOpenChange={(open) => {
                    setReceiptOpen(open);

                    if (!open) {
                        setReceipt(null);
                        setReceiptError(null);
                        setReceiptLoading(false);
                    }
                }}
            >
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{t('Edit receipt')}</DialogTitle>
                        <DialogDescription>
                            {t(
                                'Admin-only. You can void/unvoid a receipt and update customer email.',
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    {receiptLoading && (
                        <p className="text-sm text-muted-foreground">
                            {t('Loading…')}
                        </p>
                    )}
                    {receiptError && (
                        <p className="text-sm text-destructive">
                            {t(receiptError)}
                        </p>
                    )}
                    {receipt && (
                        <div className="space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-1 sm:col-span-2">
                                    <Label className="text-xs">
                                        {t('Receipt #')}
                                    </Label>
                                    <Input
                                        value={receipt.receipt_number}
                                        disabled
                                    />
                                </div>
                                <div className="space-y-1 sm:col-span-2">
                                    <Label className="text-xs">
                                        {t('Customer email')}
                                    </Label>
                                    <Input
                                        type="email"
                                        value={editCustomerEmail}
                                        onChange={(e) =>
                                            setEditCustomerEmail(e.target.value)
                                        }
                                        placeholder={t('Optional')}
                                    />
                                </div>
                                <div className="space-y-1 sm:col-span-2">
                                    <Label className="text-xs">
                                        {t('Status')}
                                    </Label>
                                    <Select
                                        value={editStatus}
                                        onValueChange={(v) =>
                                            setEditStatus(
                                                v as
                                                    | 'paid'
                                                    | 'unpaid'
                                                    | 'voided',
                                            )
                                        }
                                    >
                                        <SelectTrigger className="w-full">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="paid">
                                                {t('Paid')}
                                            </SelectItem>
                                            <SelectItem value="unpaid">
                                                {t('Unpaid')}
                                            </SelectItem>
                                            <SelectItem value="voided">
                                                {t('Voided')}
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <DialogFooter>
                                <Button
                                    variant="outline"
                                    onClick={() => setReceiptOpen(false)}
                                >
                                    {t('Close')}
                                </Button>
                                <Button onClick={saveReceiptBasics}>
                                    {t('Save')}
                                </Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog
                open={!!detailInvoice || detailLoading || !!detailError}
                onOpenChange={(open) => {
                    if (!open) {
                        setDetailInvoice(null);
                        setDetailError(null);
                        setDetailLoading(false);
                    }
                }}
            >
                <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{t('Invoice details')}</DialogTitle>
                        <DialogDescription>
                            {detailLoading
                                ? t('Loading invoice…')
                                : detailInvoice
                                  ? `${detailInvoice.invoice} · ${t(
                                        'Paid {when}',
                                        {
                                            when: detailInvoice.paid_at
                                                ? formatDateTime(
                                                      detailInvoice.paid_at,
                                                  )
                                                : '—',
                                        },
                                    )}`
                                  : t('Invoice')}
                        </DialogDescription>
                    </DialogHeader>
                    {detailLoading && (
                        <p className="text-sm text-muted-foreground">
                            {t('Loading invoice details…')}
                        </p>
                    )}
                    {detailError && (
                        <p className="text-sm text-destructive">
                            {t(detailError)}
                        </p>
                    )}
                    {detailInvoice && (
                        <div className="space-y-4 text-sm">
                            <div className="rounded-md border p-3">
                                <div className="mb-2 font-medium">
                                    {t('Items and table time')}
                                </div>
                                {detailInvoice.line_items.length === 0 ? (
                                    <p className="text-muted-foreground">
                                        {t('No line items recorded.')}
                                    </p>
                                ) : (
                                    detailInvoice.line_items.map(
                                        (item, index) => (
                                            <div
                                                key={`${item.description}-${index}`}
                                                className="border-t py-2 first:border-t-0"
                                            >
                                                <div className="flex justify-between gap-3">
                                                    <span>
                                                        {item.type === 'time'
                                                            ? item.description
                                                                  .replace(
                                                                      /^Table\s+(?=Table\b)/i,
                                                                      '',
                                                                  )
                                                                  .replace(
                                                                      /\s+[—-]\s+time$/i,
                                                                      '',
                                                                  )
                                                            : `${item.description} × ${item.quantity}`}
                                                    </span>
                                                    <span className="font-medium">
                                                        {money(item.subtotal)}
                                                    </span>
                                                </div>
                                                {item.type === 'time' &&
                                                    item.meta && (
                                                        <div className="mt-1 text-xs text-muted-foreground">
                                                            {t(
                                                                'Started: {from} · Ended: {to} · Total time: {duration}',
                                                                {
                                                                    from: String(
                                                                        item
                                                                            .meta
                                                                            .from ??
                                                                            '—',
                                                                    ),
                                                                    to: String(
                                                                        item
                                                                            .meta
                                                                            .to ??
                                                                            '—',
                                                                    ),
                                                                    duration:
                                                                        String(
                                                                            item
                                                                                .meta
                                                                                .duration ??
                                                                                '—',
                                                                        ),
                                                                },
                                                            )}
                                                        </div>
                                                    )}
                                                {(item.components?.length ??
                                                    0) > 0 && (
                                                    <div className="mt-2 space-y-1 border-l pl-3">
                                                        <div className="text-xs font-medium text-muted-foreground">
                                                            {t('On this tab')}
                                                        </div>
                                                        {item.components!.map(
                                                            (
                                                                component,
                                                                componentIndex,
                                                            ) => (
                                                                <div
                                                                    key={`${component.description}-${componentIndex}`}
                                                                >
                                                                    <div className="flex justify-between gap-3">
                                                                        <span>
                                                                            {component.type ===
                                                                            'time'
                                                                                ? `${component.description.replace(/^Table\s+(?=Table\b)/i, '').replace(/\s+[—-]\s+time$/i, '')}${Number(component.quantity) > 1 ? ` × ${component.quantity}` : ''}`
                                                                                : `${component.description} × ${component.quantity}`}
                                                                        </span>
                                                                        <span>
                                                                            {money(
                                                                                component.subtotal,
                                                                            )}
                                                                        </span>
                                                                    </div>
                                                                    {component.type ===
                                                                        'time' &&
                                                                        component.meta && (
                                                                            <div className="mt-0.5 text-xs text-muted-foreground">
                                                                                {t(
                                                                                    'Started: {from} · Ended: {to} · Total time: {duration}',
                                                                                    {
                                                                                        from: String(
                                                                                            component
                                                                                                .meta
                                                                                                .from ??
                                                                                                '—',
                                                                                        ),
                                                                                        to: String(
                                                                                            component
                                                                                                .meta
                                                                                                .to ??
                                                                                                '—',
                                                                                        ),
                                                                                        duration:
                                                                                            String(
                                                                                                component
                                                                                                    .meta
                                                                                                    .duration ??
                                                                                                    '—',
                                                                                            ),
                                                                                    },
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                </div>
                                                            ),
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ),
                                    )
                                )}
                            </div>
                            <div className="rounded-md border p-3">
                                <div className="mb-2 font-medium">
                                    {t('Payment split')}
                                </div>
                                {detailInvoice.payments.map((payment) => (
                                    <div
                                        key={payment.method}
                                        className="flex justify-between py-1"
                                    >
                                        <span>{payLabel(payment.method)}</span>
                                        <span>{money(payment.amount)}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-between border-t pt-3 font-semibold">
                                <span>{t('Total')}</span>
                                <span>{money(detailInvoice.amount)}</span>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
