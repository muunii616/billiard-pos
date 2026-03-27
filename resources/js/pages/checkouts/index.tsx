import { Head, router, usePage } from '@inertiajs/react';
import { Wallet } from 'lucide-react';
import { useState, useEffect } from 'react';
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
import { Label } from '@/components/ui/label';
import AppLayout from '@/layouts/app-layout';
import receiptsRoutes from '@/routes/receipts';
import type { BreadcrumbItem } from '@/types';

type CheckoutRow = {
  id: number;
  created_at: string;
  table_names: string[];
  time_total: number;
  items_total: number;
  grand_total: number;
};

type Product = {
  id: number;
  name: string;
  price: string;
  category: string;
};

type InvoiceLineItem = {
  type: string;
  description: string;
  from?: string;
  to?: string;
  duration?: string;
  rate?: number;
  quantity?: number;
  unit_price?: number;
  subtotal: number;
};

type InvoiceReceipt = {
  id: number;
  receipt_number: string;
  date: string;
  time: string;
  table_name: string;
  customer_email: string | null;
  time_total: number;
  products_total: number;
  grand_total: number;
  line_items: InvoiceLineItem[];
  payments: { method: string; amount: number }[];
};

type CheckoutSummary = {
  checkout_id: number;
  table_name: string;
  time_total: number;
  items_total: number;
  grand_total: number;
};

type Props = {
  checkouts: CheckoutRow[];
  products: Product[];
  receipt?: InvoiceReceipt | null;
};

const breadcrumbs: BreadcrumbItem[] = [
  { title: 'Open tab', href: '/checkouts' },
];

