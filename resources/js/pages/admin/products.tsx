import { Head, Link, router, useForm } from '@inertiajs/react';
import {
    CheckCircle2Icon,
    CreditCard,
    LayoutGrid,
    PackageMinus,
    Receipt,
    SettingsIcon,
    Table2,
    Trash2Icon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { DealProductFields } from '@/components/deal-product-fields';
import type { InvoiceReceipt } from '@/components/invoice-dialog';
import InvoiceDialog from '@/components/invoice-dialog';
import { PageHeader } from '@/components/page-header';
import PaymentForm from '@/components/payment-form';
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { cartInventoryError } from '@/lib/cart-inventory';
import { categoryBadgeClass, normalizeCategory } from '@/lib/categories';
import { postJson } from '@/lib/http';
import { useCategoryLabel, useI18n } from '@/lib/i18n';
import { inertiaPost } from '@/lib/inertia-action';
import { buildExactSettlementPayments, formatMoney } from '@/lib/payments';
import { posCartRowClass, posPanelClass, posTileClass } from '@/lib/pos-ui';

type Product = {
    id: number;
    name: string;
    category: string;
    price: string;
    cost_price: string;
    is_active: boolean;
    stock_quantity: number;
    low_stock_threshold: number;
    is_deal?: boolean;
    deal_active?: boolean;
    deal_label?: string | null;
    deal_product_id?: number | null;
    deal_product_name?: string | null;
    deal_buy_qty?: number | null;
    deal_get_qty?: number | null;
    deal_starts_on?: string | null;
    deal_ends_on?: string | null;
};

type DealBaseProduct = {
    id: number;
    name: string;
    price: string;
    cost_price?: string;
    category: string;
};

type Props = {
    products: Product[];
    dealBaseProducts?: DealBaseProduct[];
    openCheckouts: { id: number; label: string }[];
    runningTables: { id: number; name: string; status: string }[];
    isAdmin?: boolean;
    users?: { id: number; name: string }[];
};

type CartItem = {
    productId: number;
    name: string;
    price: number;
    quantity: number;
};

const PRODUCT_FORM_DEFAULTS = {
    name: '',
    category: '',
    price: '',
    cost_price: '',
    stock_quantity: '0',
    low_stock_threshold: '5',
    is_deal: false,
    deal_product_id: '',
    deal_buy_qty: '1',
    deal_get_qty: '1',
    deal_starts_on: '',
    deal_ends_on: '',
};

export default function AdminProducts({
    products,
    dealBaseProducts = [],
    openCheckouts,
    runningTables,
    isAdmin = false,
    users = [],
}: Props) {
    const { t } = useI18n();
    const categoryLabel = useCategoryLabel();
    const DEFAULT_CATEGORIES = ['Drinks', 'Snacks', 'Sets'] as const;
    const money = formatMoney;

    const categoryOptions = Array.from(
        new Set([
            ...DEFAULT_CATEGORIES,
            ...products.map((product) => normalizeCategory(product.category)),
        ]),
    );
    const activeProducts = useMemo(
        () => products.filter((product) => product.is_active),
        [products],
    );
    const posCategories = Array.from(
        new Set(
            activeProducts.map((product) =>
                normalizeCategory(product.category),
            ),
        ),
    ).sort((a, b) => {
        if (a === 'Special') {
            return -1;
        }

        if (b === 'Special') {
            return 1;
        }

        return a.localeCompare(b);
    });

    const { data, setData, post, reset, processing, errors, transform } =
        useForm({
            ...PRODUCT_FORM_DEFAULTS,
            category: 'Snacks',
            deal_product_ids: [] as string[],
        });

    const editForm = useForm(PRODUCT_FORM_DEFAULTS);

    const [createOpen, setCreateOpen] = useState(false);
    const [editProduct, setEditProduct] = useState<Product | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [deletingProduct, setDeletingProduct] = useState(false);
    const [createCategoryMode, setCreateCategoryMode] = useState<
        'existing' | 'new'
    >('existing');
    const [selectedCreateCategory, setSelectedCreateCategory] =
        useState('Snacks');
    const [newCreateCategory, setNewCreateCategory] = useState('');
    const [createMode, setCreateMode] = useState<'normal' | 'deal'>('normal');
    const [selectedDealBaseIds, setSelectedDealBaseIds] = useState<string[]>(
        [],
    );
    const [posSearch, setPosSearch] = useState('');
    const [posCategory, setPosCategory] = useState('all');
    const [selectedCheckoutId, setSelectedCheckoutId] = useState<number | null>(
        openCheckouts[0]?.id ?? null,
    );
    const [selectedTableId, setSelectedTableId] = useState<number | null>(
        runningTables[0]?.id ?? null,
    );
    const [cart, setCart] = useState<CartItem[]>([]);
    const [posMessage, setPosMessage] = useState<string | null>(null);
    const [posError, setPosError] = useState<string | null>(null);
    const [actionOpen, setActionOpen] = useState(false);
    const [existingTabOpen, setExistingTabOpen] = useState(false);
    const [runningTableOpen, setRunningTableOpen] = useState(false);
    const [externalUseOpen, setExternalUseOpen] = useState(false);
    const [externalUserId, setExternalUserId] = useState(
        users[0] ? String(users[0].id) : '',
    );
    const [externalNote, setExternalNote] = useState('');
    const [externalError, setExternalError] = useState<string | null>(null);
    const [externalSaving, setExternalSaving] = useState(false);
    const [payOpen, setPayOpen] = useState(false);
    const [cash, setCash] = useState('');
    const [card, setCard] = useState('');
    const [transfer, setTransfer] = useState('');
    const [customerEmail, setCustomerEmail] = useState('');
    const [paying, setPaying] = useState(false);
    const [invoiceReceipt, setInvoiceReceipt] = useState<InvoiceReceipt | null>(
        null,
    );
    const [emailSending, setEmailSending] = useState(false);
    const [emailMessage, setEmailMessage] = useState<string | null>(null);

    useEffect(() => {
        if (!posMessage && !posError) {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            setPosMessage(null);
            setPosError(null);
        }, 3500);

        return () => window.clearTimeout(timeoutId);
    }, [posMessage, posError]);

    useEffect(() => {
        const intervalId = window.setInterval(() => {
            if (document.visibilityState !== 'visible') {
                return;
            }

            // Use async reload so this poll does not cancel create/update visits
            // (router.get() would abort the Inertia redirect that carries new products).
            router.reload({
                only: [
                    'products',
                    'dealBaseProducts',
                    'openCheckouts',
                    'runningTables',
                ],
                async: true,
            });
        }, 2500);

        return () => window.clearInterval(intervalId);
    }, []);

    const filteredPosProducts = activeProducts
        .filter((product) => {
            const category = normalizeCategory(product.category);
            const searchText = `${product.name} ${category}`.toLowerCase();
            const matchesSearch = searchText.includes(posSearch.toLowerCase());
            const matchesCategory =
                posCategory === 'all' || posCategory === category;

            return matchesSearch && matchesCategory;
        })
        .slice()
        .sort((a, b) => {
            const aSpecial =
                a.is_deal || normalizeCategory(a.category) === 'Special';
            const bSpecial =
                b.is_deal || normalizeCategory(b.category) === 'Special';

            if (aSpecial !== bSpecial) {
                return aSpecial ? -1 : 1;
            }

            return a.name.localeCompare(b.name);
        });

    const addToCart = (product: Product) => {
        if (product.is_deal && product.deal_active === false) {
            setPosError('This Special deal is not active today.');

            return;
        }

        const packagePrice = product.is_deal
            ? Number(product.price) * Number(product.deal_buy_qty ?? 1)
            : Number(product.price);

        const existing = cart.find((item) => item.productId === product.id);
        const nextCart = existing
            ? cart.map((item) =>
                  item.productId === product.id
                      ? { ...item, quantity: item.quantity + 1 }
                      : item,
              )
            : [
                  ...cart,
                  {
                      productId: product.id,
                      name: product.name,
                      price: packagePrice,
                      quantity: 1,
                  },
              ];
        const error = cartInventoryError(products, nextCart);
        setPosError(error);

        if (!error) {
            setCart(nextCart);
        }
    };

    const updateCartQuantity = (productId: number, quantity: number) => {
        const nextCart = cart
            .map((item) =>
                item.productId === productId
                    ? { ...item, quantity: Math.max(0, Math.floor(quantity)) }
                    : item,
            )
            .filter((item) => item.quantity > 0);
        const error = cartInventoryError(products, nextCart);
        setPosError(error);

        if (!error) {
            setCart(nextCart);
        }
    };

    const validateCart = () => {
        const error =
            cart.length === 0
                ? 'Add at least one product.'
                : cartInventoryError(products, cart);
        setPosError(error);

        if (error) {
            setActionOpen(false);
            setPayOpen(false);
            setExistingTabOpen(false);
            setRunningTableOpen(false);
        }

        return error === null;
    };

    const clearPosState = () => {
        setCart([]);
        setPosError(null);
        setPosMessage(null);
        setCash('');
        setCard('');
        setTransfer('');
        setCustomerEmail('');
    };

    const posItemsPayload = () =>
        cart.map((item) => ({
            product_id: item.productId,
            quantity: item.quantity,
        }));

    const cartTotal = cart.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0,
    );
    const handleOpenActions = () => {
        setPosError(null);
        setPosMessage(null);

        if (!validateCart()) {
            return;
        }

        setActionOpen(true);
    };

    const handleCreateNewTab = async () => {
        if (!validateCart()) {
            return;
        }

        try {
            const result = await postJson('/checkouts/from-products', {
                items: posItemsPayload(),
            });
            setPosMessage(
                `Created Tab #${result.checkout_id} with product items.`,
            );
            setCart([]);
            setActionOpen(false);
            router.get(
                '/admin/products',
                {},
                {
                    preserveState: true,
                    preserveScroll: true,
                    replace: true,
                    only: ['openCheckouts', 'runningTables'],
                },
            );
        } catch (error) {
            setPosError(
                error instanceof Error
                    ? error.message
                    : 'Failed to create open tab.',
            );
        }
    };

    const addCartTo = async (
        destination: 'tab' | 'table',
        destinationId: number | null,
    ) => {
        if (!validateCart()) {
            return;
        }

        if (!destinationId) {
            setPosError(
                destination === 'tab'
                    ? 'Select an open tab first.'
                    : 'Select a running table first.',
            );

            return;
        }

        if (destination === 'tab') {
            setExistingTabOpen(false);
        } else {
            setRunningTableOpen(false);
        }

        const url =
            destination === 'tab'
                ? `/checkouts/${destinationId}/items/bulk`
                : `/tables/${destinationId}/items/bulk`;
        const result = await inertiaPost(url, { items: posItemsPayload() });

        if (result !== 'success') {
            if (result === 'error') {
                setPosError(
                    destination === 'tab'
                        ? 'Failed to add items to tab. Refreshing…'
                        : 'Failed to add items to table. Refreshing…',
                );
            }

            router.reload();

            return;
        }

        setPosMessage(
            destination === 'tab'
                ? `Added items to Tab #${destinationId}.`
                : 'Added items to running table session.',
        );
        setCart([]);
    };

    const handleAddToExistingTab = () => addCartTo('tab', selectedCheckoutId);
    const handleAddToRunningTable = () => addCartTo('table', selectedTableId);

    const handleActionPayNow = () => {
        if (!validateCart()) {
            return;
        }

        setActionOpen(false);
        setPayOpen(true);
    };

    const handleActionExistingTab = () => {
        if (openCheckouts.length === 0) {
            setPosError('No open tab available. Create a new tab first.');

            return;
        }

        setSelectedCheckoutId((current) => current ?? openCheckouts[0].id);
        setActionOpen(false);
        setExistingTabOpen(true);
    };

    const handleActionRunningTable = () => {
        if (runningTables.length === 0) {
            setPosError('No running table available right now.');

            return;
        }

        setSelectedTableId((current) => current ?? runningTables[0].id);
        setActionOpen(false);
        setRunningTableOpen(true);
    };

    const handleActionExternalUse = () => {
        if (users.length === 0) {
            setPosError('No staff users available for external use.');

            return;
        }

        setExternalUserId((current) => current || String(users[0].id));
        setExternalNote('');
        setExternalError(null);
        setActionOpen(false);
        setExternalUseOpen(true);
    };

    const handleConfirmExternalUse = () => {
        if (cart.length === 0) {
            setExternalError('Cart is empty.');

            return;
        }

        const userId = Number(externalUserId);

        if (!userId) {
            setExternalError('Select who used the items.');

            return;
        }

        if (externalNote.trim() === '') {
            setExternalError('Reason is required.');

            return;
        }

        setExternalSaving(true);
        setExternalError(null);
        router.post(
            '/admin/products/external-use',
            {
                user_id: userId,
                items: posItemsPayload(),
                note: externalNote.trim(),
            },
            {
                preserveScroll: true,
                onSuccess: () => {
                    const staff =
                        users.find((user) => user.id === userId)?.name ??
                        'staff';
                    setExternalUseOpen(false);
                    setExternalNote('');
                    setCart([]);
                    setPosMessage(`External use recorded for ${staff}.`);
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

    const handleResetCart = () => {
        setCart([]);
        setPosMessage(null);
        setPosError(null);
    };

    const handlePayNow = async () => {
        if (!validateCart()) {
            return;
        }

        const settlement = buildExactSettlementPayments({
            expected: cartTotal,
            cash: parseFloat(cash) || 0,
            card: parseFloat(card) || 0,
            transfer: parseFloat(transfer) || 0,
            money,
        });

        if (settlement.error) {
            setPosError(
                settlement.error.replaceAll('grand total', 'cart total'),
            );

            return;
        }

        const payments = settlement.payments;

        setPaying(true);

        try {
            const created = await postJson('/checkouts/from-products', {
                items: posItemsPayload(),
            });
            const completed = await postJson(
                `/checkouts/${created.checkout_id}/complete`,
                {
                    payments,
                    customer_email: customerEmail.trim() || null,
                },
            );
            const receipt =
                (completed as { receipt?: InvoiceReceipt | null })?.receipt ??
                null;
            clearPosState();
            setPayOpen(false);
            setEmailMessage(null);
            setInvoiceReceipt(receipt);
            setPosMessage('Product payment completed successfully.');
        } catch (error) {
            setPosError(
                error instanceof Error ? error.message : 'Payment failed.',
            );
        } finally {
            setPaying(false);
        }
    };

    const handleEmailInvoice = async () => {
        if (!invoiceReceipt) {
            return;
        }

        setEmailSending(true);
        setEmailMessage(null);

        try {
            const result = await postJson(
                `/receipts/${invoiceReceipt.id}/send-email`,
                {},
            );
            const message =
                (result as { message?: string })?.message ?? 'Receipt sent.';
            setEmailMessage(message);
        } catch (error) {
            setEmailMessage(
                error instanceof Error
                    ? error.message
                    : 'Failed to send email.',
            );
        } finally {
            setEmailSending(false);
        }
    };

    const applyDealPreset = (
        buy: number,
        get: number,
        target: 'create' | 'edit' = 'create',
    ) => {
        const label = `${buy}+${get}`;

        if (target === 'create') {
            const firstId = selectedDealBaseIds[0];
            const base = dealBaseProducts.find((p) => String(p.id) === firstId);
            setData({
                ...data,
                deal_buy_qty: String(buy),
                deal_get_qty: String(get),
                name:
                    selectedDealBaseIds.length === 1 && base
                        ? `${base.name} ${label}`
                        : selectedDealBaseIds.length > 1
                          ? `${selectedDealBaseIds.length} × ${label}`
                          : data.name,
                price:
                    selectedDealBaseIds.length === 1 && base
                        ? String(base.price)
                        : data.price,
                cost_price:
                    selectedDealBaseIds.length === 1 && base
                        ? String(base.cost_price ?? 0)
                        : data.cost_price,
                category: 'Special',
                is_deal: true,
            });
        } else {
            const base = dealBaseProducts.find(
                (p) => String(p.id) === editForm.data.deal_product_id,
            );
            editForm.setData({
                ...editForm.data,
                deal_buy_qty: String(buy),
                deal_get_qty: String(get),
                name:
                    base &&
                    (!editForm.data.name || / \d\+\d$/.test(editForm.data.name))
                        ? `${base.name} ${label}`
                        : editForm.data.name,
                category: 'Special',
                is_deal: true,
            });
        }
    };

    const handleCreate = (e: React.FormEvent) => {
        e.preventDefault();
        setPosError(null);

        const isDeal = createMode === 'deal';
        let category = data.category;

        if (isDeal) {
            if (selectedDealBaseIds.length === 0) {
                setPosError('Choose at least one product for the deal.');

                return;
            }

            category = 'Special';
        } else if (createCategoryMode === 'new') {
            const nextCategory = newCreateCategory.trim();

            if (!nextCategory) {
                setPosError('Enter a new category name.');

                return;
            }

            category = nextCategory;
        } else {
            category = selectedCreateCategory;
        }

        const firstBase =
            isDeal && selectedDealBaseIds.length === 1
                ? dealBaseProducts.find(
                      (p) => String(p.id) === selectedDealBaseIds[0],
                  )
                : undefined;
        const label = `${data.deal_buy_qty}+${data.deal_get_qty}`;

        // Apply overrides in transform so we don't race React setState before post().
        transform((form) => ({
            ...form,
            category,
            is_deal: isDeal,
            deal_product_id:
                isDeal && selectedDealBaseIds.length === 1
                    ? selectedDealBaseIds[0]
                    : null,
            deal_product_ids: isDeal ? selectedDealBaseIds : [],
            name: isDeal
                ? firstBase
                    ? `${firstBase.name} ${label}`
                    : `${selectedDealBaseIds.length} deals`
                : form.name,
            price: isDeal
                ? firstBase
                    ? String(firstBase.price)
                    : '0'
                : form.price,
            cost_price: isDeal
                ? firstBase
                    ? String(firstBase.cost_price ?? 0)
                    : 0
                : form.cost_price === '' || form.cost_price == null
                  ? 0
                  : form.cost_price,
            stock_quantity:
                form.stock_quantity === '' || form.stock_quantity == null
                    ? 0
                    : form.stock_quantity,
            low_stock_threshold:
                form.low_stock_threshold === '' ||
                form.low_stock_threshold == null
                    ? 5
                    : form.low_stock_threshold,
            deal_starts_on: form.deal_starts_on || null,
            deal_ends_on: form.deal_ends_on || null,
        }));

        post('/admin/products', {
            preserveScroll: true,
            preserveState: false,
            onSuccess: () => {
                const dealCount = selectedDealBaseIds.length;
                reset();
                transform((form) => form);
                setCreateCategoryMode('existing');
                setSelectedCreateCategory('Snacks');
                setNewCreateCategory('');
                setCreateMode('normal');
                setSelectedDealBaseIds([]);
                setCreateOpen(false);
                setPosMessage(
                    isDeal
                        ? dealCount > 1
                            ? `${dealCount} Special deals created.`
                            : 'Special deal created.'
                        : 'Product created successfully.',
                );
                setPosCategory('all');
                setPosSearch('');
                router.reload({
                    only: ['products', 'dealBaseProducts'],
                    async: true,
                });
            },
            onError: (errs) => {
                const first = Object.values(errs)[0];
                setPosError(
                    typeof first === 'string'
                        ? first
                        : 'Could not create product. Check the form fields.',
                );
            },
        });
    };

    const openEdit = (product: Product) => {
        setEditProduct(product);
        const isDeal = !!product.is_deal || !!product.deal_product_id;
        editForm.setData({
            name: product.name,
            category: normalizeCategory(product.category),
            price: String(product.price),
            cost_price: String(product.cost_price ?? 0),
            stock_quantity: String(product.stock_quantity),
            low_stock_threshold: String(product.low_stock_threshold),
            is_deal: isDeal,
            deal_product_id: product.deal_product_id
                ? String(product.deal_product_id)
                : '',
            deal_buy_qty: String(product.deal_buy_qty ?? 1),
            deal_get_qty: String(product.deal_get_qty ?? 1),
            deal_starts_on: product.deal_starts_on ?? '',
            deal_ends_on: product.deal_ends_on ?? '',
        });
    };

    const closeEdit = () => {
        setEditProduct(null);
        editForm.reset();
        editForm.clearErrors();
    };

    const handleEdit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!editProduct) {
            return;
        }

        editForm.put(`/admin/products/${editProduct.id}`, {
            preserveScroll: true,
            onSuccess: () => {
                closeEdit();
                setPosMessage('Product updated successfully.');
            },
        });
    };

    const handleDelete = () => {
        if (!editProduct) {
            return;
        }

        setDeletingProduct(true);
        router.delete(`/admin/products/${editProduct.id}`, {
            preserveScroll: true,
            onSuccess: () => {
                setDeleteConfirmOpen(false);
                closeEdit();
                setPosMessage('Product deleted successfully.');
            },
            onError: () => {
                setPosError('Could not delete this product.');
            },
            onFinish: () => setDeletingProduct(false),
        });
    };

    return (
        <AppLayout breadcrumbs={[]}>
            <Head title={t('Products')} />
            <div className="flex h-[calc(100svh-4rem)] flex-col gap-4 overflow-hidden p-4">
                <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-sidebar-border/70 bg-background p-4 shadow-sm dark:border-sidebar-border">
                    <div className="mb-3">
                        <PageHeader
                            title={t('Products')}
                            description={t(
                                'Scan, tap, and send items to a table or tab.',
                            )}
                        >
                            <Button type="button" variant="outline" asChild>
                                <Link href="/stock">{t('Manage stock')}</Link>
                            </Button>
                            {isAdmin && (
                                <Button onClick={() => setCreateOpen(true)}>
                                    {t('+ Add product')}
                                </Button>
                            )}
                        </PageHeader>
                    </div>

                    <div className="min-h-0 flex-1 overflow-hidden">
                        <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-3 lg:grid-cols-[220px_minmax(0,1fr)_320px] lg:grid-rows-1">
                            <div className="flex h-full min-h-0 flex-col overflow-hidden">
                                <div className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                    {t('Categories')}
                                </div>
                                <div
                                    className={`flex min-h-0 flex-1 flex-col ${posPanelClass} p-2`}
                                >
                                    <Input
                                        placeholder={t(
                                            'Scan / Enter barcode...',
                                        )}
                                        value={posSearch}
                                        onChange={(e) =>
                                            setPosSearch(e.target.value)
                                        }
                                        className="mb-2 h-9"
                                    />
                                    <div className="min-h-0 space-y-1 overflow-y-auto">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={
                                                posCategory === 'all'
                                                    ? 'default'
                                                    : 'outline'
                                            }
                                            className="w-full justify-start"
                                            onClick={() =>
                                                setPosCategory('all')
                                            }
                                        >
                                            {t('All items')}
                                        </Button>
                                        {posCategories.map((category) => (
                                            <Button
                                                key={category}
                                                type="button"
                                                size="sm"
                                                variant={
                                                    posCategory === category
                                                        ? 'default'
                                                        : 'outline'
                                                }
                                                className="w-full justify-start"
                                                onClick={() =>
                                                    setPosCategory(category)
                                                }
                                            >
                                                {categoryLabel(category)}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="flex min-h-0 flex-col overflow-hidden lg:h-full">
                                <div className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                    Products
                                </div>
                                <div
                                    className={`min-h-0 flex-1 overflow-y-auto ${posPanelClass} p-3`}
                                >
                                    <div className="flex flex-wrap content-start gap-3">
                                        {filteredPosProducts.length === 0 && (
                                            <div className="px-2 py-1 text-muted-foreground">
                                                No active products match your
                                                filters.
                                            </div>
                                        )}
                                        {filteredPosProducts.map((product) => {
                                            const dealInactive =
                                                !!product.is_deal &&
                                                product.deal_active === false;
                                            const displayPrice = product.is_deal
                                                ? Number(product.price) *
                                                  Number(
                                                      product.deal_buy_qty ?? 1,
                                                  )
                                                : Number(product.price);

                                            return (
                                                <div
                                                    key={product.id}
                                                    className="relative h-36 w-36 flex-shrink-0"
                                                >
                                                    <button
                                                        type="button"
                                                        data-testid="product-tile"
                                                        disabled={dealInactive}
                                                        onClick={() =>
                                                            addToCart(product)
                                                        }
                                                        className={`${posTileClass} h-full w-full ${dealInactive ? 'opacity-50' : ''}`}
                                                    >
                                                        <div
                                                            className={
                                                                isAdmin
                                                                    ? 'pr-8'
                                                                    : undefined
                                                            }
                                                        >
                                                            <span
                                                                className={`inline-flex h-7 max-w-full items-center rounded-full px-2 text-[11px] font-semibold tracking-wide uppercase ${categoryBadgeClass(product.category)}`}
                                                            >
                                                                <span className="truncate">
                                                                    {product.deal_label
                                                                        ? `${t('Special')} ${product.deal_label}`
                                                                        : categoryLabel(
                                                                              normalizeCategory(
                                                                                  product.category,
                                                                              ),
                                                                          )}
                                                                </span>
                                                            </span>
                                                        </div>
                                                        <div className="flex min-h-0 flex-1 items-center justify-center py-1 text-center">
                                                            <div className="line-clamp-3 text-sm leading-snug font-semibold">
                                                                {product.name}
                                                            </div>
                                                        </div>
                                                        <div className="text-lg font-bold text-emerald-700 tabular-nums dark:text-emerald-300">
                                                            {money(
                                                                displayPrice,
                                                            )}
                                                        </div>
                                                        <div
                                                            className={`text-xs ${product.stock_quantity <= product.low_stock_threshold ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}
                                                        >
                                                            {dealInactive
                                                                ? t('Deal off')
                                                                : product.is_deal
                                                                  ? t(
                                                                        'Packages: {count}',
                                                                        {
                                                                            count: product.stock_quantity,
                                                                        },
                                                                    )
                                                                  : t(
                                                                        'Stock: {count}',
                                                                        {
                                                                            count: product.stock_quantity,
                                                                        },
                                                                    )}
                                                        </div>
                                                    </button>
                                                    {isAdmin && (
                                                        <Button
                                                            type="button"
                                                            size="icon"
                                                            variant="ghost"
                                                            aria-label={`Edit ${product.name}`}
                                                            title={`Edit ${product.name}`}
                                                            onClick={() =>
                                                                openEdit(
                                                                    product,
                                                                )
                                                            }
                                                            className="absolute top-3 right-3 z-10 size-7 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                                                        >
                                                            <SettingsIcon className="size-4" />
                                                        </Button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            <div className="flex h-full min-h-0 flex-col overflow-hidden">
                                <div className="mb-2 shrink-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                    Cart
                                </div>
                                <div
                                    className={`flex min-h-0 flex-1 flex-col overflow-hidden ${posPanelClass} p-3 text-sm`}
                                >
                                    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                                        {cart.length === 0 && (
                                            <div className="px-2 py-1 text-muted-foreground italic">
                                                Cart is empty.
                                            </div>
                                        )}
                                        {cart.map((item) => (
                                            <div
                                                key={item.productId}
                                                className={posCartRowClass}
                                            >
                                                <div className="flex-1">
                                                    <div className="text-sm font-medium">
                                                        {item.name}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {item.quantity} x{' '}
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
                                                                e.target.value,
                                                            ) || 0,
                                                        )
                                                    }
                                                />
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-3 shrink-0 border-t border-border pt-3">
                                        <div className="mb-3 flex items-center justify-between text-base font-semibold">
                                            <span>Total:</span>
                                            <span>{money(cartTotal)}</span>
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="flex-1"
                                            onClick={handleResetCart}
                                        >
                                            Clear
                                        </Button>
                                        <Button
                                            type="button"
                                            className="flex-1"
                                            onClick={handleOpenActions}
                                        >
                                            Continue
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {posMessage && (
                <div className="pointer-events-none fixed top-6 left-1/2 z-[120] w-full max-w-md -translate-x-1/2 px-2 sm:px-0">
                    <Alert className="border-emerald-500/50 bg-background shadow-xl">
                        <CheckCircle2Icon />
                        <AlertTitle>Success</AlertTitle>
                        <AlertDescription>{posMessage}</AlertDescription>
                    </Alert>
                </div>
            )}
            {posError && (
                <div className="pointer-events-none fixed top-6 left-1/2 z-[120] w-full max-w-md -translate-x-1/2 px-2 sm:px-0">
                    <Alert variant="destructive" className="shadow-xl">
                        <AlertTitle>Action failed</AlertTitle>
                        <AlertDescription>{t(posError)}</AlertDescription>
                    </Alert>
                </div>
            )}

            <Dialog
                open={actionOpen}
                onOpenChange={(open) => {
                    setActionOpen(open);
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Choose next action</DialogTitle>
                        <DialogDescription>
                            {cart.reduce((sum, item) => sum + item.quantity, 0)}{' '}
                            item
                            {cart.reduce(
                                (sum, item) => sum + item.quantity,
                                0,
                            ) === 1
                                ? ''
                                : 's'}{' '}
                            · {money(cartTotal)}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Button
                            type="button"
                            className="h-11 w-full justify-start gap-2"
                            onClick={handleActionPayNow}
                        >
                            <CreditCard className="h-4 w-4" />
                            Pay now
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full justify-start gap-2"
                            onClick={handleCreateNewTab}
                        >
                            <Receipt className="h-4 w-4" />
                            Add to new open tab
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full justify-start gap-2"
                            onClick={handleActionExistingTab}
                        >
                            <LayoutGrid className="h-4 w-4" />
                            Add to existing open tab
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full justify-start gap-2"
                            onClick={handleActionRunningTable}
                        >
                            <Table2 className="h-4 w-4" />
                            Add to running table
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full justify-start gap-2"
                            onClick={handleActionExternalUse}
                        >
                            <PackageMinus className="h-4 w-4" />
                            External use
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={existingTabOpen} onOpenChange={setExistingTabOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Add to existing open tab</DialogTitle>
                        <DialogDescription>
                            Select one tab to receive the current cart items.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <Select
                            value={
                                selectedCheckoutId != null
                                    ? String(selectedCheckoutId)
                                    : undefined
                            }
                            onValueChange={(value) =>
                                setSelectedCheckoutId(
                                    value ? Number(value) : null,
                                )
                            }
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select open tab" />
                            </SelectTrigger>
                            <SelectContent>
                                {openCheckouts.map((checkout) => (
                                    <SelectItem
                                        key={checkout.id}
                                        value={String(checkout.id)}
                                    >
                                        {checkout.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setExistingTabOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button type="button" onClick={handleAddToExistingTab}>
                            Confirm
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={runningTableOpen} onOpenChange={setRunningTableOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Add to running table</DialogTitle>
                        <DialogDescription>
                            Select one active table session for these items.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <Select
                            value={
                                selectedTableId != null
                                    ? String(selectedTableId)
                                    : undefined
                            }
                            onValueChange={(value) =>
                                setSelectedTableId(value ? Number(value) : null)
                            }
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select running table" />
                            </SelectTrigger>
                            <SelectContent>
                                {runningTables.map((table) => (
                                    <SelectItem
                                        key={table.id}
                                        value={String(table.id)}
                                    >
                                        {table.name} ({table.status})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setRunningTableOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button type="button" onClick={handleAddToRunningTable}>
                            Confirm
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={externalUseOpen}
                onOpenChange={(open) => {
                    setExternalUseOpen(open);

                    if (!open) {
                        setExternalError(null);
                        setExternalNote('');
                    }
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>External use</DialogTitle>
                        <DialogDescription>
                            Deduct the cart from stock without a sale. Choose
                            who used the items.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-sm">
                            {cart.reduce((sum, item) => sum + item.quantity, 0)}{' '}
                            item
                            {cart.reduce(
                                (sum, item) => sum + item.quantity,
                                0,
                            ) === 1
                                ? ''
                                : 's'}{' '}
                            · {money(cartTotal)} (no payment)
                        </div>
                        <div className="space-y-1.5">
                            <p className="text-xs font-medium text-muted-foreground">
                                Staff member
                            </p>
                            <Select
                                value={externalUserId || undefined}
                                onValueChange={setExternalUserId}
                            >
                                <SelectTrigger className="w-full">
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
                            <p className="text-xs font-medium text-muted-foreground">
                                Reason (required)
                            </p>
                            <Input
                                value={externalNote}
                                onChange={(event) =>
                                    setExternalNote(event.target.value)
                                }
                                placeholder="Staff drink, spill, house use…"
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
                            onClick={() => setExternalUseOpen(false)}
                            disabled={externalSaving}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={handleConfirmExternalUse}
                            disabled={
                                externalSaving ||
                                !externalUserId ||
                                externalNote.trim() === ''
                            }
                        >
                            {externalSaving
                                ? 'Recording…'
                                : 'Record external use'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={payOpen} onOpenChange={setPayOpen}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Pay products</DialogTitle>
                        <DialogDescription>
                            Split between cash, card, and transfer. Cash may
                            exceed the total; change is returned from cash.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <PaymentForm
                            total={cartTotal}
                            cash={cash}
                            card={card}
                            transfer={transfer}
                            email={customerEmail}
                            onCashChange={setCash}
                            onCardChange={setCard}
                            onTransferChange={setTransfer}
                            onEmailChange={setCustomerEmail}
                        />
                    </div>
                    <DialogFooter className="flex-col gap-2 sm:flex-col">
                        <Button
                            type="button"
                            className="h-11 w-full"
                            onClick={handlePayNow}
                            disabled={paying}
                        >
                            {paying
                                ? 'Processing…'
                                : `Complete payment · ${money(cartTotal)}`}
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            className="w-full"
                            onClick={() => setPayOpen(false)}
                            disabled={paying}
                        >
                            Cancel
                        </Button>
                    </DialogFooter>
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

            {isAdmin && (
                <>
                    <Dialog
                        open={!!editProduct}
                        onOpenChange={(open) => !open && closeEdit()}
                    >
                        <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                                <DialogTitle>Edit product</DialogTitle>
                                <DialogDescription>
                                    Update this product&apos;s menu details.
                                </DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleEdit} className="space-y-4">
                                {editForm.data.is_deal && (
                                    <DealProductFields
                                        baseProducts={dealBaseProducts}
                                        dealProductId={
                                            editForm.data.deal_product_id
                                        }
                                        buyQty={editForm.data.deal_buy_qty}
                                        getQty={editForm.data.deal_get_qty}
                                        startsOn={editForm.data.deal_starts_on}
                                        endsOn={editForm.data.deal_ends_on}
                                        error={editForm.errors.deal_product_id}
                                        onBaseChange={(value, base) => {
                                            const label = `${editForm.data.deal_buy_qty}+${editForm.data.deal_get_qty}`;
                                            editForm.setData({
                                                ...editForm.data,
                                                deal_product_id: value,
                                                is_deal: true,
                                                category: 'Special',
                                                price: base
                                                    ? String(base.price)
                                                    : editForm.data.price,
                                                name: base
                                                    ? `${base.name} ${label}`
                                                    : editForm.data.name,
                                            });
                                        }}
                                        onPreset={(buy, get) =>
                                            applyDealPreset(buy, get, 'edit')
                                        }
                                        onStartsChange={(value) =>
                                            editForm.setData(
                                                'deal_starts_on',
                                                value,
                                            )
                                        }
                                        onEndsChange={(value) =>
                                            editForm.setData(
                                                'deal_ends_on',
                                                value,
                                            )
                                        }
                                    />
                                )}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-muted-foreground">
                                        Name
                                    </label>
                                    <Input
                                        value={editForm.data.name}
                                        onChange={(e) =>
                                            editForm.setData(
                                                'name',
                                                e.target.value,
                                            )
                                        }
                                        required
                                        autoFocus
                                    />
                                    {editForm.errors.name && (
                                        <p className="text-xs text-destructive">
                                            {editForm.errors.name}
                                        </p>
                                    )}
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-muted-foreground">
                                        Category
                                    </label>
                                    <Input
                                        value={editForm.data.category}
                                        onChange={(e) =>
                                            editForm.setData(
                                                'category',
                                                e.target.value,
                                            )
                                        }
                                        list="product-category-options"
                                        required
                                    />
                                    <datalist id="product-category-options">
                                        {categoryOptions.map((category) => (
                                            <option
                                                key={category}
                                                value={category}
                                            />
                                        ))}
                                    </datalist>
                                    {editForm.errors.category && (
                                        <p className="text-xs text-destructive">
                                            {editForm.errors.category}
                                        </p>
                                    )}
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-muted-foreground">
                                        Price
                                    </label>
                                    <Input
                                        type="number"
                                        step="1"
                                        min="0"
                                        value={editForm.data.price}
                                        onChange={(e) =>
                                            editForm.setData(
                                                'price',
                                                e.target.value,
                                            )
                                        }
                                        required
                                    />
                                    {editForm.errors.price && (
                                        <p className="text-xs text-destructive">
                                            {editForm.errors.price}
                                        </p>
                                    )}
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-muted-foreground">
                                        Stock/original price
                                    </label>
                                    <Input
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={editForm.data.cost_price}
                                        onChange={(e) =>
                                            editForm.setData(
                                                'cost_price',
                                                e.target.value,
                                            )
                                        }
                                    />
                                    {editForm.errors.cost_price && (
                                        <p className="text-xs text-destructive">
                                            {editForm.errors.cost_price}
                                        </p>
                                    )}
                                </div>
                                <DialogFooter className="sm:justify-between">
                                    <Button
                                        type="button"
                                        variant="destructive"
                                        onClick={() =>
                                            setDeleteConfirmOpen(true)
                                        }
                                        disabled={editForm.processing}
                                    >
                                        <Trash2Icon className="size-4" />
                                        Delete product
                                    </Button>
                                    <div className="flex gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={closeEdit}
                                            disabled={editForm.processing}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            type="submit"
                                            disabled={editForm.processing}
                                        >
                                            {editForm.processing
                                                ? 'Saving...'
                                                : 'Save changes'}
                                        </Button>
                                    </div>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>

                    <AlertDialog
                        open={deleteConfirmOpen}
                        onOpenChange={setDeleteConfirmOpen}
                    >
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>
                                    Delete product?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                    {editProduct
                                        ? `“${editProduct.name}” will be permanently removed. This action cannot be undone.`
                                        : 'This product will be permanently removed.'}
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel disabled={deletingProduct}>
                                    Cancel
                                </AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={handleDelete}
                                    disabled={deletingProduct}
                                    className="bg-destructive text-white hover:bg-destructive/90"
                                >
                                    {deletingProduct
                                        ? 'Deleting...'
                                        : 'Delete product'}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>

                    <Dialog
                        open={createOpen}
                        onOpenChange={(open) => {
                            setCreateOpen(open);

                            if (!open) {
                                reset();
                                setCreateCategoryMode('existing');
                                setSelectedCreateCategory('Snacks');
                                setNewCreateCategory('');
                                setCreateMode('normal');
                                setSelectedDealBaseIds([]);
                            }
                        }}
                    >
                        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
                            <DialogHeader>
                                <DialogTitle>Add product</DialogTitle>
                                <DialogDescription>
                                    Create a normal menu item or Special deals
                                    (1+1, 2+1, 2+2) for one or more products.
                                </DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleCreate} className="space-y-4">
                                {(posError ||
                                    Object.keys(errors).length > 0) && (
                                    <Alert variant="destructive">
                                        <AlertTitle>Could not save</AlertTitle>
                                        <AlertDescription>
                                            {posError ||
                                                Object.values(errors)[0] ||
                                                'Check the form fields and try again.'}
                                        </AlertDescription>
                                    </Alert>
                                )}
                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={
                                            createMode === 'normal'
                                                ? 'default'
                                                : 'outline'
                                        }
                                        onClick={() => {
                                            setCreateMode('normal');
                                            setSelectedDealBaseIds([]);
                                            setData('is_deal', false);
                                            setData('deal_product_id', '');
                                            setData(
                                                'category',
                                                selectedCreateCategory,
                                            );
                                        }}
                                    >
                                        Normal
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={
                                            createMode === 'deal'
                                                ? 'default'
                                                : 'outline'
                                        }
                                        onClick={() => {
                                            setCreateMode('deal');
                                            setData('is_deal', true);
                                            setData('category', 'Special');
                                        }}
                                    >
                                        Special deal
                                    </Button>
                                </div>
                                {createMode === 'deal' && (
                                    <DealProductFields
                                        multiple
                                        baseProducts={dealBaseProducts}
                                        selectedIds={selectedDealBaseIds}
                                        onSelectedIdsChange={
                                            setSelectedDealBaseIds
                                        }
                                        buyQty={data.deal_buy_qty}
                                        getQty={data.deal_get_qty}
                                        startsOn={data.deal_starts_on}
                                        endsOn={data.deal_ends_on}
                                        error={
                                            errors.deal_product_id ||
                                            errors.deal_product_ids
                                        }
                                        onPreset={(buy, get) =>
                                            applyDealPreset(buy, get)
                                        }
                                        onStartsChange={(value) =>
                                            setData('deal_starts_on', value)
                                        }
                                        onEndsChange={(value) =>
                                            setData('deal_ends_on', value)
                                        }
                                    />
                                )}
                                {createMode === 'normal' && (
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-muted-foreground">
                                            Name
                                        </label>
                                        <Input
                                            value={data.name}
                                            onChange={(e) =>
                                                setData('name', e.target.value)
                                            }
                                            required
                                        />
                                        {errors.name && (
                                            <p className="text-xs text-destructive">
                                                {errors.name}
                                            </p>
                                        )}
                                    </div>
                                )}
                                {createMode === 'normal' && (
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-muted-foreground">
                                            Category
                                        </label>
                                        <Select
                                            value={
                                                createCategoryMode === 'new'
                                                    ? '__new__'
                                                    : selectedCreateCategory
                                            }
                                            onValueChange={(value) => {
                                                if (value === '__new__') {
                                                    setCreateCategoryMode(
                                                        'new',
                                                    );
                                                    setData(
                                                        'category',
                                                        newCreateCategory.trim(),
                                                    );

                                                    return;
                                                }

                                                setCreateCategoryMode(
                                                    'existing',
                                                );
                                                setSelectedCreateCategory(
                                                    value,
                                                );
                                                setData('category', value);
                                            }}
                                        >
                                            <SelectTrigger className="w-full">
                                                <SelectValue placeholder="Select category" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {categoryOptions.map(
                                                    (category) => (
                                                        <SelectItem
                                                            key={category}
                                                            value={category}
                                                        >
                                                            {categoryLabel(
                                                                category,
                                                            )}
                                                        </SelectItem>
                                                    ),
                                                )}
                                                <SelectItem value="__new__">
                                                    + Create new category
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                        {createCategoryMode === 'new' && (
                                            <Input
                                                value={newCreateCategory}
                                                onChange={(e) => {
                                                    setNewCreateCategory(
                                                        e.target.value,
                                                    );
                                                    setData(
                                                        'category',
                                                        e.target.value.trim(),
                                                    );
                                                }}
                                                placeholder="New category name"
                                                required
                                            />
                                        )}
                                        {errors.category && (
                                            <p className="text-xs text-destructive">
                                                {errors.category}
                                            </p>
                                        )}
                                    </div>
                                )}
                                {createMode === 'normal' && (
                                    <>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-medium text-muted-foreground">
                                                Price
                                            </label>
                                            <Input
                                                type="number"
                                                step="1"
                                                min="0"
                                                value={data.price}
                                                onChange={(e) =>
                                                    setData(
                                                        'price',
                                                        e.target.value,
                                                    )
                                                }
                                                required
                                            />
                                            {errors.price && (
                                                <p className="text-xs text-destructive">
                                                    {errors.price}
                                                </p>
                                            )}
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-medium text-muted-foreground">
                                                Stock/original price
                                            </label>
                                            <Input
                                                type="number"
                                                min="0"
                                                step="1"
                                                value={data.cost_price}
                                                onChange={(e) =>
                                                    setData(
                                                        'cost_price',
                                                        e.target.value,
                                                    )
                                                }
                                            />
                                            {errors.cost_price && (
                                                <p className="text-xs text-destructive">
                                                    {errors.cost_price}
                                                </p>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-medium text-muted-foreground">
                                                    Starting stock
                                                </label>
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    step="1"
                                                    value={data.stock_quantity}
                                                    onChange={(e) =>
                                                        setData(
                                                            'stock_quantity',
                                                            e.target.value,
                                                        )
                                                    }
                                                />
                                                {errors.stock_quantity && (
                                                    <p className="text-xs text-destructive">
                                                        {errors.stock_quantity}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-medium text-muted-foreground">
                                                    Low-stock alert at
                                                </label>
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    step="1"
                                                    value={
                                                        data.low_stock_threshold
                                                    }
                                                    onChange={(e) =>
                                                        setData(
                                                            'low_stock_threshold',
                                                            e.target.value,
                                                        )
                                                    }
                                                />
                                            </div>
                                        </div>
                                    </>
                                )}
                                <DialogFooter>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setCreateOpen(false)}
                                    >
                                        Cancel
                                    </Button>
                                    <Button type="submit" disabled={processing}>
                                        {processing
                                            ? 'Saving…'
                                            : createMode === 'deal'
                                              ? selectedDealBaseIds.length > 1
                                                  ? `Create ${selectedDealBaseIds.length} deals`
                                                  : 'Create deal'
                                              : 'Add product'}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                </>
            )}
        </AppLayout>
    );
}
