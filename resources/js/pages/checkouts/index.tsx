import { Head, router, usePage } from '@inertiajs/react';
import { Pencil, Wallet } from 'lucide-react';
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
  status: string;
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

type TabItemLine = {
  id: number;
  product_id: number | null;
  product_name: string | null;
  product_category?: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
};

type CheckoutSummary = {
  checkout_id: number;
  table_name: string;
  time_total: number;
  items_total: number;
  grand_total: number;
  tab_items?: TabItemLine[];
};

type Props = {
  checkouts: CheckoutRow[];
  products: Product[];
  receipt?: InvoiceReceipt | null;
  isAdmin?: boolean;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Card/transfer share a cap of grand total; clamp one field against the other. */
function limitCardOrTransferValue(raw: string, maxAllowed: number): string {
  const cap = Math.max(0, roundMoney(maxAllowed));
  if (raw === '') return '';
  const n = parseFloat(raw);
  if (Number.isNaN(n)) return raw;
  if (n < 0) return '0';
  const clamped = Math.min(n, cap);
  if (clamped !== n) return clamped === 0 ? '' : String(clamped);
  return raw;
}

function adminJsonHeaders(): Record<string, string> {
  const csrfToken = document.cookie.split('; ').find((r) => r.startsWith('XSRF-TOKEN='))?.split('=')[1];
  const headers: Record<string, string> = {
    'X-Requested-With': 'XMLHttpRequest',
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (csrfToken) {
    headers['X-XSRF-TOKEN'] = decodeURIComponent(csrfToken);
  }
  return headers;
}

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
  const [editTabItemsOpen, setEditTabItemsOpen] = useState(false);
  const [editTabItemsCheckoutId, setEditTabItemsCheckoutId] = useState<number | null>(null);
  const [editTabItemsDraft, setEditTabItemsDraft] = useState<TabItemLine[]>([]);
  const [editTabItemsRemovedIds, setEditTabItemsRemovedIds] = useState<number[]>([]);
  const [editTabItemsLoading, setEditTabItemsLoading] = useState(false);
  const [editTabItemsSaving, setEditTabItemsSaving] = useState(false);
  const [editTabItemsError, setEditTabItemsError] = useState<string | null>(null);
  const money = (value: number) => `$${(Number(value) || 0).toFixed(2)}`;
  const payGrandTotalNum =
    payModalOpen && summary ? roundMoney(Number(summary.grand_total)) : 0;
  const cardAmountNum = roundMoney(parseFloat(card) || 0);
  const transferAmountNum = roundMoney(parseFloat(transfer) || 0);
  const maxCardAmount =
    payModalOpen && summary ? Math.max(0, payGrandTotalNum - transferAmountNum) : 0;
  const maxTransferAmount =
    payModalOpen && summary ? Math.max(0, payGrandTotalNum - cardAmountNum) : 0;
  const { auth, isAdmin } = usePage().props as { auth?: { user?: { role?: string } }; isAdmin?: boolean };
  const adminEnabled = !!(isAdmin || auth?.user?.role === 'admin');
  const [showAll, setShowAll] = useState(false);
  const [deleteTabConfirmOpen, setDeleteTabConfirmOpen] = useState(false);
  const [deleteTabId, setDeleteTabId] = useState<number | null>(null);
  const [reopenTabConfirmOpen, setReopenTabConfirmOpen] = useState(false);
  const [reopenTabId, setReopenTabId] = useState<number | null>(null);

  useEffect(() => {
    if (!payModalOpen || !summary) return;
    const g = roundMoney(Number(summary.grand_total));
    const d = roundMoney(parseFloat(card) || 0);
    const t = roundMoney(parseFloat(transfer) || 0);
    if (d + t <= g + 0.01) return;
    const newT = Math.min(t, g);
    const newD = Math.min(d, Math.max(0, g - newT));
    setCard(newD === 0 ? '' : String(newD));
    setTransfer(newT === 0 ? '' : String(newT));
  }, [payModalOpen, summary?.checkout_id, summary?.grand_total]);

  const pageErrors = (usePage().props as { errors?: Record<string, string> }).errors ?? {};

  useEffect(() => {
    if (receiptProp) {
setInvoiceReceipt(receiptProp);
}
  }, [receiptProp]);

  useEffect(() => {
    if (!adminEnabled) return;
    const params = new URLSearchParams(window.location.search);
    setShowAll(params.get('all') === '1');
  }, [adminEnabled]);

  const toggleShowAll = () => {
    const next = !showAll;
    setShowAll(next);
    router.get('/checkouts', next ? { all: 1 } : {}, { preserveScroll: true, replace: true });
  };

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

  const openEditTabItems = (checkoutId: number) => {
    setEditTabItemsCheckoutId(checkoutId);
    setEditTabItemsOpen(true);
    setEditTabItemsError(null);
    setEditTabItemsRemovedIds([]);
    setEditTabItemsLoading(true);
    setEditTabItemsDraft([]);
    fetch(`/checkouts/${checkoutId}/summary`)
      .then((res) => {
        if (!res.ok) throw new Error('load');
        return res.json();
      })
      .then((data: CheckoutSummary) => {
        setEditTabItemsDraft(data.tab_items ?? []);
      })
      .catch(() => setEditTabItemsError('Failed to load tab items.'))
      .finally(() => setEditTabItemsLoading(false));
  };

  const closeEditTabItems = () => {
    setEditTabItemsOpen(false);
    setEditTabItemsCheckoutId(null);
    setEditTabItemsDraft([]);
    setEditTabItemsRemovedIds([]);
    setEditTabItemsError(null);
  };

  const saveEditTabItems = async () => {
    if (editTabItemsCheckoutId == null) return;
    setEditTabItemsSaving(true);
    setEditTabItemsError(null);
    const items = [
      ...editTabItemsDraft.map((i) => ({
        id: i.id,
        quantity: Math.max(0, Math.floor(Number(i.quantity) || 0)),
      })),
      ...editTabItemsRemovedIds.map((id) => ({ id, quantity: 0 })),
    ];
    try {
      const res = await fetch(`/admin/checkouts/${editTabItemsCheckoutId}/items`, {
        method: 'PUT',
        headers: adminJsonHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify({ items }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEditTabItemsError(typeof data.message === 'string' ? data.message : 'Could not save items.');
        return;
      }
      closeEditTabItems();
      router.reload({ preserveScroll: true });
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
          ? { ...row, quantity: q, total_price: roundMoney(q * row.unit_price) }
          : row,
      ),
    );
  };

  const handlePayComplete = () => {
    if (!summary || payCheckoutId == null) {
return;
}

    const cashNum = parseFloat(cash) || 0;
    const cardNum = parseFloat(card) || 0;
    const transferNum = parseFloat(transfer) || 0;
    const grandTotal = Math.round(Number(summary.grand_total) * 100) / 100;
    const cardTransferSum = Math.round((cardNum + transferNum) * 100) / 100;
    if (cardTransferSum > grandTotal + 0.01) {
      setPayError(
        `Card plus transfer (${money(cardTransferSum)}) cannot exceed grand total (${money(grandTotal)}). Reduce card or transfer, or use cash for the rest.`,
      );
      return;
    }

    const totalEntered = Math.round((cashNum + cardNum + transferNum) * 100) / 100;
    const change = Math.round((totalEntered - grandTotal) * 100) / 100;

    if (totalEntered + 1e-9 < grandTotal) {
      setPayError(`Total paid (${money(totalEntered)}) must be at least grand total (${money(grandTotal)}).`);
      return;
    }

    if (change > 0.01 && cashNum + 1e-9 < change) {
      setPayError(
        `Change is ${money(change)}. Cash (${money(cashNum)}) must cover change when the customer is due cash back.`,
      );
      return;
    }

    const cashApplied = change > 0.01 ? Math.round((cashNum - change) * 100) / 100 : cashNum;
    if (cashApplied < -0.01) {
      setPayError('Invalid cash amount.');
      return;
    }

    setPayError(null);
    const payments: { method: string; amount: number }[] = [];
    if (cardNum > 0) {
      payments.push({ method: 'card', amount: cardNum });
    }
    if (transferNum > 0) {
      payments.push({ method: 'transfer_qr', amount: transferNum });
    }
    if (cashApplied > 0) {
      payments.push({ method: 'cash', amount: cashApplied });
    }

    const paymentsSum = Math.round(payments.reduce((s, p) => s + p.amount, 0) * 100) / 100;
    if (Math.abs(paymentsSum - grandTotal) > 0.02) {
      setPayError('Could not balance payment split. Check amounts.');
      return;
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

  const confirmDeleteTab = async () => {
    if (deleteTabId == null) return;
    const res = await fetch(`/admin/checkouts/${deleteTabId}/void`, {
      method: 'POST',
      headers: adminJsonHeaders(),
      credentials: 'same-origin',
      body: '{}',
    });
    const data = await res.json().catch(() => ({}));
    setDeleteTabConfirmOpen(false);
    setDeleteTabId(null);
    if (!res.ok) {
      alert(data.message || 'Failed to delete tab.');
      return;
    }
    router.get('/checkouts', showAll ? { all: 1 } : {}, { preserveScroll: true, replace: true });
  };

  const confirmReopenTab = async () => {
    if (reopenTabId == null) return;
    const res = await fetch(`/admin/checkouts/${reopenTabId}/reopen`, {
      method: 'POST',
      headers: adminJsonHeaders(),
      credentials: 'same-origin',
      body: '{}',
    });
    const data = await res.json().catch(() => ({}));
    setReopenTabConfirmOpen(false);
    setReopenTabId(null);
    if (!res.ok) {
      alert(data.message || 'Failed to reopen tab.');
      return;
    }
    router.get('/checkouts', showAll ? { all: 1 } : {}, { preserveScroll: true, replace: true });
  };

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title="Open tab" />
      <div className="flex flex-1 flex-col gap-4 rounded-xl p-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">Open tab</h1>
          <div className="flex items-center gap-2">
            {adminEnabled && (
              <Button variant="outline" size="sm" onClick={toggleShowAll}>
                {showAll ? 'Show open only' : 'Show all'}
              </Button>
            )}
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

        <AlertDialog
          open={deleteTabConfirmOpen}
          onOpenChange={(open) => {
            setDeleteTabConfirmOpen(open);
            if (!open) setDeleteTabId(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete tab?</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTabId != null
                  ? `Tab #${deleteTabId} will be closed without payment. This cannot be undone.`
                  : ''}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={confirmDeleteTab}
              >
                Delete tab
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={reopenTabConfirmOpen}
          onOpenChange={(open) => {
            setReopenTabConfirmOpen(open);
            if (!open) setReopenTabId(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reopen tab?</AlertDialogTitle>
              <AlertDialogDescription>
                {reopenTabId != null
                  ? `A new open tab will be created with the same items as Tab #${reopenTabId}.`
                  : ''}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmReopenTab}>Reopen</AlertDialogAction>
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
                  {adminEnabled && row.status === 'open' && (
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => openEditTabItems(row.id)}>
                      <Pencil className="h-3.5 w-3.5" />
                      Edit items
                    </Button>
                  )}
                  <Button size="sm" onClick={() => openPayModal(row.id)}>
                    Pay now
                  </Button>
                  {adminEnabled && row.status !== 'open' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setReopenTabId(row.id);
                        setReopenTabConfirmOpen(true);
                      }}
                    >
                      Reopen
                    </Button>
                  )}
                  {adminEnabled && row.status === 'open' && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        setDeleteTabId(row.id);
                        setDeleteTabConfirmOpen(true);
                      }}
                    >
                      Delete
                    </Button>
                  )}
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

        <Dialog
          open={editTabItemsOpen}
          onOpenChange={(open) => {
            if (!open) closeEditTabItems();
          }}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit tab items — #{editTabItemsCheckoutId ?? ''}</DialogTitle>
              <DialogDescription>
                Change quantities or remove product lines on this open tab. Time and table session charges are not edited here. Use <span className="font-medium">Add item</span> to add products.
              </DialogDescription>
            </DialogHeader>
            {editTabItemsLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {!editTabItemsLoading && editTabItemsDraft.length === 0 && (
              <p className="text-sm text-muted-foreground">No product lines on this tab yet.</p>
            )}
            {!editTabItemsLoading && editTabItemsDraft.length > 0 && (
              <ul className="max-h-64 space-y-3 overflow-y-auto text-sm">
                {editTabItemsDraft.map((line) => (
                  <li
                    key={line.id}
                    className="flex flex-col gap-2 rounded-md border border-border/80 bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{line.product_name ?? 'Item'}</div>
                      <div className="text-xs text-muted-foreground">
                        {money(line.unit_price)} each · line {money(line.total_price)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="sr-only" htmlFor={`tab-qty-${line.id}`}>
                        Quantity
                      </Label>
                      <Input
                        id={`tab-qty-${line.id}`}
                        type="number"
                        min={1}
                        className="h-9 w-20"
                        value={line.quantity}
                        onChange={(e) => updateEditTabQty(line.id, Number(e.target.value) || 1)}
                      />
                      <Button type="button" size="sm" variant="destructive" onClick={() => removeEditTabLine(line.id)}>
                        Remove
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {editTabItemsError && <p className="text-sm text-destructive">{editTabItemsError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeEditTabItems} disabled={editTabItemsSaving}>
                Close
              </Button>
              <Button
                type="button"
                onClick={saveEditTabItems}
                disabled={
                  editTabItemsSaving ||
                  editTabItemsLoading ||
                  (editTabItemsDraft.length === 0 && editTabItemsRemovedIds.length === 0)
                }
              >
                {editTabItemsSaving ? 'Saving…' : 'Save changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={payModalOpen} onOpenChange={(open) => !open && closePayModal()}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Pay tab — {summary?.table_name ?? 'Open tab'}</DialogTitle>
              <DialogDescription>
                Card and transfer cannot exceed the grand total together; use cash for tips or change. Change is taken from the cash portion.
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
                  {(() => {
                    const c = parseFloat(cash) || 0;
                    const d = parseFloat(card) || 0;
                    const t = parseFloat(transfer) || 0;
                    const g = Number(summary.grand_total) || 0;
                    const entered = Math.round((c + d + t) * 100) / 100;
                    const ch = Math.round((entered - g) * 100) / 100;
                    if (c <= 0 && d <= 0 && t <= 0) return null;
                    return (
                      <>
                        {d > 0 && (
                          <div className="flex justify-between border-t border-border/60 pt-2">
                            <span className="text-muted-foreground">Card</span>
                            <span>{money(d)}</span>
                          </div>
                        )}
                        {t > 0 && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Transfer</span>
                            <span>{money(t)}</span>
                          </div>
                        )}
                        {c > 0 && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Cash</span>
                            <span>{money(c)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-muted-foreground">
                          <span>Total received</span>
                          <span>{money(entered)}</span>
                        </div>
                        {ch > 0.01 && (
                          <div className="flex justify-between font-medium text-emerald-600 dark:text-emerald-400">
                            <span>Change</span>
                            <span>- {money(ch)}</span>
                          </div>
                        )}
                      </>
                    );
                  })()}
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
                      max={maxCardAmount}
                      placeholder="0"
                      title={`Max ${money(maxCardAmount)} (with current transfer)`}
                      value={card}
                      onChange={(e) => {
                        setPayError(null);
                        setCard(limitCardOrTransferValue(e.target.value, maxCardAmount));
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="w-24 shrink-0">Transfer (QR)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      max={maxTransferAmount}
                      placeholder="0"
                      title={`Max ${money(maxTransferAmount)} (with current card)`}
                      value={transfer}
                      onChange={(e) => {
                        setPayError(null);
                        setTransfer(limitCardOrTransferValue(e.target.value, maxTransferAmount));
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
