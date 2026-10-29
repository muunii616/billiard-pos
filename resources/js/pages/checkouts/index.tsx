import { Head, Link, router, usePage } from '@inertiajs/react';
import { Pencil, Wallet } from 'lucide-react';
import { useState, useEffect } from 'react';
import { EmptyState } from '@/components/empty-state';
import InvoiceDialog from '@/components/invoice-dialog';
import type { InvoiceReceipt } from '@/components/invoice-dialog';
import { PageHeader } from '@/components/page-header';
import PaymentForm from '@/components/payment-form';
import { TimeBlockPicker } from '@/components/time-block-picker';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { categoryBadgeClass, normalizeCategory } from '@/lib/categories';
import {
    formatBusinessDate,
    formatCountdown as formatPlayedClock,
    formatDateTime,
    groupTabsByDate,
} from '@/lib/dates';
import { jsonHeaders } from '@/lib/http';
import { useCategoryLabel, useI18n } from '@/lib/i18n';
import { inertiaPost } from '@/lib/inertia-action';
import {
    buildTabBalancePayments,
    formatMoney,
    paymentPreview,
    roundMoney,
} from '@/lib/payments';
import { posCartRowClass, posPanelClass, posTileClass } from '@/lib/pos-ui';
import { countsFromStored, DEFAULT_TIME_BLOCKS } from '@/lib/time-blocks';
import type { TimeBlock, TimeBlockCounts } from '@/lib/time-blocks';
import receiptsRoutes from '@/routes/receipts';

type TabItemLine = {
    id: number;
    created_at?: string;
    product_id: number | null;
    product_name: string | null;
    product_category?: string | null;
    quantity: number;
    unit_price: number;
    total_price: number;
};

type TableSessionLine = {
    id: number;
    table_name: string;
    started_at: string | null;
    ended_at: string | null;
    played_seconds: number;
    time_total: number;
    time_blocks?: Record<string, number>;
    products_total: number;
    items?: {
        id: number;
        product_name: string | null;
        quantity: number;
        unit_price: number;
        total_price: number;
    }[];
};

type CheckoutRow = {
    id: number;
    status: string;
    created_at: string;
    latest_tab_at?: string | null;
    table_names: string[];
    time_total: number;
    items_total: number;
    grand_total: number;
    amount_paid?: number;
    remaining?: number;
    tab_items?: TabItemLine[];
    table_sessions: TableSessionLine[];
};

type Product = {
    id: number;
    name: string;
    price: string;
    category: string;
    stock_quantity: number;
    low_stock_threshold: number;
    is_deal?: boolean;
    deal_active?: boolean;
    deal_label?: string | null;
    deal_buy_qty?: number | null;
};

type CheckoutSummary = {
    checkout_id: number;
    table_name: string;
    table_sessions: TableSessionLine[];
    time_total: number;
    items_total: number;
    grand_total: number;
    amount_paid?: number;
    remaining?: number;
    tab_items?: TabItemLine[];
    time_blocks_catalog?: TimeBlock[];
};

type Props = {
    checkouts: CheckoutRow[];
    products: Product[];
    receipt?: InvoiceReceipt | null;
    isAdmin?: boolean;
    timeBlocks?: TimeBlock[];
};

