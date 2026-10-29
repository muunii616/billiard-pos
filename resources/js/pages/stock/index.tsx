import { Head, router, usePage } from '@inertiajs/react';
import {
    AlertTriangle,
    Boxes,
    Download,
    Minus,
    PackageOpen,
    Plus,
    Search,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { categoryBadgeClass, normalizeCategory } from '@/lib/categories';
import { businessDate, formatDateTime } from '@/lib/dates';
import { useCategoryLabel, useI18n } from '@/lib/i18n';
import { formatMoney } from '@/lib/payments';
import { posPanelClass } from '@/lib/pos-ui';
import { cn } from '@/lib/utils';

type StockProduct = {
    id: number;
    name: string;
    category: string;
    price: number;
    cost_price: number;
    stock_quantity: number;
    low_stock_threshold: number;
    is_active: boolean;
    status: 'ok' | 'low' | 'out';
    value_at_cost: number;
};

type ActivityRow = {
    id: number;
    kind: 'adjustment' | 'external';
    product_name: string | null;
    user_name: string | null;
    quantity: number;
    stock_after: number | null;
    note: string | null;
    at: string | null;
};

type Props = {
    products: StockProduct[];
    summary: {
        sku_count: number;
        units_on_hand: number;
        ok_count: number;
        low_count: number;
        out_count: number;
        inventory_value: number;
    };
    activity: ActivityRow[];
    users: { id: number; name: string }[];
    isAdmin: boolean;
};

type FilterKey = 'all' | 'attention' | 'ok' | 'low' | 'out';

function stockFillPercent(product: StockProduct): number {
    const target = Math.max(product.low_stock_threshold * 3, 20);

    return Math.max(
        0,
        Math.min(100, Math.round((product.stock_quantity / target) * 100)),
    );
}

function statusTone(status: StockProduct['status']): string {
    if (status === 'out') {
        return 'bg-rose-600';
    }

    if (status === 'low') {
        return 'bg-amber-500';
    }

    return 'bg-emerald-600';
}

export default function StockIndex({
    products,
    summary,
    activity,
    users,
    isAdmin,
}: Props) {
    const { t } = useI18n();
    const categoryLabel = useCategoryLabel();
    const page = usePage();
    const authRole = (page.props as { auth?: { user?: { role?: string } } })
        ?.auth?.user?.role;
    const adminEnabled = isAdmin || authRole === 'admin';
    const today = businessDate();
    const [downloadOpen, setDownloadOpen] = useState(false);
    const [downloadPeriod, setDownloadPeriod] = useState<
        'daily' | 'range' | 'monthly'
    >('daily');
    const [downloadFrom, setDownloadFrom] = useState(today);
    const [downloadTo, setDownloadTo] = useState(today);
    const [downloadMonth, setDownloadMonth] = useState(today.slice(0, 7));
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
            const response = await fetch(`/stock/download?${params}`, {
                headers: { Accept: 'application/pdf, application/json' },
                credentials: 'same-origin',
            });

            if (
                !response.ok ||
                !response.headers
                    .get('Content-Type')
                    ?.includes('application/pdf')
            ) {
                const error = await response.json().catch(() => ({}));

                throw new Error(
                    (error as { message?: string }).message ||
                        'Could not download the inventory report.',
                );
            }

            const url = URL.createObjectURL(await response.blob());
            const link = document.createElement('a');
            link.href = url;
            link.download = `inventory-${downloadPeriod}-${downloadPeriod === 'monthly' ? downloadMonth : downloadFrom}${downloadPeriod === 'range' ? `-to-${downloadTo}` : ''}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 60000);
            setDownloadOpen(false);
        } catch (downloadFailure) {
            setDownloadError(
                downloadFailure instanceof Error
                    ? downloadFailure.message
                    : t('Could not download the inventory report.'),
            );
        } finally {
            setDownloading(false);
        }
    };
    const money = formatMoney;

    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<FilterKey>('all');
    const [category, setCategory] = useState('all');
    const [draftChanges, setDraftChanges] = useState<Record<number, string>>(
        {},
    );
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const [externalOpen, setExternalOpen] = useState(false);
    const [externalUserId, setExternalUserId] = useState(
        users[0] ? String(users[0].id) : '',
    );
    const [externalProductId, setExternalProductId] = useState('');
    const [externalQty, setExternalQty] = useState('1');
    const [externalNote, setExternalNote] = useState('');
    const [externalError, setExternalError] = useState<string | null>(null);
    const [externalSaving, setExternalSaving] = useState(false);

    const categories = useMemo(
        () =>
            Array.from(
                new Set(
                    products.map((product) =>
                        normalizeCategory(product.category),
                    ),
                ),
            ).sort(),
        [products],
    );

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();

        return products.filter((product) => {
            if (
                category !== 'all' &&
                normalizeCategory(product.category) !== category
            ) {
                return false;
            }

            if (filter === 'attention' && product.status === 'ok') {
                return false;
            }

            if (filter === 'ok' && product.status !== 'ok') {
                return false;
            }

            if (filter === 'low' && product.status !== 'low') {
                return false;
            }

            if (filter === 'out' && product.status !== 'out') {
                return false;
            }

            if (!query) {
                return true;
            }

            return (
                product.name.toLowerCase().includes(query) ||
                product.category.toLowerCase().includes(query) ||
                categoryLabel(normalizeCategory(product.category))
                    .toLowerCase()
                    .includes(query)
            );
        });
    }, [category, categoryLabel, filter, products, search]);

    const pendingItems = useMemo(
        () =>
            Object.entries(draftChanges)
                .map(([productId, raw]) => ({
                    product_id: Number(productId),
                    quantity: Number.parseInt(raw, 10),
                }))
                .filter(
                    (item) =>
                        Number.isFinite(item.quantity) &&
                        item.quantity !== 0 &&
                        !Number.isNaN(item.quantity),
                ),
        [draftChanges],
    );

    const setDelta = (productId: number, next: string) => {
        setDraftChanges((previous) => {
            const copy = { ...previous };

            if (next.trim() === '' || next.trim() === '0') {
                delete copy[productId];
            } else {
                copy[productId] = next;
            }

            return copy;
        });
        setError(null);
        setMessage(null);
    };

    const bumpDelta = (productId: number, step: number) => {
        const current =
            Number.parseInt(draftChanges[productId] ?? '0', 10) || 0;
        const next = current + step;

        if (!adminEnabled && next < 0) {
            setError('Only administrators can decrease stock.');

            return;
        }

        setDelta(productId, next === 0 ? '' : String(next));
    };

    const saveAdjustments = () => {
        if (pendingItems.length === 0) {
            setError('Enter at least one stock change.');

            return;
        }

        if (!adminEnabled && pendingItems.some((item) => item.quantity < 0)) {
            setError('Only administrators can decrease stock.');

            return;
        }

        setSaving(true);
        setError(null);
        setMessage(null);
        router.post(
            '/admin/products/stock',
            { items: pendingItems },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setDraftChanges({});
                    setMessage('Stock updated.');
                },
                onError: (errors) => {
                    setError(
                        (errors as { inventory?: string }).inventory ||
                            'Could not update stock.',
                    );
                },
                onFinish: () => setSaving(false),
            },
        );
    };

    const submitExternalUse = () => {
        setExternalError(null);
        const productId = Number(externalProductId);
        const quantity = Number.parseInt(externalQty, 10);
        const userId = Number(externalUserId);

        if (
            !productId ||
            !userId ||
            !Number.isFinite(quantity) ||
            quantity < 1
        ) {
            setExternalError('Pick a product, staff member, and quantity.');

            return;
        }

        setExternalSaving(true);
        router.post(
            '/admin/products/external-use',
            {
                user_id: userId,
                items: [{ product_id: productId, quantity }],
                note: externalNote.trim() || null,
            },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setExternalOpen(false);
                    setExternalProductId('');
                    setExternalQty('1');
                    setExternalNote('');
                    setMessage('External use recorded.');
                },
                onError: (errors) => {
                    setExternalError(
                        (errors as { inventory?: string }).inventory ||
                            'Could not record external use.',
                    );
                },
                onFinish: () => setExternalSaving(false),
            },
        );
    };

    return (
        <AppLayout breadcrumbs={[]}>
            <Head title={t('Stock')} />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <PageHeader
                    title={t('Stock')}
                    description={t(
                        'See what’s on the shelf, top up fast, and catch low inventory before a rush.',
                    )}
                >
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                            setDownloadError(null);
                            setDownloadOpen(true);
                        }}
                    >
                        <Download className="h-4 w-4" /> {t('Inventory report')}
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                            setExternalError(null);
                            setExternalOpen(true);
                        }}
                    >
                        {t('External use')}
                    </Button>
                    <Button
                        type="button"
                        disabled={saving || pendingItems.length === 0}
                        onClick={saveAdjustments}
                    >
                        {saving
                            ? t('Saving…')
                            : pendingItems.length > 0
                              ? t(
                                    pendingItems.length === 1
                                        ? 'Save 1 change'
                                        : 'Save {count} changes',
                                    {
                                        count: pendingItems.length,
                                    },
                                )
                              : t('Save changes')}
                    </Button>
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
                                {t('Download inventory overview')}
                            </DialogTitle>
                            <DialogDescription>
                                {t(
                                    'Choose a day, an inclusive date range, or a whole month. The PDF shows the count at the start, what’s on hand at the end, and the difference. First stock is the amount entered when the product was added.',
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
                                <Label htmlFor="inventory-period">
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
                                    <SelectTrigger id="inventory-period">
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
                                    <Label htmlFor="inventory-month">
                                        {t('Month')}
                                    </Label>
                                    <Input
                                        id="inventory-month"
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
                                        <Label htmlFor="inventory-from">
                                            {downloadPeriod === 'range'
                                                ? t('Start date')
                                                : t('Date')}
                                        </Label>
                                        <Input
                                            id="inventory-from"
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
                                            <Label htmlFor="inventory-to">
                                                {t('End date (included)')}
                                            </Label>
                                            <Input
                                                id="inventory-to"
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

                {(error || message) && (
                    <div
                        className={cn(
                            'rounded-lg border px-3 py-2 text-sm',
                            error
                                ? 'border-destructive/40 bg-destructive/10 text-destructive'
                                : 'border-emerald-600/30 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300',
                        )}
                    >
                        {t(error || message || '')}
                    </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className={`${posPanelClass} p-4`}>
                        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                            {t('On hand')}
                        </div>
                        <div className="mt-1 text-3xl font-semibold tabular-nums">
                            {summary.units_on_hand}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                            {t('{count} products · {value} at cost', {
                                count: summary.sku_count,
                                value: money(summary.inventory_value),
                            })}
                        </div>
                    </div>
                    <div className={`${posPanelClass} p-4`}>
                        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                            {t('Healthy')}
                        </div>
                        <div className="mt-1 text-3xl font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
                            {summary.ok_count}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                            {t('Above low-stock alert')}
                        </div>
                    </div>
                    <button
                        type="button"
                        className={`${posPanelClass} p-4 text-left transition hover:border-amber-500/50`}
                        onClick={() => setFilter('low')}
                    >
                        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                            {t('Low stock')}
                        </div>
                        <div className="mt-1 text-3xl font-semibold text-amber-600 tabular-nums dark:text-amber-400">
                            {summary.low_count}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                            {t('Tap to filter')}
                        </div>
                    </button>
                    <button
                        type="button"
                        className={`${posPanelClass} p-4 text-left transition hover:border-rose-500/50`}
                        onClick={() => setFilter('out')}
                    >
                        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                            {t('Out of stock')}
                        </div>
                        <div className="mt-1 text-3xl font-semibold text-rose-600 tabular-nums dark:text-rose-400">
                            {summary.out_count}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                            {t('Tap to filter')}
                        </div>
                    </button>
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
                    <div
                        className={`${posPanelClass} flex min-h-[28rem] flex-col`}
                    >
                        <div className="flex flex-col gap-3 border-b border-border/70 p-3 sm:flex-row sm:items-center">
                            <div className="relative min-w-0 flex-1">
                                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={search}
                                    onChange={(event) =>
                                        setSearch(event.target.value)
                                    }
                                    placeholder={t('Search products…')}
                                    className="pl-9"
                                />
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {(
                                    [
                                        ['all', 'All'],
                                        ['attention', 'Needs attention'],
                                        ['ok', 'Healthy'],
                                        ['low', 'Low'],
                                        ['out', 'Out'],
                                    ] as const
                                ).map(([key, label]) => (
                                    <Button
                                        key={key}
                                        type="button"
                                        size="sm"
                                        variant={
                                            filter === key
                                                ? 'default'
                                                : 'outline'
                                        }
                                        onClick={() => setFilter(key)}
                                    >
                                        {t(label)}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-1.5 border-b border-border/70 px-3 py-2">
                            <Button
                                type="button"
                                size="sm"
                                variant={
                                    category === 'all' ? 'secondary' : 'ghost'
                                }
                                onClick={() => setCategory('all')}
                            >
                                {t('All categories')}
                            </Button>
                            {categories.map((name) => (
                                <Button
                                    key={name}
                                    type="button"
                                    size="sm"
                                    variant={
                                        category === name
                                            ? 'secondary'
                                            : 'ghost'
                                    }
                                    onClick={() => setCategory(name)}
                                >
                                    {categoryLabel(name)}
                                </Button>
                            ))}
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto">
                            {filtered.length === 0 ? (
                                <div className="p-6">
                                    <EmptyState
                                        icon={PackageOpen}
                                        title={t('No products match')}
                                        description={t(
                                            'Try another filter or search.',
                                        )}
                                    />
                                </div>
                            ) : (
                                <ul className="divide-y divide-border/70">
                                    {filtered.map((product) => {
                                        const fill = stockFillPercent(product);
                                        const draft =
                                            draftChanges[product.id] ?? '';

                                        return (
                                            <li
                                                key={product.id}
                                                className="grid gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center"
                                            >
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="truncate font-medium">
                                                            {product.name}
                                                        </span>
                                                        <span
                                                            className={`inline-flex h-5 items-center rounded-full px-2 text-[10px] font-semibold tracking-wide uppercase ${categoryBadgeClass(product.category)}`}
                                                        >
                                                            {categoryLabel(
                                                                normalizeCategory(
                                                                    product.category,
                                                                ),
                                                            )}
                                                        </span>
                                                        {product.status !==
                                                            'ok' && (
                                                            <Badge
                                                                variant={
                                                                    product.status ===
                                                                    'out'
                                                                        ? 'destructive'
                                                                        : 'secondary'
                                                                }
                                                                className="gap-1"
                                                            >
                                                                <AlertTriangle className="h-3 w-3" />
                                                                {product.status ===
                                                                'out'
                                                                    ? t('Out')
                                                                    : t('Low')}
                                                            </Badge>
                                                        )}
                                                        {!product.is_active && (
                                                            <Badge variant="outline">
                                                                {t('Inactive')}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <div className="mt-2">
                                                        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                                                            <span>
                                                                {
                                                                    product.stock_quantity
                                                                }{' '}
                                                                {t('on hand')}
                                                                <span className="mx-1">
                                                                    ·
                                                                </span>
                                                                {t('alert at')}{' '}
                                                                {
                                                                    product.low_stock_threshold
                                                                }
                                                            </span>
                                                            <span className="tabular-nums">
                                                                {t('Sell')}{' '}
                                                                {money(
                                                                    product.price,
                                                                )}
                                                            </span>
                                                        </div>
                                                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                                                            <div
                                                                className={`h-full rounded-full transition-all ${statusTone(product.status)}`}
                                                                style={{
                                                                    width: `${fill}%`,
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-end gap-1.5">
                                                    <Button
                                                        type="button"
                                                        size="icon"
                                                        variant="outline"
                                                        className="h-9 w-9"
                                                        disabled={
                                                            !adminEnabled &&
                                                            (Number.parseInt(
                                                                draft || '0',
                                                                10,
                                                            ) || 0) <= 0
                                                        }
                                                        onClick={() =>
                                                            bumpDelta(
                                                                product.id,
                                                                -1,
                                                            )
                                                        }
                                                        title={
                                                            adminEnabled
                                                                ? t(
                                                                      'Decrease draft',
                                                                  )
                                                                : t(
                                                                      'Only admins can decrease stock',
                                                                  )
                                                        }
                                                    >
                                                        <Minus className="h-4 w-4" />
                                                    </Button>
                                                    <Input
                                                        type="number"
                                                        step="1"
                                                        value={draft}
                                                        placeholder="0"
                                                        title={
                                                            adminEnabled
                                                                ? t(
                                                                      'Change (+ receive / − remove)',
                                                                  )
                                                                : t(
                                                                      'Enter positive amount to add stock',
                                                                  )
                                                        }
                                                        onChange={(event) => {
                                                            const value =
                                                                event.target
                                                                    .value;

                                                            if (
                                                                !adminEnabled &&
                                                                Number(value) <
                                                                    0
                                                            ) {
                                                                setError(
                                                                    'Only administrators can decrease stock.',
                                                                );

                                                                return;
                                                            }

                                                            setDelta(
                                                                product.id,
                                                                value,
                                                            );
                                                        }}
                                                        className="h-9 w-20 text-center tabular-nums"
                                                    />
                                                    <Button
                                                        type="button"
                                                        size="icon"
                                                        variant="outline"
                                                        className="h-9 w-9"
                                                        onClick={() =>
                                                            bumpDelta(
                                                                product.id,
                                                                1,
                                                            )
                                                        }
                                                        title={t(
                                                            'Increase draft',
                                                        )}
                                                    >
                                                        <Plus className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    </div>

                    <div
                        className={`${posPanelClass} flex min-h-[28rem] flex-col`}
                    >
                        <div className="flex items-center gap-2 border-b border-border/70 px-3 py-3">
                            <Boxes className="h-4 w-4 text-muted-foreground" />
                            <div>
                                <div className="text-sm font-semibold">
                                    {t('Recent movement')}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    {t('Adjustments and external use')}
                                </div>
                            </div>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto">
                            {activity.length === 0 ? (
                                <div className="p-4 text-sm text-muted-foreground">
                                    {t('No stock movement recorded yet.')}
                                </div>
                            ) : (
                                <ul className="divide-y divide-border/60">
                                    {activity.map((row) => (
                                        <li
                                            key={`${row.kind}-${row.id}`}
                                            className="px-3 py-3 text-sm"
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="truncate font-medium">
                                                        {row.product_name ??
                                                            t(
                                                                'Deleted product',
                                                            )}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {row.kind === 'external'
                                                            ? t('External use')
                                                            : t(
                                                                  'Adjustment',
                                                              )}{' '}
                                                        ·{' '}
                                                        {row.user_name ??
                                                            t('Unknown')}
                                                    </div>
                                                </div>
                                                <div
                                                    className={cn(
                                                        'shrink-0 font-semibold tabular-nums',
                                                        row.quantity < 0
                                                            ? 'text-rose-600 dark:text-rose-400'
                                                            : 'text-emerald-700 dark:text-emerald-400',
                                                    )}
                                                >
                                                    {row.quantity > 0
                                                        ? '+'
                                                        : ''}
                                                    {row.quantity}
                                                </div>
                                            </div>
                                            <div className="mt-1 text-xs text-muted-foreground">
                                                {row.at
                                                    ? formatDateTime(row.at)
                                                    : '—'}
                                                {row.stock_after != null
                                                    ? ` · ${t('Now {count}', { count: row.stock_after })}`
                                                    : ''}
                                                {row.note
                                                    ? ` · ${row.note === 'Initial stock' ? t('Initial stock') : row.note}`
                                                    : ''}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <Dialog
                open={externalOpen}
                onOpenChange={(open) => {
                    setExternalOpen(open);

                    if (!open) {
                        setExternalError(null);
                    }
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('External use')}</DialogTitle>
                        <DialogDescription>
                            {t(
                                'Deduct stock used outside a sale — staff drinks, breakage, or house use.',
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label>{t('Staff member')}</Label>
                            <Select
                                value={externalUserId}
                                onValueChange={setExternalUserId}
                            >
                                <SelectTrigger>
                                    <SelectValue
                                        placeholder={t('Select staff')}
                                    />
                                </SelectTrigger>
                                <SelectContent>
                                    {users.map((user) => (
                                        <SelectItem
                                            key={user.id}
                                            value={String(user.id)}
                                        >
                                            {user.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>{t('Product')}</Label>
                            <Select
                                value={externalProductId}
                                onValueChange={setExternalProductId}
                            >
                                <SelectTrigger>
                                    <SelectValue
                                        placeholder={t('Select product')}
                                    />
                                </SelectTrigger>
                                <SelectContent>
                                    {products.map((product) => (
                                        <SelectItem
                                            key={product.id}
                                            value={String(product.id)}
                                        >
                                            {product.name} (
                                            {product.stock_quantity})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>{t('Quantity')}</Label>
                            <Input
                                type="number"
                                min={1}
                                step={1}
                                value={externalQty}
                                onChange={(event) =>
                                    setExternalQty(event.target.value)
                                }
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>{t('Note (optional)')}</Label>
                            <Input
                                value={externalNote}
                                onChange={(event) =>
                                    setExternalNote(event.target.value)
                                }
                                placeholder={t('Staff drink, spill, etc.')}
                            />
                        </div>
                        {externalError && (
                            <p className="text-sm text-destructive">
                                {t(externalError)}
                            </p>
                        )}
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setExternalOpen(false)}
                            disabled={externalSaving}
                        >
                            {t('Cancel')}
                        </Button>
                        <Button
                            type="button"
                            onClick={submitExternalUse}
                            disabled={externalSaving}
                        >
                            {externalSaving ? t('Saving…') : t('Record use')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
