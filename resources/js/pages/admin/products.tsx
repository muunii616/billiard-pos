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
    X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import InvoiceDialog from '@/components/invoice-dialog';
import type { InvoiceReceipt } from '@/components/invoice-dialog';
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
import { categoryBadgeClass, normalizeCategory } from '@/lib/categories';
import { postJson } from '@/lib/http';
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
};

type Props = {
    products: Product[];
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

export default function AdminProducts({
    products,
    openCheckouts,
    runningTables,
    isAdmin = false,
    users = [],
}: Props) {
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
    ).sort();

    const { data, setData, post, reset, processing, errors } = useForm({
        name: '',
        category: 'Snacks',
        price: '',
        cost_price: '',
        stock_quantity: '0',
        low_stock_threshold: '5',
    });

    const editForm = useForm({
        name: '',
        category: '',
        price: '',
        cost_price: '',
        stock_quantity: '0',
        low_stock_threshold: '5',
    });

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
        }, 2500);

        return () => window.clearInterval(intervalId);
    }, []);

    const filteredPosProducts = activeProducts.filter((product) => {
        const category = normalizeCategory(product.category);
        const searchText = `${product.name} ${category}`.toLowerCase();
        const matchesSearch = searchText.includes(posSearch.toLowerCase());
        const matchesCategory =
            posCategory === 'all' || posCategory === category;

        return matchesSearch && matchesCategory;
    });

    const addToCart = (product: Product) => {
        setCart((prev) => {
            const existing = prev.find((item) => item.productId === product.id);

            if (existing) {
                return prev.map((item) =>
                    item.productId === product.id
                        ? { ...item, quantity: item.quantity + 1 }
                        : item,
                );
            }

            return [
                ...prev,
                {
                    productId: product.id,
                    name: product.name,
                    price: Number(product.price),
                    quantity: 1,
                },
            ];
        });
    };

    const updateCartQuantity = (productId: number, quantity: number) => {
        setCart((prev) =>
            prev.map((item) =>
                item.productId === productId
                    ? { ...item, quantity: Math.max(0, Math.floor(quantity)) }
                    : item,
            ),
        );
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

        if (cart.length === 0) {
            setPosError('Add at least one product.');

            return;
        }

        setActionOpen(true);
    };

    const handleCreateNewTab = async () => {
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

    const handleAddToExistingTab = async () => {
        if (!selectedCheckoutId) {
            setPosError('Select an open tab first.');

            return;
        }

        const checkoutId = selectedCheckoutId;
        setExistingTabOpen(false);
        const result = await inertiaPost(
            `/checkouts/${checkoutId}/items/bulk`,
            { items: posItemsPayload() },
        );

        if (result !== 'success') {
            if (result === 'error') {
                setPosError('Failed to add items to tab. Refreshing…');
            }

            router.reload({ preserveScroll: true });

            return;
        }

        setPosMessage(`Added items to Tab #${checkoutId}.`);
        setCart([]);
    };

    const handleAddToRunningTable = async () => {
        if (!selectedTableId) {
            setPosError('Select a running table first.');

            return;
        }

        const tableId = selectedTableId;
        setRunningTableOpen(false);
        const result = await inertiaPost(`/tables/${tableId}/items/bulk`, {
            items: posItemsPayload(),
        });

        if (result !== 'success') {
            if (result === 'error') {
                setPosError('Failed to add items to table. Refreshing…');
            }

            router.reload({ preserveScroll: true });

            return;
        }

        setPosMessage('Added items to running table session.');
        setCart([]);
    };

    const handleActionPayNow = () => {
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

        setExternalSaving(true);
        setExternalError(null);
        router.post(
            '/admin/products/external-use',
            {
                user_id: userId,
                items: posItemsPayload(),
                note: externalNote.trim() || null,
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
        if (cart.length === 0) {
            setPosError('Add at least one product.');

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

    const handleCreate = (e: React.FormEvent) => {
        e.preventDefault();

        if (createCategoryMode === 'new') {
            const nextCategory = newCreateCategory.trim();

            if (!nextCategory) {
                setPosError('Enter a new category name.');

                return;
            }

            setData('category', nextCategory);
        } else {
            setData('category', selectedCreateCategory);
        }

        post('/admin/products', {
            onSuccess: () => {
                reset();
                setCreateCategoryMode('existing');
                setSelectedCreateCategory('Snacks');
                setNewCreateCategory('');
                setCreateOpen(false);
            },
        });
    };

    const openEdit = (product: Product) => {
        setEditProduct(product);
        editForm.setData({
            name: product.name,
            category: normalizeCategory(product.category),
            price: String(product.price),
            cost_price: String(product.cost_price ?? 0),
            stock_quantity: String(product.stock_quantity),
            low_stock_threshold: String(product.low_stock_threshold),
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
            <Head title="Products" />
            <div className="flex h-[calc(100vh-8.5rem)] min-h-[640px] flex-1 flex-col gap-4 rounded-xl p-4">
                <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-sidebar-border/70 bg-background p-4 shadow-sm dark:border-sidebar-border">
                    <div className="mb-3">
                        <PageHeader
                            title="Products"
                            description="Scan, tap, and send items to a table or tab."
                        >
                            <Button type="button" variant="outline" asChild>
                                <Link href="/stock">Manage stock</Link>
                            </Button>
                            {isAdmin && (
                                <Button
                                    onClick={() => setCreateOpen(true)}
                                >
                                    + Add product
                                </Button>
                            )}
                        </PageHeader>
                    </div>

                    <div className="min-h-0 flex-1 overflow-hidden">
                        <div className="grid h-full gap-3 lg:grid-cols-[220px_minmax(0,1fr)_320px]">
                            <div className="flex min-h-0 flex-col">
                                <div className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                    Categories
                                </div>
                                <div className={`flex min-h-0 flex-1 flex-col ${posPanelClass} p-2`}>
                                    <Input
                                        placeholder="Scan / Enter barcode..."
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
                                            All items
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
                                                {category}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="flex min-h-0 flex-col">
                                <div className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                    Products
                                </div>
                                <div className={`min-h-0 flex-1 overflow-y-auto ${posPanelClass} p-3`}>
                                    <div className="flex flex-wrap content-start gap-3">
                                        {filteredPosProducts.length === 0 && (
                                            <div className="px-2 py-1 text-muted-foreground">
                                                No active products match your
                                                filters.
                                            </div>
                                        )}
                                        {filteredPosProducts.map((product) => (
                                            <div
                                                key={product.id}
                                                className="relative h-36 w-36 flex-shrink-0"
                                            >
                                                <button
                                                    type="button"
                                                    data-testid="product-tile"
                                                    onClick={() =>
                                                        addToCart(product)
                                                    }
                                                    className={`${posTileClass} h-full w-full`}
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
                                                                {normalizeCategory(
                                                                    product.category,
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
                                                            Number(
                                                                product.price,
                                                            ),
                                                        )}
                                                    </div>
                                                    <div
                                                        className={`text-xs ${product.stock_quantity <= product.low_stock_threshold ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}
                                                    >
                                                        Stock:{' '}
                                                        {product.stock_quantity}
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
                                                            openEdit(product)
                                                        }
                                                        className="absolute top-3 right-3 z-10 size-7 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                                                    >
                                                        <SettingsIcon className="size-4" />
                                                    </Button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="flex min-h-0 flex-col">
                                <div className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                    Cart
                                </div>
                                <div className={`flex min-h-0 flex-1 flex-col ${posPanelClass} p-3 text-sm`}>
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
                                    <div className="mt-3 border-t border-border pt-3">
                                        <div className="mb-3 flex items-center justify-between text-base font-semibold">
                                            <span>Total:</span>
                                            <span>{money(cartTotal)}</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
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
                        <AlertDescription>{posError}</AlertDescription>
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
                            {cart.reduce((sum, item) => sum + item.quantity, 0) ===
                            1
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
                            {cart.reduce((sum, item) => sum + item.quantity, 0) ===
                            1
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
                                Note (optional)
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
                            disabled={externalSaving || !externalUserId}
                        >
                            {externalSaving ? 'Recording…' : 'Record external use'}
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
                            }
                        }}
                    >
                        <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                                <DialogTitle>Add product</DialogTitle>
                                <DialogDescription>
                                    Create a new product for the menu and
                                    checkout screens.
                                </DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleCreate} className="space-y-4">
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
                                                setCreateCategoryMode('new');
                                                setData(
                                                    'category',
                                                    newCreateCategory.trim(),
                                                );

                                                return;
                                            }

                                            setCreateCategoryMode('existing');
                                            setSelectedCreateCategory(value);
                                            setData('category', value);
                                        }}
                                    >
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="Select category" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {categoryOptions.map((category) => (
                                                <SelectItem
                                                    key={category}
                                                    value={category}
                                                >
                                                    {category}
                                                </SelectItem>
                                            ))}
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
                                            setData('price', e.target.value)
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
                                            value={data.low_stock_threshold}
                                            onChange={(e) =>
                                                setData(
                                                    'low_stock_threshold',
                                                    e.target.value,
                                                )
                                            }
                                        />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setCreateOpen(false)}
                                    >
                                        Cancel
                                    </Button>
                                    <Button type="submit" disabled={processing}>
                                        Add product
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
