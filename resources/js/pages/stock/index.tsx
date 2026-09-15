import { Head, router, usePage } from '@inertiajs/react';
import {
    AlertTriangle,
    Boxes,
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
import { formatDateTime } from '@/lib/dates';
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
    product_name: string;
    user_name: string;
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
    const page = usePage();
    const authRole = (page.props as { auth?: { user?: { role?: string } } })
        ?.auth?.user?.role;
    const adminEnabled = isAdmin || authRole === 'admin';
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
                new Set(products.map((product) => normalizeCategory(product.category))),
            ).sort(),
        [products],
    );

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();

        return products.filter((product) => {
            if (category !== 'all' && normalizeCategory(product.category) !== category) {
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
                product.category.toLowerCase().includes(query)
            );
        });
    }, [category, filter, products, search]);

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
        const current = Number.parseInt(draftChanges[productId] ?? '0', 10) || 0;
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

        if (!productId || !userId || !Number.isFinite(quantity) || quantity < 1) {
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
            <Head title="Stock" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <PageHeader
                    title="Stock"
                    description="See what’s on the shelf, top up fast, and catch low inventory before a rush."
                >
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                            setExternalError(null);
                            setExternalOpen(true);
                        }}
                    >
                        External use
                    </Button>
                    <Button
                        type="button"
                        disabled={saving || pendingItems.length === 0}
                        onClick={saveAdjustments}
                    >
                        {saving
                            ? 'Saving…'
                            : pendingItems.length > 0
                              ? `Save ${pendingItems.length} change${pendingItems.length === 1 ? '' : 's'}`
                              : 'Save changes'}
                    </Button>
                </PageHeader>

                {(error || message) && (
                    <div
                        className={cn(
                            'rounded-lg border px-3 py-2 text-sm',
                            error
                                ? 'border-destructive/40 bg-destructive/10 text-destructive'
                                : 'border-emerald-600/30 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300',
                        )}
                    >
                        {error || message}
                    </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className={`${posPanelClass} p-4`}>
                        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                            On hand
                        </div>
                        <div className="mt-1 text-3xl font-semibold tabular-nums">
                            {summary.units_on_hand}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                            {summary.sku_count} products ·{' '}
                            {money(summary.inventory_value)} at cost
                        </div>
                    </div>
                    <div className={`${posPanelClass} p-4`}>
                        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                            Healthy
                        </div>
                        <div className="mt-1 text-3xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                            {summary.ok_count}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                            Above low-stock alert
                        </div>
                    </div>
                    <button
                        type="button"
                        className={`${posPanelClass} p-4 text-left transition hover:border-amber-500/50`}
                        onClick={() => setFilter('low')}
                    >
                        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                            Low stock
                        </div>
                        <div className="mt-1 text-3xl font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                            {summary.low_count}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                            Tap to filter
                        </div>
                    </button>
                    <button
                        type="button"
                        className={`${posPanelClass} p-4 text-left transition hover:border-rose-500/50`}
                        onClick={() => setFilter('out')}
                    >
                        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                            Out of stock
                        </div>
                        <div className="mt-1 text-3xl font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                            {summary.out_count}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                            Tap to filter
                        </div>
                    </button>
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
                    <div className={`${posPanelClass} flex min-h-[28rem] flex-col`}>
                        <div className="flex flex-col gap-3 border-b border-border/70 p-3 sm:flex-row sm:items-center">
                            <div className="relative min-w-0 flex-1">
                                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={search}
                                    onChange={(event) =>
                                        setSearch(event.target.value)
                                    }
                                    placeholder="Search products…"
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
                                            filter === key ? 'default' : 'outline'
                                        }
                                        onClick={() => setFilter(key)}
                                    >
                                        {label}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-1.5 border-b border-border/70 px-3 py-2">
                            <Button
                                type="button"
                                size="sm"
                                variant={category === 'all' ? 'secondary' : 'ghost'}
                                onClick={() => setCategory('all')}
                            >
                                All categories
                            </Button>
                            {categories.map((name) => (
                                <Button
                                    key={name}
                                    type="button"
                                    size="sm"
                                    variant={
                                        category === name ? 'secondary' : 'ghost'
                                    }
                                    onClick={() => setCategory(name)}
                                >
                                    {name}
                                </Button>
                            ))}
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto">
                            {filtered.length === 0 ? (
                                <div className="p-6">
                                    <EmptyState
                                        icon={PackageOpen}
                                        title="No products match"
                                        description="Try another filter or search."
                                    />
                                </div>
                            ) : (
                                <ul className="divide-y divide-border/70">
                                    {filtered.map((product) => {
                                        const fill = stockFillPercent(product);
                                        const draft = draftChanges[product.id] ?? '';

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
                                                            {product.category}
                                                        </span>
                                                        {product.status !== 'ok' && (
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
                                                                    ? 'Out'
                                                                    : 'Low'}
                                                            </Badge>
                                                        )}
                                                        {!product.is_active && (
                                                            <Badge variant="outline">
                                                                Inactive
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <div className="mt-2">
                                                        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                                                            <span>
                                                                {product.stock_quantity}{' '}
                                                                on hand
                                                                <span className="mx-1">
                                                                    ·
                                                                </span>
                                                                alert at{' '}
                                                                {
                                                                    product.low_stock_threshold
                                                                }
                                                            </span>
                                                            <span className="tabular-nums">
                                                                Sell{' '}
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
                                                                ? 'Decrease draft'
                                                                : 'Only admins can decrease stock'
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
                                                                ? 'Change (+ receive / − remove)'
                                                                : 'Enter positive amount to add stock'
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
                                                        title="Increase draft"
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

                    <div className={`${posPanelClass} flex min-h-[28rem] flex-col`}>
                        <div className="flex items-center gap-2 border-b border-border/70 px-3 py-3">
                            <Boxes className="h-4 w-4 text-muted-foreground" />
                            <div>
                                <div className="text-sm font-semibold">
                                    Recent movement
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    Adjustments and external use
                                </div>
                            </div>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto">
                            {activity.length === 0 ? (
                                <div className="p-4 text-sm text-muted-foreground">
                                    No stock movement recorded yet.
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
                                                        {row.product_name}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {row.kind === 'external'
                                                            ? 'External use'
                                                            : 'Adjustment'}{' '}
                                                        · {row.user_name}
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
                                                    {row.quantity > 0 ? '+' : ''}
                                                    {row.quantity}
                                                </div>
                                            </div>
                                            <div className="mt-1 text-xs text-muted-foreground">
                                                {row.at
                                                    ? formatDateTime(row.at)
                                                    : '—'}
                                                {row.stock_after != null
                                                    ? ` · now ${row.stock_after}`
                                                    : ''}
                                                {row.note
                                                    ? ` · ${row.note}`
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
                        <DialogTitle>External use</DialogTitle>
                        <DialogDescription>
                            Deduct stock used outside a sale — staff drinks,
                            breakage, or house use.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label>Staff member</Label>
                            <Select
                                value={externalUserId}
                                onValueChange={setExternalUserId}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select staff" />
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
                            <Label>Product</Label>
                            <Select
                                value={externalProductId}
                                onValueChange={setExternalProductId}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select product" />
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
                            <Label>Quantity</Label>
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
                            <Label>Note (optional)</Label>
                            <Input
                                value={externalNote}
                                onChange={(event) =>
                                    setExternalNote(event.target.value)
                                }
                                placeholder="Staff drink, spill, etc."
                            />
                        </div>
                        {externalError && (
                            <p className="text-sm text-destructive">
                                {externalError}
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
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={submitExternalUse}
                            disabled={externalSaving}
                        >
                            {externalSaving ? 'Saving…' : 'Record use'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