export default function CheckoutsIndex({ checkouts, products, receipt: receiptProp }: Props) {
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payCheckoutId, setPayCheckoutId] = useState<number | null>(null);
  const [summary, setSummary] = useState<CheckoutSummary | null>(null);
  const [cash, setCash] = useState('');
  const [card, setCard] = useState('');
  const [transfer, setTransfer] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [invoiceReceipt, setInvoiceReceipt] = useState<InvoiceReceipt | null>(null);
  const [emailSending, setEmailSending] = useState(false);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [mergeConfirmOpen, setMergeConfirmOpen] = useState(false);
  const [addItemModalOpen, setAddItemModalOpen] = useState(false);
  const [addItemCheckoutId, setAddItemCheckoutId] = useState<number | null>(null);
  const [addItemSearch, setAddItemSearch] = useState('');
  const [addItemCategory, setAddItemCategory] = useState<string>('all');
  const [addItemCart, setAddItemCart] = useState<{ productId: number; name: string; price: number; quantity: number; category: string }[]>([]);
  const money = (value: number) => `$${(Number(value) || 0).toFixed(2)}`;

  const pageErrors = (usePage().props as { errors?: Record<string, string> }).errors ?? {};

  useEffect(() => {
    if (receiptProp) {
setInvoiceReceipt(receiptProp);
}
  }, [receiptProp]);

  useEffect(() => {
    if (payModalOpen && pageErrors.payments) {
setPayError(pageErrors.payments);
}
  }, [payModalOpen, pageErrors.payments]);

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

  const handlePayComplete = () => {
    if (!summary || payCheckoutId == null) {
return;
}

    const cashNum = parseFloat(cash) || 0;
    const cardNum = parseFloat(card) || 0;
    const transferNum = parseFloat(transfer) || 0;
    const totalPaid = Math.round((cashNum + cardNum + transferNum) * 100) / 100;
    const grandTotalCents = Math.round(summary.grand_total * 100);
    const totalPaidCents = Math.round(totalPaid * 100);

    if (totalPaidCents !== grandTotalCents) {
      setPayError(`Total paid must equal grand total (${money(summary.grand_total)}).`);

      return;
    }

    setPayError(null);
    const payments: { method: string; amount: number }[] = [];

    if (cashNum > 0) {
payments.push({ method: 'cash', amount: cashNum });
}

    if (cardNum > 0) {
payments.push({ method: 'card', amount: cardNum });
}

    if (transferNum > 0) {
payments.push({ method: 'transfer_qr', amount: transferNum });
}

    const payload: { payments: { method: string; amount: number }[]; customer_email?: string } = { payments };

    if (customerEmail.trim()) {
payload.customer_email = customerEmail.trim();
}

    setSubmitting(true);
    router.post(`/checkouts/${payCheckoutId}/complete`, payload, {
      onSuccess: (visit: { page?: { props?: { errors?: Record<string, string> } } }) => {
        setSubmitting(false);
        const err = visit?.page?.props?.errors?.payments;

        if (err) {
          setPayError(err);

          return;
        }

        closePayModal();
      },
      onError: () => setSubmitting(false),
      onFinish: () => setSubmitting(false),
    });
  };

  const handleEmailInvoice = async () => {
    if (!invoiceReceipt) {
return;
}

    setEmailMessage(null);
    setEmailSending(true);

    try {
      const url = receiptsRoutes.sendEmail.url({ receipt: invoiceReceipt.id });
      const csrfToken = document.cookie.split('; ').find((r) => r.startsWith('XSRF-TOKEN='))?.split('=')[1];
      const headers: Record<string, string> = {
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json',
        'Content-Type': 'application/json',
      };

      if (csrfToken) {
headers['X-XSRF-TOKEN'] = decodeURIComponent(csrfToken);
}

      const res = await fetch(url, { method: 'POST', headers, body: '{}' });
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
      alert('Select at least two tabs to merge.');

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
    router.post('/checkouts/merge', { target_id: targetId, source_ids: sourceIds }, {
      onSuccess: () => setSelectedIds([]),
      onFinish: () => setMergeConfirmOpen(false),
    });
  };

  const openAddItemModal = (checkoutId: number) => {
    if (products.length === 0) {
      alert('No products available.');

      return;
    }

    setAddItemCheckoutId(checkoutId);
    setAddItemSearch('');
    setAddItemCategory('all');
    setAddItemCart([]);
    setAddItemModalOpen(true);
  };

  const normalizeCategory = (raw: string | null | undefined): string => {
    const lower = (raw || '').toLowerCase();

    if (lower === 'drink' || lower === 'drinks') {
return 'Drinks';
}

    if (lower === 'snack' || lower === 'snacks') {
return 'Snacks';
}

    if (lower === 'set' || lower === 'sets' || lower === 'combo' || lower === 'combos') {
return 'Sets';
}

    return raw && raw.trim() ? raw : 'Other';
  };

  const categories = Array.from(new Set(products.map((p) => normalizeCategory(p.category)))).sort();

  const filteredProducts = products.filter((p) => {
    const cat = normalizeCategory(p.category);
    const matchesSearch = (p.name + ' ' + cat).toLowerCase().includes(addItemSearch.toLowerCase());
    const matchesCategory = addItemCategory === 'all' || cat === addItemCategory;

    return matchesSearch && matchesCategory;
  });

  const addProductToCart = (product: { id: number; name: string; price: string; category: string }) => {
    setAddItemCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);

      if (existing) {
        return prev.map((i) =>
          i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }

      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          price: Number(product.price),
          quantity: 1,
          category: product.category,
        },
      ];
    });
  };

  const updateCartQuantity = (productId: number, quantity: number) => {
    setAddItemCart((prev) =>
      prev
        .map((i) => (i.productId === productId ? { ...i, quantity } : i))
        .filter((i) => i.quantity > 0),
    );
  };

  const cartTotal = addItemCart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const handleConfirmAddItem = () => {
    if (!addItemCheckoutId || addItemCart.length === 0) {
return;
}

    const items = addItemCart.map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
    }));
    router.post(`/checkouts/${addItemCheckoutId}/items/bulk`, { items }, {
      onSuccess: () => {
        setAddItemModalOpen(false);
        setAddItemCheckoutId(null);
        setAddItemCart([]);
      },
    });
  };

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title="Open tab" />
      <div className="flex flex-1 flex-col gap-4 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Open tab</h1>
          {checkouts.length > 1 && (
            <Button
              variant="outline"
              size="sm"
              disabled={selectedIds.length < 2}
              onClick={handleMergeTabs}
            >
              Merge tabs
            </Button>
          )}
        </div>

        <AlertDialog open={mergeConfirmOpen} onOpenChange={setMergeConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Merge selected tabs?</AlertDialogTitle>
              <AlertDialogDescription>
                {selectedIds.length >= 2
                  ? `Tab #${selectedIds[0]} will be the target. ${selectedIds.length - 1} tab(s) will be merged into it. This action cannot be undone.`
                  : 'Select at least two tabs to merge.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmMergeTabs}>
                Confirm merge
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {checkouts.length === 0 ? (
          <div className="rounded-xl border border-sidebar-border/70 bg-muted/30 p-8 text-center text-muted-foreground">
            No open tabs. Move a session from Tables → End → Move to open tab.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {checkouts.map((row) => (
              <div
                key={row.id}
                className="flex flex-col justify-between rounded-xl border border-sidebar-border/70 bg-background p-4 shadow-sm dark:border-sidebar-border"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-sm font-medium text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Wallet className="h-4 w-4" />
                      Tab #{row.id}
                    </div>
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-sidebar-border/70 bg-background"
                      checked={selectedIds.includes(row.id)}
                      onChange={() => toggleSelected(row.id)}
                    />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {row.table_names.length ? row.table_names.join(', ') : '—'}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-1 text-sm">
                    <span className="text-muted-foreground">Time charge:</span>
                    <span>{money(Number(row.time_total))}</span>
                    <span className="text-muted-foreground">Items charge:</span>
                    <span>{money(Number(row.items_total))}</span>
                    <span className="font-medium text-muted-foreground">Total:</span>
                    <span className="font-semibold">{money(Number(row.grand_total))}</span>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => openAddItemModal(row.id)}>
                    Add item
                  </Button>
                  <Button size="sm" onClick={() => openPayModal(row.id)}>
                    Pay now
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add item modal for a checkout tab */}
        <Dialog open={addItemModalOpen} onOpenChange={(open) => !open && setAddItemModalOpen(false)}>
          <DialogContent className="w-[calc(100vw-1rem)] max-h-[90vh] overflow-y-auto sm:max-w-5xl">
            <DialogHeader>
              <DialogTitle>Add Items</DialogTitle>
              <DialogDescription>
                Search and add multiple products to this open tab.
              </DialogDescription>
            </DialogHeader>

            {/* Shell */}
            <div className="mt-2 rounded-xl border border-sidebar-border/70 bg-background/95 p-3 shadow-sm dark:border-sidebar-border sm:p-4">
              {/* Global search */}
              <div className="mb-4">
                <Input
                  placeholder="Search products..."
                  value={addItemSearch}
                  onChange={(e) => setAddItemSearch(e.target.value)}
                  className="h-10"
                />
              </div>

              {/* 3-column content */}
              <div className="flex flex-col gap-3 overflow-y-auto lg:h-[420px] lg:flex-row lg:gap-4 lg:overflow-hidden">
                {/* Categories (left) */}
                <div className="flex w-full flex-shrink-0 flex-col lg:w-52">
                  <Label className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Categories
                  </Label>
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-sidebar-border/70 bg-slate-950/60 p-2 lg:max-h-none lg:flex-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={addItemCategory === 'all' ? 'default' : 'outline'}
                      className="w-full justify-start"
                      onClick={() => setAddItemCategory('all')}
                    >
                      All Items
                    </Button>
                    {categories.map((cat) => (
                      <Button
                        key={cat}
                        type="button"
                        size="sm"
                        variant={addItemCategory === cat ? 'default' : 'outline'}
                        className="w-full justify-start"
                        onClick={() => setAddItemCategory(cat)}
                      >
                        {cat}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Product grid (center) */}
                <div className="flex min-w-0 flex-1 flex-col">
                  <Label className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Items
                  </Label>
                  <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-sidebar-border/70 bg-slate-950/60 p-3">
                    <div className="grid max-h-[34vh] grid-cols-1 content-start gap-3 overflow-y-auto text-sm sm:grid-cols-2 lg:max-h-none lg:h-full">
                      {filteredProducts.length === 0 && (
                        <div className="col-span-2 px-2 py-1 text-muted-foreground">
                          No products match your search.
                        </div>
                      )}
                      {filteredProducts.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => addProductToCart(p)}
                          className="flex h-[120px] flex-col justify-between rounded-lg border border-emerald-700/60 bg-emerald-950/40 px-3 py-3 text-left shadow-sm transition hover:-translate-y-[1px] hover:border-emerald-400 hover:bg-emerald-900/60"
                        >
                          <div className="mb-1 flex items-start justify-between gap-2">
                            <div className="text-sm font-semibold leading-snug text-emerald-50">
                              {p.name}
                            </div>
                            <span className="whitespace-nowrap rounded-full bg-emerald-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-50">
                              {normalizeCategory(p.category)}
                            </span>
                          </div>
                          <div className="mt-1 text-lg font-bold text-emerald-300">
                            {money(Number(p.price))}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Cart (right) */}
                <div className="flex w-full flex-shrink-0 flex-col lg:w-64">
                  <Label className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Cart
                  </Label>
                  <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-sidebar-border/70 bg-slate-950/60 p-3 text-sm">
                    <div className="max-h-40 space-y-2 overflow-y-auto lg:max-h-none lg:h-full">
                      {addItemCart.length === 0 && (
                        <div className="px-2 py-1 text-sm italic text-muted-foreground">
                          Cart is empty.
                        </div>
                      )}
                      {addItemCart.map((item) => (
                        <div
                          key={item.productId}
                          className="flex items-center justify-between gap-2 rounded-md bg-slate-900/70 px-2 py-1.5"
                        >
                          <div className="flex-1">
                            <div className="text-sm font-medium">{item.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {item.quantity} × {money(item.price)}
                            </div>
                          </div>
                          <Input
                            type="number"
                            min={0}
                            className="h-8 w-16"
                            value={item.quantity}
                            onChange={(e) =>
                              updateCartQuantity(item.productId, Number(e.target.value) || 0)
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total:</span>
                    <span className="font-semibold">{money(cartTotal)}</span>
                  </div>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <Button variant="outline" type="button" onClick={() => setAddItemModalOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="button" onClick={handleConfirmAddItem} disabled={addItemCart.length === 0}>
                      Add items
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={payModalOpen} onOpenChange={(open) => !open && closePayModal()}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Pay tab — {summary?.table_name ?? 'Open tab'}</DialogTitle>
              <DialogDescription>
                Split payment. Total paid must equal grand total.
              </DialogDescription>
            </DialogHeader>
            {summary && (
              <>
                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Time</span>
                    <span>{money(summary.time_total)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Items</span>
                    <span>{money(summary.items_total)}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>Grand total</span>
                    <span>{money(summary.grand_total)}</span>
                  </div>
                </div>
                <div className="grid gap-3">
                  <div className="flex items-center gap-2">
                    <Label className="w-24 shrink-0">Cash</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      placeholder="0"
                      value={cash}
                      onChange={(e) => {
 setCash(e.target.value); setPayError(null); 
}}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="w-24 shrink-0">Card</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      placeholder="0"
                      value={card}
                      onChange={(e) => {
 setCard(e.target.value); setPayError(null); 
}}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="w-24 shrink-0">Transfer (QR)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      placeholder="0"
                      value={transfer}
                      onChange={(e) => {
 setTransfer(e.target.value); setPayError(null); 
}}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="w-24 shrink-0">Email (optional)</Label>
                    <Input
                      type="email"
                      placeholder="customer@example.com"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-muted-foreground/40 bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                  <span className="font-medium">QR Code placeholder</span>
                  <span className="text-xs">Scan to pay via transfer</span>
                </div>
                {payError && <p className="text-sm text-destructive">{payError}</p>}
                <DialogFooter>
                  <Button variant="outline" onClick={closePayModal} disabled={submitting}>
                    Cancel
                  </Button>
                  <Button onClick={handlePayComplete} disabled={submitting}>
                    {submitting ? 'Completing…' : 'Complete payment'}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={!!invoiceReceipt} onOpenChange={(open) => !open && setInvoiceReceipt(null)}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Invoice</DialogTitle>
            </DialogHeader>
            {invoiceReceipt && (
              <>
                <div className="rounded-xl border border-sidebar-border/70 bg-background p-4 text-sm space-y-3">
                  <div className="text-center">
                    <h2 className="text-lg font-semibold">Billiard POS</h2>
                    <p className="text-muted-foreground text-xs">GAME INVOICE</p>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                    <span>Invoice:</span>
                    <span className="font-medium text-foreground">{invoiceReceipt.receipt_number}</span>
                    <span>Date:</span>
                    <span className="text-foreground">{invoiceReceipt.date}</span>
                    <span>Time:</span>
                    <span className="text-foreground">{invoiceReceipt.time}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                    <span>Customer:</span>
                    <span className="text-foreground">{invoiceReceipt.customer_email || '—'}</span>
                    <span>Table:</span>
                    <span className="text-foreground">{invoiceReceipt.table_name || 'Open tab'}</span>
                  </div>
                  <div className="border-t pt-2 mt-2">
                    <div className="text-xs font-medium text-muted-foreground mb-1">Line items</div>
                    {(invoiceReceipt.line_items || []).map((item, i) => (
                      <div key={i} className="flex justify-between text-sm py-0.5">
                        <span>
                          {item.type === 'time'
                            ? `${item.duration} @ ${item.rate}/min`
                            : `${item.quantity} × ${item.description}`}
                        </span>
                        <span>{money(Number(item.subtotal) || 0)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between font-semibold pt-2 border-t">
                    <span>Grand total</span>
                    <span>{money(Number(invoiceReceipt.grand_total) || 0)}</span>
                  </div>
                </div>
                {emailMessage && <p className="text-sm text-muted-foreground">{emailMessage}</p>}
                <DialogFooter className="flex-row gap-2 sm:gap-0">
                  <Button variant="outline" onClick={() => window.print()}>
                    Print
                  </Button>
                  <Button onClick={handleEmailInvoice} disabled={emailSending}>
                    {emailSending ? 'Sending…' : 'Email'}
                  </Button>
                  <Button variant="secondary" onClick={() => {
 setInvoiceReceipt(null); setEmailMessage(null); 
}}>
                    Close
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
