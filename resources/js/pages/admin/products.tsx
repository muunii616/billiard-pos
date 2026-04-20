import { Head, router, useForm } from '@inertiajs/react';
import { CheckCircle2Icon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import type { BreadcrumbItem } from '@/types';

type Product = {
  id: number;
  name: string;
  category: string;
  price: string;
  is_active: boolean;
};

type Props = {
  products: Product[];
  openCheckouts: { id: number; label: string }[];
  runningTables: { id: number; name: string; status: string }[];
  isAdmin?: boolean;
};

type CartItem = {
  productId: number;
  name: string;
  price: number;
  quantity: number;
};

const breadcrumbs: BreadcrumbItem[] = [
  {
    title: 'Admin',
    href: '/admin/products',
  },
  {
    title: 'Products',
    href: '/admin/products',
  },
];

export default function AdminProducts({ products, openCheckouts, runningTables, isAdmin = false }: Props) {
  const DEFAULT_CATEGORIES = ['Drinks', 'Snacks', 'Sets'] as const;
  const money = (value: number) => `$${(Number(value) || 0).toFixed(2)}`;

  const normalizeCategory = (raw: string): string => {
    const value = (raw || '').trim();
    const key = value.toLowerCase();

    if (key === 'drink' || key === 'drinks') {
return 'Drinks';
}

    if (key === 'snack' || key === 'snacks') {
return 'Snacks';
}

    if (key === 'set' || key === 'sets' || key === 'combo' || key === 'combos') {
return 'Sets';
}

    return value
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  };

  const categoryOptions = Array.from(
    new Set([...DEFAULT_CATEGORIES, ...products.map((product) => normalizeCategory(product.category))]),
  );
  const activeProducts = useMemo(() => products.filter((product) => product.is_active), [products]);
  const posCategories = Array.from(
    new Set(activeProducts.map((product) => normalizeCategory(product.category))),
  ).sort();

  const { data, setData, post, reset, processing, errors } = useForm({
    name: '',
    category: 'Snacks',
    price: '',
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [createCategoryMode, setCreateCategoryMode] = useState<'existing' | 'new'>('existing');
  const [selectedCreateCategory, setSelectedCreateCategory] = useState('Snacks');
  const [newCreateCategory, setNewCreateCategory] = useState('');
  const [posSearch, setPosSearch] = useState('');
  const [posCategory, setPosCategory] = useState('all');
  const [selectedCheckoutId, setSelectedCheckoutId] = useState<number | null>(openCheckouts[0]?.id ?? null);
  const [selectedTableId, setSelectedTableId] = useState<number | null>(runningTables[0]?.id ?? null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [posMessage, setPosMessage] = useState<string | null>(null);
  const [posError, setPosError] = useState<string | null>(null);
  const [actionOpen, setActionOpen] = useState(false);
  const [existingTabOpen, setExistingTabOpen] = useState(false);
  const [runningTableOpen, setRunningTableOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [cash, setCash] = useState('');
  const [card, setCard] = useState('');
  const [transfer, setTransfer] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [paying, setPaying] = useState(false);

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

      router.get('/admin/products', {}, {
        preserveState: true,
        preserveScroll: true,
        replace: true,
        only: ['openCheckouts', 'runningTables'],
      });
    }, 2500);

    return () => window.clearInterval(intervalId);
  }, []);

  const filteredPosProducts = activeProducts.filter((product) => {
    const category = normalizeCategory(product.category);
    const searchText = `${product.name} ${category}`.toLowerCase();
    const matchesSearch = searchText.includes(posSearch.toLowerCase());
    const matchesCategory = posCategory === 'all' || posCategory === category;

    return matchesSearch && matchesCategory;
  });

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);

      if (existing) {
        return prev.map((item) =>
          item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }

      return [
        ...prev,
        { productId: product.id, name: product.name, price: Number(product.price), quantity: 1 },
      ];
    });
  };

  const updateCartQuantity = (productId: number, quantity: number) => {
    setCart((prev) =>
      prev
        .map((item) => (item.productId === productId ? { ...item, quantity } : item))
        .filter((item) => item.quantity > 0),
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

  const getCsrfToken = () =>
    document.cookie
      .split('; ')
      .find((row) => row.startsWith('XSRF-TOKEN='))
      ?.split('=')[1];

  const postJson = async (url: string, payload: unknown) => {
    const token = getCsrfToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    };

    if (token) {
      headers['X-XSRF-TOKEN'] = decodeURIComponent(token);
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = json?.message || 'Request failed.';

      throw new Error(message);
    }

    return json;
  };

  const posItemsPayload = () =>
    cart.map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
    }));

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cashValuePreview = parseFloat(cash) || 0;
  const cardValuePreview = parseFloat(card) || 0;
  const transferValuePreview = parseFloat(transfer) || 0;
  const totalPaidPreview = Math.round((cashValuePreview + cardValuePreview + transferValuePreview) * 100) / 100;
  const expectedPreview = Math.round(cartTotal * 100) / 100;
  const changePreview = Math.max(0, Math.round((totalPaidPreview - expectedPreview) * 100) / 100);
  const amountDuePreview = Math.max(0, Math.round((expectedPreview - totalPaidPreview) * 100) / 100);

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
      const result = await postJson('/checkouts/from-products', { items: posItemsPayload() });
      setPosMessage(`Created Tab #${result.checkout_id} with product items.`);
      setCart([]);
      setActionOpen(false);
      router.get('/admin/products', {}, {
        preserveState: true,
        preserveScroll: true,
        replace: true,
        only: ['openCheckouts', 'runningTables'],
      });
    } catch (error) {
      setPosError(error instanceof Error ? error.message : 'Failed to create open tab.');
    }
  };

  const handleAddToExistingTab = () => {
    if (!selectedCheckoutId) {
      setPosError('Select an open tab first.');

      return;
    }

    router.post(
      `/checkouts/${selectedCheckoutId}/items/bulk`,
      { items: posItemsPayload() },
      {
        preserveScroll: true,
        onSuccess: () => {
          setExistingTabOpen(false);
          setPosMessage(`Added items to Tab #${selectedCheckoutId}.`);
          setCart([]);
        },
      },
    );
  };

  const handleAddToRunningTable = () => {
    if (!selectedTableId) {
      setPosError('Select a running table first.');

      return;
    }

    router.post(
      `/tables/${selectedTableId}/items/bulk`,
      { items: posItemsPayload() },
      {
        preserveScroll: true,
        onSuccess: () => {
          setRunningTableOpen(false);
          setPosMessage('Added items to running table session.');
          setCart([]);
        },
      },
    );
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

    const cashValue = parseFloat(cash) || 0;
    const cardValue = parseFloat(card) || 0;
    const transferValue = parseFloat(transfer) || 0;
    const totalPaid = Math.round((cashValue + cardValue + transferValue) * 100) / 100;
    const expected = Math.round(cartTotal * 100) / 100;

    if (totalPaid + 0.01 < expected) {
      setPosError(`Total paid must be at least ${money(expected)}.`);

      return;
    }

    const nonCashTotal = Math.round((cardValue + transferValue) * 100) / 100;

    if (nonCashTotal > expected + 0.01) {
      setPosError('Card and transfer combined cannot exceed the cart total.');

      return;
    }

    const payments: { method: string; amount: number }[] = [];

    if (cashValue > 0) {
payments.push({ method: 'cash', amount: cashValue });
}

    if (cardValue > 0) {
payments.push({ method: 'card', amount: cardValue });
}

    if (transferValue > 0) {
payments.push({ method: 'transfer_qr', amount: transferValue });
}

    setPaying(true);

    try {
      const created = await postJson('/checkouts/from-products', { items: posItemsPayload() });
      await postJson(`/checkouts/${created.checkout_id}/complete`, {
        payments,
        customer_email: customerEmail.trim() || null,
      });
      clearPosState();
      setPayOpen(false);
      setPosMessage('Product payment completed successfully.');
    } catch (error) {
      setPosError(error instanceof Error ? error.message : 'Payment failed.');
    } finally {
      setPaying(false);
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

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title="Products" />
      <div className="flex h-[calc(100vh-8.5rem)] min-h-[640px] flex-1 flex-col gap-4 rounded-xl p-4">
        <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-sidebar-border/70 bg-background p-4 shadow-sm dark:border-sidebar-border">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-medium text-muted-foreground">Products POS</div>
            {isAdmin && (
              <Button className="rounded-full px-4" onClick={() => setCreateOpen(true)}>
                + Add product
              </Button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            <div className="grid h-full gap-3 lg:grid-cols-[220px_minmax(0,1fr)_320px]">
              <div className="flex min-h-0 flex-col">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Categories
                </div>
                <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-sidebar-border/70 bg-slate-950/60 p-2">
                  <Input
                    placeholder="Scan / Enter barcode..."
                    value={posSearch}
                    onChange={(e) => setPosSearch(e.target.value)}
                    className="mb-2 h-9"
                  />
                  <div className="min-h-0 space-y-1 overflow-y-auto">
                    <Button
                      type="button"
                      size="sm"
                      variant={posCategory === 'all' ? 'default' : 'outline'}
                      className="w-full justify-start"
                      onClick={() => setPosCategory('all')}
                    >
                      All items
                    </Button>
                    {posCategories.map((category) => (
                      <Button
                        key={category}
                        type="button"
                        size="sm"
                        variant={posCategory === category ? 'default' : 'outline'}
                        className="w-full justify-start"
                        onClick={() => setPosCategory(category)}
                      >
                        {category}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex min-h-0 flex-col">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Products
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-sidebar-border/70 bg-slate-950/60 p-3">
                  <div className="flex flex-wrap content-start gap-3">
                    {filteredPosProducts.length === 0 && (
                      <div className="px-2 py-1 text-muted-foreground">
                        No active products match your filters.
                      </div>
                    )}
                    {filteredPosProducts.map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => addToCart(product)}
                        className="flex h-36 w-36 flex-shrink-0 flex-col justify-between rounded-lg border border-emerald-700/60 bg-emerald-950/40 px-3 py-3 text-left shadow-sm transition hover:-translate-y-[1px] hover:border-emerald-400 hover:bg-emerald-900/60"
                      >
                        <div className="mb-1 flex items-start justify-between gap-2">
                          <div className="text-sm font-semibold leading-snug text-emerald-50">{product.name}</div>
                          <span className="whitespace-nowrap rounded-full bg-emerald-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-50">
                            {normalizeCategory(product.category)}
                          </span>
                        </div>
                        <div className="mt-1 text-lg font-bold text-emerald-300">{money(Number(product.price))}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex min-h-0 flex-col">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cart</div>
                <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-sidebar-border/70 bg-slate-950/60 p-3 text-sm">
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                    {cart.length === 0 && <div className="px-2 py-1 italic text-muted-foreground">Cart is empty.</div>}
                    {cart.map((item) => (
                      <div
                        key={item.productId}
                        className="flex items-center justify-between gap-2 rounded-md bg-slate-900/70 px-2 py-1.5"
                      >
                        <div className="flex-1">
                          <div className="text-sm font-medium">{item.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {item.quantity} x {money(item.price)}
                          </div>
                        </div>
                        <Input
                          type="number"
                          min={0}
                          className="h-8 w-16"
                          value={item.quantity}
                          onChange={(e) => updateCartQuantity(item.productId, Number(e.target.value) || 0)}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 border-t border-emerald-500/40 pt-3">
                    <div className="mb-3 flex items-center justify-between text-sm font-semibold">
                      <span>Total:</span>
                      <span>{money(cartTotal)}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" className="flex-1" onClick={handleResetCart}>
                      Clear
                    </Button>
                    <Button type="button" className="flex-1" onClick={handleOpenActions}>
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
        <div className="pointer-events-none fixed left-1/2 top-6 z-[120] w-full max-w-md -translate-x-1/2 px-2 sm:px-0">
          <Alert className="border-emerald-500/50 bg-background shadow-xl">
            <CheckCircle2Icon />
            <AlertTitle>Success</AlertTitle>
            <AlertDescription>{posMessage}</AlertDescription>
          </Alert>
        </div>
      )}
      {posError && (
        <div className="pointer-events-none fixed left-1/2 top-6 z-[120] w-full max-w-md -translate-x-1/2 px-2 sm:px-0">
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
            <DialogDescription>Select where to send these products.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Button type="button" className="w-full justify-start" onClick={handleActionPayNow}>
              Pay now
            </Button>
            <Button type="button" variant="outline" className="w-full justify-start" onClick={handleCreateNewTab}>
              Add to new open tab
            </Button>
            <Button type="button" variant="outline" className="w-full justify-start" onClick={handleActionExistingTab}>
              Add to existing open tab
            </Button>
            <Button type="button" variant="outline" className="w-full justify-start" onClick={handleActionRunningTable}>
              Add to running table
            </Button>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setActionOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={existingTabOpen} onOpenChange={setExistingTabOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add to existing open tab</DialogTitle>
            <DialogDescription>Select one tab to receive the current cart items.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Select
              value={selectedCheckoutId != null ? String(selectedCheckoutId) : undefined}
              onValueChange={(value) => setSelectedCheckoutId(value ? Number(value) : null)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select open tab" />
              </SelectTrigger>
              <SelectContent>
                {openCheckouts.map((checkout) => (
                  <SelectItem key={checkout.id} value={String(checkout.id)}>
                    {checkout.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setExistingTabOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleAddToExistingTab}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={runningTableOpen} onOpenChange={setRunningTableOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add to running table</DialogTitle>
            <DialogDescription>Select one active table session for these items.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Select
              value={selectedTableId != null ? String(selectedTableId) : undefined}
              onValueChange={(value) => setSelectedTableId(value ? Number(value) : null)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select running table" />
              </SelectTrigger>
              <SelectContent>
                {runningTables.map((table) => (
                  <SelectItem key={table.id} value={String(table.id)}>
                    {table.name} ({table.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRunningTableOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleAddToRunningTable}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pay products</DialogTitle>
            <DialogDescription>Split payment. Cash may exceed total to return change.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex justify-between text-sm font-semibold">
              <span>Cart total</span>
              <span>{money(cartTotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Total paid</span>
              <span>{money(totalPaidPreview)}</span>
            </div>
            {changePreview > 0 ? (
              <div className="flex justify-between text-sm font-semibold text-emerald-600">
                <span>Change</span>
                <span>{money(changePreview)}</span>
              </div>
            ) : (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Amount due</span>
                <span>{money(amountDuePreview)}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <label className="w-24 shrink-0 text-sm text-muted-foreground">Cash</label>
              <Input type="number" step="0.01" min={0} value={cash} onChange={(e) => setCash(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <label className="w-24 shrink-0 text-sm text-muted-foreground">Card</label>
              <Input type="number" step="0.01" min={0} value={card} onChange={(e) => setCard(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <label className="w-24 shrink-0 text-sm text-muted-foreground">Transfer</label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={transfer}
                onChange={(e) => setTransfer(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="w-24 shrink-0 text-sm text-muted-foreground">Email</label>
              <Input
                type="email"
                placeholder="customer@example.com"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPayOpen(false)} disabled={paying}>
              Cancel
            </Button>
            <Button type="button" onClick={handlePayNow} disabled={paying}>
              {paying ? 'Processing...' : 'Complete payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isAdmin && (
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
              <DialogDescription>Create a new product for the menu and checkout screens.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <Input value={data.name} onChange={(e) => setData('name', e.target.value)} required />
                {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Category</label>
                <Select
                  value={createCategoryMode === 'new' ? '__new__' : selectedCreateCategory}
                  onValueChange={(value) => {
                    if (value === '__new__') {
                      setCreateCategoryMode('new');
                      setData('category', newCreateCategory.trim());

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
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                    <SelectItem value="__new__">+ Create new category</SelectItem>
                  </SelectContent>
                </Select>
                {createCategoryMode === 'new' && (
                  <Input
                    value={newCreateCategory}
                    onChange={(e) => {
                      setNewCreateCategory(e.target.value);
                      setData('category', e.target.value.trim());
                    }}
                    placeholder="New category name"
                    required
                  />
                )}
                {errors.category && <p className="text-xs text-destructive">{errors.category}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Price</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={data.price}
                  onChange={(e) => setData('price', e.target.value)}
                  required
                />
                {errors.price && <p className="text-xs text-destructive">{errors.price}</p>}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={processing}>
                  Add product
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </AppLayout>
  );
}