export default function CheckoutsIndex({
    checkouts,
    products,
    receipt: receiptProp,
    timeBlocks: timeBlocksProp,
}: Props) {
    const { t, locale } = useI18n();
    const categoryLabel = useCategoryLabel();
    const catalogBlocks =
        timeBlocksProp && timeBlocksProp.length > 0
            ? timeBlocksProp
            : DEFAULT_TIME_BLOCKS;
    const [payModalOpen, setPayModalOpen] = useState(false);
    const [payCheckoutId, setPayCheckoutId] = useState<number | null>(null);
    const [summary, setSummary] = useState<CheckoutSummary | null>(null);
    const [cash, setCash] = useState('');
    const [card, setCard] = useState('');
    const [transfer, setTransfer] = useState('');
    const [customerEmail, setCustomerEmail] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [payError, setPayError] = useState<string | null>(null);
    const [invoiceReceipt, setInvoiceReceipt] = useState<InvoiceReceipt | null>(
        null,
    );
    const [emailSending, setEmailSending] = useState(false);
    const [emailMessage, setEmailMessage] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [mergeConfirmOpen, setMergeConfirmOpen] = useState(false);
    const [addItemModalOpen, setAddItemModalOpen] = useState(false);
    const [addItemCheckoutId, setAddItemCheckoutId] = useState<number | null>(
        null,
    );
    const [addItemSearch, setAddItemSearch] = useState('');
    const [addItemCategory, setAddItemCategory] = useState<string>('all');
    const [addItemCart, setAddItemCart] = useState<
        {
            productId: number;
            name: string;
            price: number;
            quantity: number;
            category: string;
        }[]
    >([]);
    const [addItemSubmitting, setAddItemSubmitting] = useState(false);
    const [editTabItemsOpen, setEditTabItemsOpen] = useState(false);
    const [editTabItemsCheckoutId, setEditTabItemsCheckoutId] = useState<
        number | null
    >(null);
    const [editTabItemsDraft, setEditTabItemsDraft] = useState<TabItemLine[]>(
        [],
    );
    const [editTabItemsRemovedIds, setEditTabItemsRemovedIds] = useState<
        number[]
    >([]);
    const [editTabItemsLoading, setEditTabItemsLoading] = useState(false);
    const [editTabItemsSaving, setEditTabItemsSaving] = useState(false);
    const [editTabItemsError, setEditTabItemsError] = useState<string | null>(
        null,
    );
    const [editTabTimeDraft, setEditTabTimeDraft] = useState<
        {
            id: number;
            table_name: string;
            played_seconds: number;
            counts: TimeBlockCounts;
        }[]
    >([]);
    const [viewTabDetailsOpen, setViewTabDetailsOpen] = useState(false);
    const [viewTabDetailsRow, setViewTabDetailsRow] =
        useState<CheckoutRow | null>(null);
    const money = formatMoney;
    const { auth, isAdmin } = usePage().props as {
        auth?: { user?: { role?: string } };
        isAdmin?: boolean;
    };
    const adminEnabled = !!(isAdmin || auth?.user?.role === 'admin');
    const [showAll, setShowAll] = useState(false);
    const [deleteTabConfirmOpen, setDeleteTabConfirmOpen] = useState(false);
    const [deleteTabId, setDeleteTabId] = useState<number | null>(null);
    const [deleteTabReason, setDeleteTabReason] = useState('');
    const [deleteTabRestock, setDeleteTabRestock] = useState(true);
    const [deleteTabError, setDeleteTabError] = useState<string | null>(null);
    const [deleteTabSubmitting, setDeleteTabSubmitting] = useState(false);
    const [reopenTabConfirmOpen, setReopenTabConfirmOpen] = useState(false);
    const [reopenTabId, setReopenTabId] = useState<number | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    useEffect(() => {
        if (!payModalOpen || !summary) {
            return;
        }

        const remaining = roundMoney(
            Number(summary.remaining ?? summary.grand_total),
        );
        const d = roundMoney(parseFloat(card) || 0);
        const t = roundMoney(parseFloat(transfer) || 0);

        if (d + t <= remaining + 0.01) {
            return;
        }

        const newT = Math.min(t, remaining);
        const newD = Math.min(d, Math.max(0, remaining - newT));
        setCard(newD === 0 ? '' : String(newD));
        setTransfer(newT === 0 ? '' : String(newT));
    }, [card, payModalOpen, summary, transfer]);

    const payRemaining = roundMoney(
        Number(summary?.remaining ?? summary?.grand_total ?? 0),
    );
    const payPreview = paymentPreview(
        parseFloat(cash) || 0,
        parseFloat(card) || 0,
        parseFloat(transfer) || 0,
        payRemaining,
    );
    const payCloses =
        payPreview.totalPaid > 0.01 &&
        payPreview.totalPaid + 0.01 >= payRemaining;
    const payApplied = payCloses
        ? payRemaining
        : roundMoney(payPreview.totalPaid);

    const pageErrors =
        (usePage().props as { errors?: Record<string, string> }).errors ?? {};

    useEffect(() => {
        if (receiptProp) {
            setInvoiceReceipt(receiptProp);
            setPayModalOpen(false);
            setSubmitting(false);
        }
    }, [receiptProp]);

    useEffect(() => {
        if (!adminEnabled) {
            return;
        }

        const params = new URLSearchParams(window.location.search);
        setShowAll(params.get('all') === '1');
    }, [adminEnabled]);

    const toggleShowAll = () => {
        const next = !showAll;
        setShowAll(next);
        router.get('/checkouts', next ? { all: 1 } : {}, {
            preserveScroll: true,
            replace: true,
        });
    };

    useEffect(() => {
        if (payModalOpen && pageErrors.payments) {
            setPayError(pageErrors.payments);
        }
    }, [payModalOpen, pageErrors.payments]);

    useEffect(() => {
        if (!actionError) {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            setActionError(null);
        }, 3500);

        return () => window.clearTimeout(timeoutId);
    }, [actionError]);

    useEffect(() => {
        router.get('/checkouts', showAll ? { all: 1 } : {}, {
            preserveState: true,
            preserveScroll: true,
            replace: true,
            only: ['checkouts'],
        });
    }, [showAll]);

    const openPayModal = (id: number) => {
        setPayCheckoutId(id);
        setPayError(null);
        setCash('');
        setCard('');
        setTransfer('');
        setCustomerEmail('');
        setPayModalOpen(true);
        fetch(`/checkouts/${id}/summary`)
            .then((res) => {
                if (!res.ok) {
                    throw new Error('Could not load summary');
                }

                return res.json();
            })
            .then((data: CheckoutSummary) => setSummary(data))
            .catch(() => setPayError('Failed to load summary.'))
            .finally(() => {});
    };

    const closePayModal = () => {
        setPayModalOpen(false);
        setPayCheckoutId(null);
        setSummary(null);
    };

    const openEditTabItems = (checkoutId: number) => {
        setEditTabItemsCheckoutId(checkoutId);
        setEditTabItemsOpen(true);
        setEditTabItemsError(null);
        setEditTabItemsRemovedIds([]);
        setEditTabItemsLoading(true);
        setEditTabItemsDraft([]);
        setEditTabTimeDraft([]);
        fetch(`/checkouts/${checkoutId}/summary`)
            .then((res) => {
                if (!res.ok) {
                    throw new Error('load');
                }

                return res.json();
            })
            .then((data: CheckoutSummary) => {
                const blocks =
                    data.time_blocks_catalog &&
                    data.time_blocks_catalog.length > 0
                        ? data.time_blocks_catalog
                        : catalogBlocks;
                setEditTabItemsDraft(data.tab_items ?? []);
                setEditTabTimeDraft(
                    (data.table_sessions ?? []).map((session) => ({
                        id: session.id,
                        table_name: session.table_name,
                        played_seconds: session.played_seconds,
                        counts: countsFromStored(session.time_blocks, blocks),
                    })),
                );
            })
            .catch(() => setEditTabItemsError('Failed to load tab items.'))
            .finally(() => setEditTabItemsLoading(false));
    };

    const closeEditTabItems = () => {
        setEditTabItemsOpen(false);
        setEditTabItemsCheckoutId(null);
        setEditTabItemsDraft([]);
        setEditTabItemsRemovedIds([]);
        setEditTabTimeDraft([]);
        setEditTabItemsError(null);
    };

    const saveEditTabItems = async () => {
        if (editTabItemsCheckoutId == null) {
            return;
        }

        setEditTabItemsSaving(true);
        setEditTabItemsError(null);
        const items = [
            ...editTabItemsDraft.map((i) => ({
                id: i.id,
                quantity: Math.max(0, Math.floor(Number(i.quantity) || 0)),
            })),
            ...editTabItemsRemovedIds.map((id) => ({ id, quantity: 0 })),
        ];
        const time_sessions = editTabTimeDraft.map((session) => ({
            id: session.id,
            time_blocks: session.counts,
        }));

        try {
            const res = await fetch(
                `/admin/checkouts/${editTabItemsCheckoutId}/items`,
                {
                    method: 'PUT',
                    headers: jsonHeaders(),
                    credentials: 'same-origin',
                    body: JSON.stringify({ items, time_sessions }),
                },
            );
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                setEditTabItemsError(
                    typeof data.message === 'string'
                        ? data.message
                        : typeof data.errors?.items?.[0] === 'string'
                          ? data.errors.items[0]
                          : typeof data.errors?.time_sessions?.[0] === 'string'
                            ? data.errors.time_sessions[0]
                            : 'Could not save items.',
                );

                return;
            }

            closeEditTabItems();
            router.reload();
        } finally {
            setEditTabItemsSaving(false);
        }
    };

    const removeEditTabLine = (id: number) => {
        setEditTabItemsDraft((d) => d.filter((x) => x.id !== id));
        setEditTabItemsRemovedIds((r) => (r.includes(id) ? r : [...r, id]));
    };

    const updateEditTabQty = (id: number, qty: number) => {
        const q = Math.max(1, Math.floor(qty));
        setEditTabItemsDraft((d) =>
            d.map((row) =>
                row.id === id
                    ? {
                          ...row,
                          quantity: q,
                          total_price: roundMoney(q * row.unit_price),
                      }
                    : row,
            ),
        );
    };

    const handlePayComplete = async () => {
        if (!summary || payCheckoutId == null || submitting) {
            return;
        }

        const remaining = roundMoney(
            Number(summary.remaining ?? summary.grand_total) || 0,
        );
        const settlement = buildTabBalancePayments({
            remaining,
            cash: parseFloat(cash) || 0,
            card: parseFloat(card) || 0,
            transfer: parseFloat(transfer) || 0,
            money,
        });

        if (settlement.error) {
            setPayError(settlement.error);

            return;
        }

        setPayError(null);
        const payload: {
            payments: { method: string; amount: number }[];
            customer_email?: string;
        } = {
            payments: settlement.payments,
        };

        if (customerEmail.trim()) {
            payload.customer_email = customerEmail.trim();
        }

        setSubmitting(true);
        closePayModal();
        const result = await inertiaPost(
            `/checkouts/${payCheckoutId}/complete`,
            payload,
        );
        setSubmitting(false);

        if (result !== 'success') {
            if (result === 'error') {
                setActionError('Payment failed. Please try again.');
            }

            router.reload();
        }
    };

    const handleEmailInvoice = async () => {
        if (!invoiceReceipt) {
            return;
        }

        setEmailMessage(null);
        setEmailSending(true);

        try {
            const url = receiptsRoutes.sendEmail.url({
                receipt: invoiceReceipt.id,
            });
            const headers = jsonHeaders();

            const res = await fetch(url, {
                method: 'POST',
                headers,
                body: '{}',
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                setEmailMessage(data.message || 'Failed to send email.');

                return;
            }

            setEmailMessage(data.message || 'Receipt sent.');
        } finally {
            setEmailSending(false);
        }
    };

    const toggleSelected = (id: number) => {
        setSelectedIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
        );
    };

    const handleMergeTabs = () => {
        if (selectedIds.length < 2) {
            setActionError('Select at least two tabs to merge.');

            return;
        }

        setMergeConfirmOpen(true);
    };

    const confirmMergeTabs = () => {
        if (selectedIds.length < 2) {
            setMergeConfirmOpen(false);

            return;
        }

        const targetId = selectedIds[0];
        const sourceIds = selectedIds.slice(1);
        router.post(
            '/checkouts/merge',
            { target_id: targetId, source_ids: sourceIds },
            {
                onSuccess: () => {
                    setSelectedIds([]);
                    setActionError(null);
                },
                onError: (errors) => {
                    const message =
                        typeof errors.merge === 'string'
                            ? errors.merge
                            : 'Could not merge tabs.';
                    setActionError(message);
                },
                onFinish: () => setMergeConfirmOpen(false),
            },
        );
    };

    const openAddItemModal = (checkoutId: number) => {
        if (products.length === 0) {
            setActionError('No products available.');

            return;
        }

        setAddItemCheckoutId(checkoutId);
        setAddItemSearch('');
        setAddItemCategory('all');
        setAddItemCart([]);
        setAddItemModalOpen(true);
    };

    const categories = Array.from(
        new Set(products.map((p) => normalizeCategory(p.category))),
    ).sort();

    const filteredProducts = products.filter((p) => {
        const cat = normalizeCategory(p.category);
        const matchesSearch = (p.name + ' ' + cat)
            .toLowerCase()
            .includes(addItemSearch.toLowerCase());
        const matchesCategory =
            addItemCategory === 'all' || cat === addItemCategory;

        return matchesSearch && matchesCategory;
    });

    const addProductToCart = (product: Product) => {
        if (product.is_deal && product.deal_active === false) {
            setActionError('This Special deal is not active today.');

            return;
        }

        const unitPrice = product.is_deal
            ? Number(product.price) * Number(product.deal_buy_qty ?? 1)
            : Number(product.price);

        setAddItemCart((prev) => {
            const existing = prev.find((i) => i.productId === product.id);

            if (existing) {
                return prev.map((i) =>
                    i.productId === product.id
                        ? { ...i, quantity: i.quantity + 1 }
                        : i,
                );
            }

            return [
                ...prev,
                {
                    productId: product.id,
                    name: product.name,
                    price: unitPrice,
                    quantity: 1,
                    category: product.category,
                },
            ];
        });
    };

    const updateCartQuantity = (productId: number, quantity: number) => {
        setAddItemCart((prev) =>
            prev.map((i) =>
                i.productId === productId
                    ? { ...i, quantity: Math.max(0, Math.floor(quantity)) }
                    : i,
            ),
        );
    };

    const cartTotal = addItemCart.reduce(
        (sum, item) => sum + item.price * Math.max(0, item.quantity),
        0,
    );

    const handleConfirmAddItem = async () => {
        if (
            !addItemCheckoutId ||
            addItemCart.length === 0 ||
            addItemSubmitting
        ) {
            return;
        }

        const items = addItemCart
            .filter((item) => item.quantity > 0)
            .map((item) => ({
                product_id: item.productId,
                quantity: item.quantity,
            }));

        if (items.length === 0) {
            return;
        }

        const checkoutId = addItemCheckoutId;
        setAddItemSubmitting(true);
        setAddItemModalOpen(false);
        setAddItemCheckoutId(null);
        setAddItemCart([]);

        const result = await inertiaPost(
            `/checkouts/${checkoutId}/items/bulk`,
            {
                items,
            },
        );
        setAddItemSubmitting(false);

        if (result !== 'success') {
            if (result === 'error') {
                setActionError('Failed to add items. Refreshing…');
            }

            router.reload();
        }
    };

    const confirmDeleteTab = async () => {
        if (deleteTabId == null) {
            return;
        }

        if (!adminEnabled && deleteTabReason.trim() === '') {
            setDeleteTabError(
                'Employees must provide a reason to delete a tab.',
            );

            return;
        }

        setDeleteTabSubmitting(true);
        setDeleteTabError(null);

        try {
            const res = await fetch(`/admin/checkouts/${deleteTabId}/void`, {
                method: 'POST',
                headers: jsonHeaders(),
                credentials: 'same-origin',
                body: JSON.stringify({
                    reason: deleteTabReason.trim() || null,
                    restock: deleteTabRestock,
                }),
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                const reasonError = Array.isArray(data?.errors?.reason)
                    ? data.errors.reason[0]
                    : null;
                setDeleteTabError(
                    reasonError || data.message || 'Failed to delete tab.',
                );

                return;
            }

            setDeleteTabConfirmOpen(false);
            setDeleteTabId(null);
            setDeleteTabReason('');
            setDeleteTabRestock(true);
            router.get('/checkouts', showAll ? { all: 1 } : {}, {
                preserveScroll: true,
                replace: true,
            });
        } catch {
            setDeleteTabError('Failed to delete tab.');
        } finally {
            setDeleteTabSubmitting(false);
        }
    };

    const confirmReopenTab = async () => {
        if (reopenTabId == null) {
            return;
        }

        const res = await fetch(`/admin/checkouts/${reopenTabId}/reopen`, {
            method: 'POST',
            headers: jsonHeaders(),
            credentials: 'same-origin',
            body: '{}',
        });
        const data = await res.json().catch(() => ({}));
        setReopenTabConfirmOpen(false);
        setReopenTabId(null);

        if (!res.ok) {
            setActionError(data.message || 'Failed to reopen tab.');

            return;
        }

        router.get('/checkouts', showAll ? { all: 1 } : {}, {
            preserveScroll: true,
            replace: true,
        });
    };

    return (
        <AppLayout breadcrumbs={[]}>
            <Head title={t('Open tab')} />
            <div className="flex flex-1 flex-col gap-4 rounded-xl p-4">
                {actionError && (
                    <div className="pointer-events-none fixed top-6 left-1/2 z-50 w-full max-w-md -translate-x-1/2 px-2 sm:px-0">
                        <Alert variant="destructive">
                            <AlertTitle>{t('Action failed')}</AlertTitle>
                            <AlertDescription>
                                {t(actionError)}
                            </AlertDescription>
                        </Alert>
                    </div>
                )}
                <PageHeader title={t('Open tab')}>
                    <div className="flex items-center gap-2">
                        {adminEnabled && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={toggleShowAll}
                            >
                                {showAll ? t('Show open only') : t('Show all')}
                            </Button>
                        )}
                        {checkouts.length > 1 && (
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={selectedIds.length < 2}
                                onClick={handleMergeTabs}
                            >
                                {t('Merge tabs')}
                            </Button>
                        )}
                    </div>
                </PageHeader>

                <AlertDialog
                    open={mergeConfirmOpen}
                    onOpenChange={setMergeConfirmOpen}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                {t('Merge selected tabs?')}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                {selectedIds.length >= 2
                                    ? t(
                                          'Tab #{id} will be the target. {count} tab(s) will be merged into it. Partial payments move with the merge. This action cannot be undone.',
                                          {
                                              id: selectedIds[0],
                                              count: selectedIds.length - 1,
                                          },
                                      )
                                    : t('Select at least two tabs to merge.')}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
                            <AlertDialogAction onClick={confirmMergeTabs}>
                                {t('Confirm merge')}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                <AlertDialog
                    open={deleteTabConfirmOpen}
                    onOpenChange={(open) => {
                        setDeleteTabConfirmOpen(open);

                        if (!open) {
                            setDeleteTabId(null);
                            setDeleteTabReason('');
                            setDeleteTabRestock(true);
                            setDeleteTabError(null);
                            setDeleteTabSubmitting(false);
                        }
                    }}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                {t('Delete tab?')}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                {deleteTabId != null
                                    ? t(
                                          'Tab #{id} will be closed without payment. This cannot be undone.',
                                          { id: deleteTabId },
                                      )
                                    : ''}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <div className="space-y-3">
                            <div className="space-y-2">
                                <Label htmlFor="delete-tab-reason">
                                    {t('Reason')}{' '}
                                    {adminEnabled
                                        ? t('(optional for admin)')
                                        : t('(required)')}
                                </Label>
                                <textarea
                                    id="delete-tab-reason"
                                    className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    value={deleteTabReason}
                                    onChange={(event) => {
                                        setDeleteTabReason(event.target.value);
                                        setDeleteTabError(null);
                                    }}
                                    placeholder={
                                        adminEnabled
                                            ? t('Optional note for the record')
                                            : t(
                                                  'Explain why this tab is being deleted',
                                              )
                                    }
                                />
                            </div>
                            <label className="flex items-start gap-3 rounded-md border border-border/70 bg-muted/30 p-3 text-sm">
                                <Checkbox
                                    checked={deleteTabRestock}
                                    onCheckedChange={(checked) =>
                                        setDeleteTabRestock(checked === true)
                                    }
                                    className="mt-0.5"
                                />
                                <span>
                                    <span className="font-medium">
                                        {t('Return products to stock')}
                                    </span>
                                    <span className="mt-0.5 block text-muted-foreground">
                                        {t(
                                            'Turn off if items were already given out or used.',
                                        )}
                                    </span>
                                </span>
                            </label>
                        </div>
                        {deleteTabError && (
                            <p className="text-sm text-destructive">
                                {t(deleteTabError)}
                            </p>
                        )}
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={deleteTabSubmitting}>
                                {t('Cancel')}
                            </AlertDialogCancel>
                            <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                disabled={deleteTabSubmitting}
                                onClick={async (e) => {
                                    e.preventDefault();
                                    await confirmDeleteTab();
                                }}
                            >
                                {deleteTabSubmitting
                                    ? t('Deleting…')
                                    : t('Delete tab')}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                <AlertDialog
                    open={reopenTabConfirmOpen}
                    onOpenChange={(open) => {
                        setReopenTabConfirmOpen(open);

                        if (!open) {
                            setReopenTabId(null);
                        }
                    }}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                {t('Reopen tab?')}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                {reopenTabId != null
                                    ? t(
                                          'Tab #{id} will reopen for correction. Any previous receipt will be voided; payment will be required again. Stock will be reserved for voided tabs.',
                                          { id: reopenTabId },
                                      )
                                    : ''}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
                            <AlertDialogAction onClick={confirmReopenTab}>
                                {t('Reopen')}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {checkouts.length === 0 ? (
                    <EmptyState
                        icon={Wallet}
                        title={t('No open tabs')}
                        description={t(
                            'End a table session and move it here, or send products from the Products page.',
                        )}
                        action={
                            <Button asChild>
                                <Link href="/tables">{t('Go to Tables')}</Link>
                            </Button>
                        }
                    />
                ) : (
                    <div className="space-y-6">
                        {groupTabsByDate(checkouts).map((group) => (
                            <section
                                key={group.date}
                                aria-labelledby={`tabs-date-${group.date}`}
                            >
                                <div className="mb-3 flex items-center gap-3">
                                    <h2
                                        id={`tabs-date-${group.date}`}
                                        className="text-sm font-semibold"
                                    >
                                        {formatBusinessDate(group.date, locale)}
                                    </h2>
                                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                        {t('{count} tabs', {
                                            count: group.tabs.length,
                                        })}
                                    </span>
                                    <div className="h-px flex-1 bg-border" />
                                </div>
                                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                    {group.tabs.map((row) => (
                                        <div
                                            key={row.id}
                                            className="flex flex-col justify-between rounded-xl border border-sidebar-border/70 bg-background p-4 shadow-sm dark:border-sidebar-border"
                                        >
                                            <div>
                                                <div className="flex items-center justify-between gap-2 text-sm font-medium text-muted-foreground">
                                                    <div className="flex items-center gap-2">
                                                        <Wallet className="h-4 w-4" />
                                                        {t('Tab #{id}', {
                                                            id: row.id,
                                                        })}
                                                    </div>
                                                    <input
                                                        type="checkbox"
                                                        className="h-4 w-4 rounded border-sidebar-border/70 bg-background"
                                                        checked={selectedIds.includes(
                                                            row.id,
                                                        )}
                                                        onChange={() =>
                                                            toggleSelected(
                                                                row.id,
                                                            )
                                                        }
                                                    />
                                                </div>
                                                <p className="mt-1 text-sm text-muted-foreground">
                                                    {row.table_names.length
                                                        ? row.table_names.join(
                                                              ', ',
                                                          )
                                                        : '—'}
                                                </p>
                                                {row.table_sessions.map(
                                                    (tableSession) => (
                                                        <div
                                                            key={`${row.id}-${tableSession.id}`}
                                                            className="mt-2 rounded-md bg-muted/40 p-2 text-xs"
                                                        >
                                                            <div className="font-medium">
                                                                {
                                                                    tableSession.table_name
                                                                }
                                                            </div>
                                                            <div className="text-muted-foreground">
                                                                {t(
                                                                    'Started {time}',
                                                                    {
                                                                        time: tableSession.started_at
                                                                            ? formatDateTime(
                                                                                  tableSession.started_at,
                                                                              )
                                                                            : '—',
                                                                    },
                                                                )}
                                                            </div>
                                                            <div className="text-muted-foreground">
                                                                {t(
                                                                    'Ended {time}',
                                                                    {
                                                                        time: tableSession.ended_at
                                                                            ? formatDateTime(
                                                                                  tableSession.ended_at,
                                                                              )
                                                                            : '—',
                                                                    },
                                                                )}
                                                            </div>
                                                            <div className="mt-1">
                                                                {t(
                                                                    'Table: {time} · Products: {products}',
                                                                    {
                                                                        time: money(
                                                                            tableSession.time_total,
                                                                        ),
                                                                        products:
                                                                            money(
                                                                                tableSession.products_total,
                                                                            ),
                                                                    },
                                                                )}
                                                            </div>
                                                            {(tableSession.items
                                                                ?.length ?? 0) >
                                                                0 && (
                                                                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                                                                    {tableSession.items?.map(
                                                                        (
                                                                            item,
                                                                        ) => (
                                                                            <li
                                                                                key={
                                                                                    item.id
                                                                                }
                                                                            >
                                                                                {
                                                                                    item.quantity
                                                                                }

                                                                                ×{' '}
                                                                                {item.product_name ??
                                                                                    t(
                                                                                        'Item',
                                                                                    )}{' '}
                                                                                (
                                                                                {money(
                                                                                    item.total_price,
                                                                                )}

                                                                                )
                                                                            </li>
                                                                        ),
                                                                    )}
                                                                </ul>
                                                            )}
                                                        </div>
                                                    ),
                                                )}
                                                {(row.tab_items?.length ?? 0) >
                                                    0 && (
                                                    <div className="mt-2 rounded-md bg-muted/40 p-2 text-xs">
                                                        <div className="font-medium">
                                                            {t('Tab products')}
                                                        </div>
                                                        <ul className="mt-1 space-y-0.5 text-muted-foreground">
                                                            {row.tab_items?.map(
                                                                (item) => (
                                                                    <li
                                                                        key={
                                                                            item.id
                                                                        }
                                                                    >
                                                                        {
                                                                            item.quantity
                                                                        }
                                                                        ×{' '}
                                                                        {item.product_name ??
                                                                            t(
                                                                                'Item',
                                                                            )}{' '}
                                                                        (
                                                                        {money(
                                                                            item.total_price,
                                                                        )}
                                                                        )
                                                                        {item.created_at && (
                                                                            <span className="ml-2 text-muted-foreground">
                                                                                {formatDateTime(
                                                                                    item.created_at,
                                                                                )}
                                                                            </span>
                                                                        )}
                                                                    </li>
                                                                ),
                                                            )}
                                                        </ul>
                                                    </div>
                                                )}
                                                <div className="mt-3 grid grid-cols-2 gap-1 text-sm">
                                                    <span className="text-muted-foreground">
                                                        {t('Time charge:')}
                                                    </span>
                                                    <span>
                                                        {money(
                                                            Number(
                                                                row.time_total,
                                                            ),
                                                        )}
                                                    </span>
                                                    <span className="text-muted-foreground">
                                                        {t('Items charge:')}
                                                    </span>
                                                    <span>
                                                        {money(
                                                            Number(
                                                                row.items_total,
                                                            ),
                                                        )}
                                                    </span>
                                                    <span className="font-medium text-muted-foreground">
                                                        {t('Total:')}
                                                    </span>
                                                    <span className="font-semibold">
                                                        {money(
                                                            Number(
                                                                row.grand_total,
                                                            ),
                                                        )}
                                                    </span>
                                                    {Number(
                                                        row.amount_paid ?? 0,
                                                    ) > 0.01 && (
                                                        <>
                                                            <span className="text-muted-foreground">
                                                                {t(
                                                                    'Paid so far:',
                                                                )}
                                                            </span>
                                                            <span className="text-emerald-700 dark:text-emerald-400">
                                                                {money(
                                                                    Number(
                                                                        row.amount_paid ??
                                                                            0,
                                                                    ),
                                                                )}
                                                            </span>
                                                            <span className="font-medium text-muted-foreground">
                                                                {t(
                                                                    'Remaining:',
                                                                )}
                                                            </span>
                                                            <span className="font-semibold">
                                                                {money(
                                                                    Number(
                                                                        row.remaining ??
                                                                            row.grand_total,
                                                                    ),
                                                                )}
                                                            </span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="mt-4 flex flex-wrap gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => {
                                                        setViewTabDetailsRow(
                                                            row,
                                                        );
                                                        setViewTabDetailsOpen(
                                                            true,
                                                        );
                                                    }}
                                                >
                                                    {t('View details')}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() =>
                                                        openAddItemModal(row.id)
                                                    }
                                                >
                                                    {t('Add item')}
                                                </Button>
                                                {adminEnabled &&
                                                    row.status === 'open' && (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="gap-1"
                                                            onClick={() =>
                                                                openEditTabItems(
                                                                    row.id,
                                                                )
                                                            }
                                                        >
                                                            <Pencil className="h-3.5 w-3.5" />
                                                            {t('Edit items')}
                                                        </Button>
                                                    )}
                                                <Button
                                                    size="sm"
                                                    onClick={() =>
                                                        openPayModal(row.id)
                                                    }
                                                >
                                                    {Number(
                                                        row.amount_paid ?? 0,
                                                    ) > 0.01
                                                        ? t('Pay remaining')
                                                        : t('Pay now')}
                                                </Button>
                                                {adminEnabled &&
                                                    row.status !== 'open' && (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => {
                                                                setReopenTabId(
                                                                    row.id,
                                                                );
                                                                setReopenTabConfirmOpen(
                                                                    true,
                                                                );
                                                            }}
                                                        >
                                                            {t('Reopen')}
                                                        </Button>
                                                    )}
                                                {row.status === 'open' && (
                                                    <Button
                                                        size="sm"
                                                        variant="destructive"
                                                        onClick={() => {
                                                            setDeleteTabId(
                                                                row.id,
                                                            );
                                                            setDeleteTabReason(
                                                                '',
                                                            );
                                                            setDeleteTabRestock(
                                                                true,
                                                            );
                                                            setDeleteTabError(
                                                                null,
                                                            );
                                                            setDeleteTabConfirmOpen(
                                                                true,
                                                            );
                                                        }}
                                                    >
                                                        {t('Delete')}
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                )}

                <Dialog
                    open={addItemModalOpen}
                    onOpenChange={(open) => !open && setAddItemModalOpen(false)}
                >
                    <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-5xl">
                        <DialogHeader>
                            <DialogTitle>{t('Add Items')}</DialogTitle>
                            <DialogDescription>
                                {t(
                                    'Search and add multiple products to this open tab.',
                                )}
                            </DialogDescription>
                        </DialogHeader>

                        <div className="mt-2 rounded-xl border border-sidebar-border/70 bg-background/95 p-3 shadow-sm sm:p-4 dark:border-sidebar-border">
                            <div className="mb-4">
                                <Input
                                    placeholder={t('Search products...')}
                                    value={addItemSearch}
                                    onChange={(e) =>
                                        setAddItemSearch(e.target.value)
                                    }
                                    className="h-10"
                                />
                            </div>

                            <div className="flex flex-col gap-3 overflow-y-auto lg:h-[420px] lg:flex-row lg:gap-4 lg:overflow-hidden">
                                <div className="flex w-full flex-shrink-0 flex-col lg:w-52">
                                    <Label className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                        {t('Categories')}
                                    </Label>
                                    <div
                                        className={`max-h-40 space-y-1 overflow-y-auto ${posPanelClass} p-2 lg:max-h-none lg:flex-1`}
                                    >
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={
                                                addItemCategory === 'all'
                                                    ? 'default'
                                                    : 'outline'
                                            }
                                            className="w-full justify-start"
                                            onClick={() =>
                                                setAddItemCategory('all')
                                            }
                                        >
                                            {t('All Items')}
                                        </Button>
                                        {categories.map((cat) => (
                                            <Button
                                                key={cat}
                                                type="button"
                                                size="sm"
                                                variant={
                                                    addItemCategory === cat
                                                        ? 'default'
                                                        : 'outline'
                                                }
                                                className="w-full justify-start"
                                                onClick={() =>
                                                    setAddItemCategory(cat)
                                                }
                                            >
                                                {categoryLabel(cat)}
                                            </Button>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex min-w-0 flex-1 flex-col">
                                    <Label className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                        {t('Items')}
                                    </Label>
                                    <div
                                        className={`min-h-0 flex-1 overflow-hidden ${posPanelClass} p-3`}
                                    >
                                        <div className="grid max-h-[34vh] grid-cols-1 content-start gap-3 overflow-y-auto text-sm sm:grid-cols-2 lg:h-full lg:max-h-none">
                                            {filteredProducts.length === 0 && (
                                                <div className="col-span-2 px-2 py-1 text-muted-foreground">
                                                    {t(
                                                        'No products match your search.',
                                                    )}
                                                </div>
                                            )}
                                            {filteredProducts.map((p) => {
                                                const dealOff =
                                                    !!p.is_deal &&
                                                    p.deal_active === false;
                                                const displayPrice = p.is_deal
                                                    ? Number(p.price) *
                                                      Number(
                                                          p.deal_buy_qty ?? 1,
                                                      )
                                                    : Number(p.price);

                                                return (
                                                    <button
                                                        key={p.id}
                                                        type="button"
                                                        disabled={dealOff}
                                                        onClick={() =>
                                                            addProductToCart(p)
                                                        }
                                                        className={`${posTileClass} h-[120px] justify-between ${dealOff ? 'opacity-50' : ''}`}
                                                    >
                                                        <div className="mb-1 flex items-start justify-between gap-2">
                                                            <div className="text-sm leading-snug font-semibold">
                                                                {p.name}
                                                            </div>
                                                            <span
                                                                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide whitespace-nowrap uppercase ${categoryBadgeClass(p.category)}`}
                                                            >
                                                                {p.deal_label
                                                                    ? `Special ${p.deal_label}`
                                                                    : normalizeCategory(
                                                                          p.category,
                                                                      )}
                                                            </span>
                                                        </div>
                                                        <div className="mt-1 text-lg font-bold text-emerald-700 tabular-nums dark:text-emerald-300">
                                                            {money(
                                                                displayPrice,
                                                            )}
                                                        </div>
                                                        <div
                                                            className={`text-xs ${p.stock_quantity <= p.low_stock_threshold ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}
                                                        >
                                                            {dealOff
                                                                ? t('Deal off')
                                                                : p.is_deal
                                                                  ? t(
                                                                        'Packages: {count}',
                                                                        {
                                                                            count: p.stock_quantity,
                                                                        },
                                                                    )
                                                                  : t(
                                                                        'Stock: {count}',
                                                                        {
                                                                            count: p.stock_quantity,
                                                                        },
                                                                    )}
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex w-full flex-shrink-0 flex-col lg:w-64">
                                    <Label className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                        Cart
                                    </Label>
                                    <div
                                        className={`min-h-0 flex-1 overflow-hidden ${posPanelClass} p-3 text-sm`}
                                    >
                                        <div className="max-h-40 space-y-2 overflow-y-auto lg:h-full lg:max-h-none">
                                            {addItemCart.length === 0 && (
                                                <div className="px-2 py-1 text-sm text-muted-foreground italic">
                                                    Cart is empty.
                                                </div>
                                            )}
                                            {addItemCart.map((item) => (
                                                <div
                                                    key={item.productId}
                                                    className={posCartRowClass}
                                                >
                                                    <div className="flex-1">
                                                        <div className="text-sm font-medium">
                                                            {item.name}
                                                        </div>
                                                        <div className="text-xs text-muted-foreground">
                                                            {item.quantity} ×{' '}
                                                            {money(item.price)}
                                                        </div>
                                                    </div>
                                                    <Input
                                                        type="number"
                                                        min={0}
                                                        className="h-8 w-16"
                                                        value={item.quantity}
                                                        onChange={(e) =>
                                                            updateCartQuantity(
                                                                item.productId,
                                                                Number(
                                                                    e.target
                                                                        .value,
                                                                ) || 0,
                                                            )
                                                        }
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="mt-3 flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">
                                            {t('Total:')}
                                        </span>
                                        <span className="font-semibold">
                                            {money(cartTotal)}
                                        </span>
                                    </div>
                                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
                                        <Button
                                            variant="outline"
                                            type="button"
                                            onClick={() =>
                                                setAddItemModalOpen(false)
                                            }
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            type="button"
                                            onClick={() =>
                                                void handleConfirmAddItem()
                                            }
                                            disabled={
                                                addItemSubmitting ||
                                                addItemCart.every(
                                                    (i) => i.quantity <= 0,
                                                )
                                            }
                                        >
                                            {addItemSubmitting
                                                ? t('Adding…')
                                                : t('Add items')}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>

                <Dialog
                    open={viewTabDetailsOpen}
                    onOpenChange={(open) => {
                        setViewTabDetailsOpen(open);

                        if (!open) {
                            setViewTabDetailsRow(null);
                        }
                    }}
                >
                    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>
                                {t('Tab details — #{id}', {
                                    id: viewTabDetailsRow?.id ?? '',
                                })}
                            </DialogTitle>
                            <DialogDescription>
                                {t('Read-only item list for this tab.')}
                                {adminEnabled
                                    ? t(
                                          ' Use Edit items to change products or time blocks.',
                                      )
                                    : t(' Only admins can edit items.')}
                            </DialogDescription>
                        </DialogHeader>
                        {viewTabDetailsRow && (
                            <div className="space-y-3 text-sm">
                                {viewTabDetailsRow.table_sessions.map(
                                    (session) => (
                                        <div
                                            key={`${viewTabDetailsRow.id}-${session.id}`}
                                            className="rounded-md border border-border/70 p-3"
                                        >
                                            <div className="font-medium">
                                                {session.table_name}
                                            </div>
                                            <div className="mt-1 text-xs text-muted-foreground">
                                                {t(
                                                    'Time {time} · Products {products}',
                                                    {
                                                        time: money(
                                                            session.time_total,
                                                        ),
                                                        products: money(
                                                            session.products_total,
                                                        ),
                                                    },
                                                )}
                                            </div>
                                            {(session.items?.length ?? 0) ===
                                            0 ? (
                                                <p className="mt-2 text-xs text-muted-foreground">
                                                    {t(
                                                        'No products from this table.',
                                                    )}
                                                </p>
                                            ) : (
                                                <ul className="mt-2 space-y-1">
                                                    {session.items?.map(
                                                        (item) => (
                                                            <li
                                                                key={item.id}
                                                                className="flex justify-between gap-3"
                                                            >
                                                                <span>
                                                                    {
                                                                        item.quantity
                                                                    }
                                                                    ×{' '}
                                                                    {item.product_name ??
                                                                        'Item'}
                                                                </span>
                                                                <span className="tabular-nums">
                                                                    {money(
                                                                        item.total_price,
                                                                    )}
                                                                </span>
                                                            </li>
                                                        ),
                                                    )}
                                                </ul>
                                            )}
                                        </div>
                                    ),
                                )}
                                <div className="rounded-md border border-border/70 p-3">
                                    <div className="font-medium">
                                        {t('Tab products')}
                                    </div>
                                    {(viewTabDetailsRow.tab_items?.length ??
                                        0) === 0 ? (
                                        <p className="mt-2 text-xs text-muted-foreground">
                                            {t('No direct tab products.')}
                                        </p>
                                    ) : (
                                        <ul className="mt-2 space-y-1">
                                            {viewTabDetailsRow.tab_items?.map(
                                                (item) => (
                                                    <li
                                                        key={item.id}
                                                        className="flex justify-between gap-3"
                                                    >
                                                        <span>
                                                            {item.quantity}×{' '}
                                                            {item.product_name ??
                                                                t('Item')}
                                                            {item.created_at && (
                                                                <span className="block text-xs text-muted-foreground">
                                                                    {formatDateTime(
                                                                        item.created_at,
                                                                    )}
                                                                </span>
                                                            )}
                                                        </span>
                                                        <span className="tabular-nums">
                                                            {money(
                                                                item.total_price,
                                                            )}
                                                        </span>
                                                    </li>
                                                ),
                                            )}
                                        </ul>
                                    )}
                                </div>
                                <div className="flex justify-between border-t pt-2 font-medium">
                                    <span>{t('Total')}</span>
                                    <span>
                                        {money(
                                            Number(
                                                viewTabDetailsRow.grand_total,
                                            ),
                                        )}
                                    </span>
                                </div>
                            </div>
                        )}
                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => setViewTabDetailsOpen(false)}
                            >
                                {t('Close')}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <Dialog
                    open={editTabItemsOpen}
                    onOpenChange={(open) => {
                        if (!open) {
                            closeEditTabItems();
                        }
                    }}
                >
                    <DialogContent className="max-h-[90vh] overflow-x-hidden overflow-y-auto sm:max-w-lg [&>*]:min-w-0">
                        <DialogHeader>
                            <DialogTitle>
                                {t('Edit tab items — #{id}', {
                                    id: editTabItemsCheckoutId ?? '',
                                })}
                            </DialogTitle>
                            <DialogDescription>
                                {t(
                                    'Adjust product quantities and table time blocks for this open tab. Use {action} to add products.',
                                    { action: t('Add item') },
                                )}
                            </DialogDescription>
                        </DialogHeader>
                        {editTabItemsLoading && (
                            <p className="text-sm text-muted-foreground">
                                {t('Loading…')}
                            </p>
                        )}
                        {!editTabItemsLoading && (
                            <div className="space-y-4">
                                {editTabTimeDraft.length > 0 && (
                                    <div className="space-y-3">
                                        <h4 className="text-sm font-medium">
                                            {t('Table time')}
                                        </h4>
                                        {editTabTimeDraft.map((session) => (
                                            <div
                                                key={session.id}
                                                className="space-y-2"
                                            >
                                                <div className="text-sm font-medium">
                                                    {session.table_name}
                                                </div>
                                                <TimeBlockPicker
                                                    blocks={catalogBlocks}
                                                    counts={session.counts}
                                                    playedLabel={formatPlayedClock(
                                                        session.played_seconds,
                                                    )}
                                                    onChange={(counts) =>
                                                        setEditTabTimeDraft(
                                                            (rows) =>
                                                                rows.map(
                                                                    (row) =>
                                                                        row.id ===
                                                                        session.id
                                                                            ? {
                                                                                  ...row,
                                                                                  counts,
                                                                              }
                                                                            : row,
                                                                ),
                                                        )
                                                    }
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div className="space-y-3">
                                    <h4 className="text-sm font-medium">
                                        {t('Products')}
                                    </h4>
                                    {editTabItemsDraft.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">
                                            {t(
                                                'No product lines on this tab yet.',
                                            )}
                                        </p>
                                    ) : (
                                        <ul className="max-h-64 space-y-3 overflow-y-auto text-sm">
                                            {editTabItemsDraft.map((line) => (
                                                <li
                                                    key={line.id}
                                                    className="flex flex-col gap-2 rounded-md border border-border/80 bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between"
                                                >
                                                    <div className="min-w-0 flex-1">
                                                        <div className="font-medium">
                                                            {line.product_name ??
                                                                t('Item')}
                                                        </div>
                                                        <div className="text-xs text-muted-foreground">
                                                            {t(
                                                                '{price} each · line {total}',
                                                                {
                                                                    price: money(
                                                                        line.unit_price,
                                                                    ),
                                                                    total: money(
                                                                        line.total_price,
                                                                    ),
                                                                },
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Label
                                                            className="sr-only"
                                                            htmlFor={`tab-qty-${line.id}`}
                                                        >
                                                            {t('Quantity')}
                                                        </Label>
                                                        <Input
                                                            id={`tab-qty-${line.id}`}
                                                            type="number"
                                                            min={1}
                                                            className="h-9 w-20"
                                                            value={
                                                                line.quantity
                                                            }
                                                            onChange={(e) =>
                                                                updateEditTabQty(
                                                                    line.id,
                                                                    Number(
                                                                        e.target
                                                                            .value,
                                                                    ) || 1,
                                                                )
                                                            }
                                                        />
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="destructive"
                                                            onClick={() =>
                                                                removeEditTabLine(
                                                                    line.id,
                                                                )
                                                            }
                                                        >
                                                            {t('Remove')}
                                                        </Button>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        )}
                        {editTabItemsError && (
                            <p className="text-sm text-destructive">
                                {t(editTabItemsError)}
                            </p>
                        )}
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={closeEditTabItems}
                                disabled={editTabItemsSaving}
                            >
                                {t('Close')}
                            </Button>
                            <Button
                                type="button"
                                onClick={saveEditTabItems}
                                disabled={
                                    editTabItemsSaving ||
                                    editTabItemsLoading ||
                                    (editTabItemsDraft.length === 0 &&
                                        editTabItemsRemovedIds.length === 0 &&
                                        editTabTimeDraft.length === 0)
                                }
                            >
                                {editTabItemsSaving
                                    ? t('Saving…')
                                    : t('Save changes')}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <Dialog
                    open={payModalOpen}
                    onOpenChange={(open) => !open && closePayModal()}
                >
                    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>
                                {t('Pay tab — {name}', {
                                    name: summary?.table_name ?? t('Open tab'),
                                })}
                            </DialogTitle>
                            <DialogDescription>
                                {t(
                                    'Enter any amount to record a partial payment, or cover the remaining balance to close the tab. Cash may exceed the remaining amount for change.',
                                )}
                            </DialogDescription>
                        </DialogHeader>
                        {summary && (
                            <>
                                <div className="grid gap-2 text-sm">
                                    {summary.table_sessions.map(
                                        (tableSession) => (
                                            <div
                                                key={
                                                    tableSession.id ??
                                                    tableSession.table_name
                                                }
                                                className="rounded-md border p-2 text-xs"
                                            >
                                                <div className="font-medium">
                                                    {tableSession.table_name}
                                                </div>
                                                <div className="text-muted-foreground">
                                                    {t(
                                                        'Started {from} · Ended {to}',
                                                        {
                                                            from: tableSession.started_at
                                                                ? formatDateTime(
                                                                      tableSession.started_at,
                                                                  )
                                                                : '—',
                                                            to: tableSession.ended_at
                                                                ? formatDateTime(
                                                                      tableSession.ended_at,
                                                                  )
                                                                : '—',
                                                        },
                                                    )}
                                                </div>
                                                <div>
                                                    {t(
                                                        'Table time: {time} · Products: {products}',
                                                        {
                                                            time: money(
                                                                tableSession.time_total,
                                                            ),
                                                            products: money(
                                                                tableSession.products_total,
                                                            ),
                                                        },
                                                    )}
                                                </div>
                                            </div>
                                        ),
                                    )}
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">
                                            {t('Time')}
                                        </span>
                                        <span>{money(summary.time_total)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">
                                            {t('Items')}
                                        </span>
                                        <span>
                                            {money(summary.items_total)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">
                                            {t('Tab total')}
                                        </span>
                                        <span>
                                            {money(summary.grand_total)}
                                        </span>
                                    </div>
                                    {Number(summary.amount_paid ?? 0) >
                                        0.01 && (
                                        <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                                            <span>{t('Paid so far')}</span>
                                            <span>
                                                {money(
                                                    Number(
                                                        summary.amount_paid ??
                                                            0,
                                                    ),
                                                )}
                                            </span>
                                        </div>
                                    )}
                                    <div className="flex justify-between font-semibold">
                                        <span>{t('Remaining')}</span>
                                        <span>{money(payRemaining)}</span>
                                    </div>
                                </div>
                                <PaymentForm
                                    total={payRemaining}
                                    totalHint={t('Remaining {amount}', {
                                        amount: money(payRemaining),
                                    })}
                                    cash={cash}
                                    card={card}
                                    transfer={transfer}
                                    email={customerEmail}
                                    onCashChange={(value) => {
                                        setCash(value);
                                        setPayError(null);
                                    }}
                                    onCardChange={(value) => {
                                        setCard(value);
                                        setPayError(null);
                                    }}
                                    onTransferChange={(value) => {
                                        setTransfer(value);
                                        setPayError(null);
                                    }}
                                    onEmailChange={setCustomerEmail}
                                />
                                {payError && (
                                    <p className="text-sm text-destructive">
                                        {t(payError)}
                                    </p>
                                )}
                                <DialogFooter className="flex-col gap-2 sm:flex-col">
                                    <Button
                                        className="h-11 w-full"
                                        onClick={handlePayComplete}
                                        disabled={
                                            submitting ||
                                            payPreview.totalPaid <= 0.01
                                        }
                                    >
                                        {submitting
                                            ? payCloses
                                                ? t('Completing…')
                                                : t('Recording…')
                                            : payCloses
                                              ? t('Close tab · {amount}', {
                                                    amount: money(payRemaining),
                                                })
                                              : payPreview.totalPaid > 0.01
                                                ? t(
                                                      'Record partial · {amount}',
                                                      {
                                                          amount: money(
                                                              payApplied,
                                                          ),
                                                      },
                                                  )
                                                : t('Enter a payment amount')}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        className="w-full"
                                        onClick={closePayModal}
                                        disabled={submitting}
                                    >
                                        Cancel
                                    </Button>
                                </DialogFooter>
                            </>
                        )}
                    </DialogContent>
                </Dialog>

                <InvoiceDialog
                    receipt={invoiceReceipt}
                    open={!!invoiceReceipt}
                    onOpenChange={(open) => !open && setInvoiceReceipt(null)}
                    money={money}
                    emailMessage={emailMessage}
                    emailSending={emailSending}
                    onEmail={handleEmailInvoice}
                    onClose={() => {
                        setInvoiceReceipt(null);
                        setEmailMessage(null);
                    }}
                />
            </div>
        </AppLayout>
    );
}
