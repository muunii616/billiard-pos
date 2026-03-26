import { Head, router, usePage, useRemember } from '@inertiajs/react';
import { Play, Pause, ShoppingCart, ListChecks, Square, Pencil, Plus } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
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
import tablesRoutes from '@/routes/tables';
import type { BreadcrumbItem } from '@/types';

type SessionItem = {
  id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
};

type TableSession = {
  id: number;
  status: string;
  elapsed: string | null;
  elapsed_seconds: number | null;
  last_resume_at: string | null;
  ended_at: string | null;
  time_total: string;
  items: SessionItem[];
};

type Table = {
  id: number;
  name: string;
  status: string;
  current_session: TableSession | null;
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
  started_at?: string;
  ended_at?: string;
  duration_formatted?: string;
  rate_per_minute?: number;
  line_items: InvoiceLineItem[];
  payments: { method: string; amount: number }[];
};

type Props = {
  tables: Table[];
  products: {
    id: number;
    name: string;
    price: string;
    category: string;
  }[];
  receipt?: InvoiceReceipt | null;
  isAdmin?: boolean;
};

const breadcrumbs: BreadcrumbItem[] = [
  {
    title: 'Tables',
    href: '/tables',
  },
];

type CheckoutSummary = {
  table_id: number;
  table_name: string;
  session_id: number;
  time_total: number;
  items_total: number;
  grand_total: number;
};

function formatElapsedSeconds(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');

  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

export default function TablesIndex({ tables, products, receipt: receiptProp, isAdmin = false }: Props) {
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutSummary, setCheckoutSummary] = useState<CheckoutSummary | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutTableId, setCheckoutTableId] = useState<number | null>(null);
  const [frozenElapsedSeconds, setFrozenElapsedSeconds] = useState<number | null>(null);
  const [cash, setCash] = useState('');
  const [card, setCard] = useState('');
  const [transfer, setTransfer] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [invoiceReceipt, setInvoiceReceipt] = useState<InvoiceReceipt | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [emailSending, setEmailSending] = useState(false);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [checkoutWasPaused, setCheckoutWasPaused] = useState(false);
  const [endChoiceOpen, setEndChoiceOpen] = useState(false);
  const [endChoiceTableId, setEndChoiceTableId] = useState<number | null>(null);
  const [endChoiceSummary, setEndChoiceSummary] = useState<CheckoutSummary | null>(null);
  const [endChoiceWasPaused, setEndChoiceWasPaused] = useState(false);
  const [showExistingTabPicker, setShowExistingTabPicker] = useState(false);
  const [existingTabLoading, setExistingTabLoading] = useState(false);
  const [existingTabOptions, setExistingTabOptions] = useState<{ id: number; label: string }[]>([]);
  const [selectedExistingTabId, setSelectedExistingTabId] = useState<number | null>(null);
  const [existingTabError, setExistingTabError] = useState<string | null>(null);
  const [detailsTable, setDetailsTable] = useState<Table | null>(null);
  const [editTable, setEditTable] = useState<Table | null>(null);
  const [editName, setEditName] = useState('');
  const [addTableOpen, setAddTableOpen] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [addItemModalOpen, setAddItemModalOpen] = useState(false);
  const [addItemTableId, setAddItemTableId] = useState<number | null>(null);
  const [addItemSearch, setAddItemSearch] = useState('');
  const [addItemCategory, setAddItemCategory] = useState<string>('all');
  const [addItemCart, setAddItemCart] = useState<{ productId: number; name: string; price: number; quantity: number; category: string }[]>([]);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [activeMobileTableId, setActiveMobileTableId] = useRemember<number | null>(null, 'tables.activeMobileTableId');
  const money = (value: number) => `$${(Number(value) || 0).toFixed(2)}`;

  const pageErrors = (usePage().props as { errors?: Record<string, string> }).errors ?? {};

  // Show invoice modal when we have receipt from redirect
  useEffect(() => {
    if (receiptProp) {
setInvoiceReceipt(receiptProp);
}
  }, [receiptProp]);

  // Live timer: tick every second
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(id);
  }, []);

  // Touch/click mode for mobile/tablet: no hover, reveal actions on tap.
  useEffect(() => {
    const media = window.matchMedia('(hover: none), (pointer: coarse)');
    const sync = () => {
      const touch = media.matches || (navigator.maxTouchPoints ?? 0) > 0;
      setIsTouchDevice(touch);

      if (!touch) {
setActiveMobileTableId(null);
}
    };
    sync();
    media.addEventListener('change', sync);

    return () => media.removeEventListener('change', sync);
  }, []);

  const getElapsedSeconds = useCallback((table: Table): number | null => {
    const session = table.current_session;

    if (!session) {
return null;
}

    const base = session.elapsed_seconds ?? 0;

    if (session.status === 'paused') {
      return base;
    }

    if (!session.last_resume_at) {
      return base;
    }

    const resumeMs = new Date(session.last_resume_at).getTime();

    return base + Math.max(0, Math.floor((now - resumeMs) / 1000));
  }, [now]);

  const getDisplayTime = useCallback((table: Table): string => {
    if (table.id === checkoutTableId && frozenElapsedSeconds !== null) {
      return formatElapsedSeconds(frozenElapsedSeconds);
    }

    const sec = getElapsedSeconds(table);

    return sec !== null ? formatElapsedSeconds(sec) : (table.current_session?.elapsed ?? '00:00:00');
  }, [checkoutTableId, frozenElapsedSeconds, getElapsedSeconds]);

  // Show server error in modal when checkout is open
  useEffect(() => {
    if (checkoutOpen && pageErrors.payments) {
      setCheckoutError(pageErrors.payments);
    }
  }, [checkoutOpen, pageErrors.payments]);

  const handleAction = (tableId: number, action: 'start' | 'pause' | 'resume' | 'end') => {
    if (action === 'end') {
      setCheckoutLoading(true);
      setCheckoutError(null);
      fetch(`/tables/${tableId}/checkout-summary`)
        .then((res) => {
          if (!res.ok) {
throw new Error('Could not load summary');
}

          return res.json();
        })
        .then((data: CheckoutSummary) => {
          const t = tables.find((tbl) => tbl.id === data.table_id);
          const wasRunning = t?.status === 'running';

          if (wasRunning) {
            setEndChoiceWasPaused(true);
            router.post(tablesRoutes.pause.url({ table: data.table_id }));
          }

          setEndChoiceTableId(data.table_id);
          setEndChoiceSummary(data);
          setEndChoiceOpen(true);
        })
        .catch(() => setCheckoutError('Failed to load checkout summary.'))
        .finally(() => setCheckoutLoading(false));

      return;
    }

    const routeDef = tablesRoutes[action]({ table: tableId });
    router.post(routeDef.url);
  };

  const closeEndChoice = () => {
    const tableId = endChoiceTableId;
    const wasPaused = endChoiceWasPaused;
    setShowExistingTabPicker(false);
    setExistingTabLoading(false);
    setExistingTabOptions([]);
    setSelectedExistingTabId(null);
    setExistingTabError(null);
    setEndChoiceOpen(false);
    setEndChoiceTableId(null);
    setEndChoiceSummary(null);
    setEndChoiceWasPaused(false);

    if (wasPaused && tableId != null) {
      router.post(tablesRoutes.resume.url({ table: tableId }));
    }
  };

  const openPayNowModal = () => {
    if (!endChoiceSummary) {
return;
}

    setCash('');
    setCard('');
    setTransfer('');
    setCustomerEmail('');
    setCheckoutSummary(endChoiceSummary);
    setCheckoutTableId(endChoiceSummary.table_id);
    const t = tables.find((tbl) => tbl.id === endChoiceSummary.table_id);
    const session = t?.current_session;
    let sec = 0;

    if (session) {
      const base = session.elapsed_seconds ?? 0;

      if (session.status === 'paused') {
        sec = base;
      } else if (session.last_resume_at) {
        sec = base + Math.max(0, Math.floor((Date.now() - new Date(session.last_resume_at).getTime()) / 1000));
      } else {
        sec = base;
      }
    }

    setFrozenElapsedSeconds(sec);
    setCheckoutWasPaused(endChoiceWasPaused);
    setCheckoutOpen(true);
    setShowExistingTabPicker(false);
    setExistingTabLoading(false);
    setExistingTabOptions([]);
    setSelectedExistingTabId(null);
    setExistingTabError(null);
    setEndChoiceOpen(false);
    setEndChoiceTableId(null);
    setEndChoiceSummary(null);
    setEndChoiceWasPaused(false);
  };

  const handleMoveToOpenTab = () => {
    if (endChoiceTableId == null) {
return;
}

    router.post(`/tables/${endChoiceTableId}/move-to-checkout`, {}, {
      onSuccess: () => {
        setShowExistingTabPicker(false);
        setExistingTabLoading(false);
        setExistingTabOptions([]);
        setSelectedExistingTabId(null);
        setExistingTabError(null);
        setEndChoiceOpen(false);
        setEndChoiceTableId(null);
        setEndChoiceSummary(null);
        setEndChoiceWasPaused(false);
        // Stay on Tables; server redirects back here.
      },
    });
  };

  const handleMoveToExistingTab = async () => {
    if (endChoiceTableId == null) {
return;
}

    setShowExistingTabPicker(true);
    setExistingTabLoading(true);
    setExistingTabError(null);
    setExistingTabOptions([]);
    setSelectedExistingTabId(null);

    try {
      const res = await fetch('/checkouts/options');

      if (!res.ok) {
        setExistingTabError('Could not load open tabs.');

        return;
      }

      const options: { id: number; label: string }[] = await res.json();
      setExistingTabOptions(options);

      if (!options.length) {
        setExistingTabError('No open tabs available. Create a new tab instead.');

        return;
      }

      setSelectedExistingTabId(options[0].id);
    } catch {
      setExistingTabError('Failed to load open tabs.');
    } finally {
      setExistingTabLoading(false);
    }
  };

  const handleConfirmMoveToExistingTab = () => {
    if (endChoiceTableId == null || selectedExistingTabId == null) {
return;
}

    router.post(`/tables/${endChoiceTableId}/move-to-checkout`, { checkout_session_id: selectedExistingTabId }, {
      onSuccess: () => {
        setShowExistingTabPicker(false);
        setExistingTabLoading(false);
        setExistingTabOptions([]);
        setSelectedExistingTabId(null);
        setExistingTabError(null);
        setEndChoiceOpen(false);
        setEndChoiceTableId(null);
        setEndChoiceSummary(null);
        setEndChoiceWasPaused(false);
      },
    });
  };

  const closeCheckout = (skipResume = false) => {
    const tableId = checkoutTableId;
    const wasPaused = checkoutWasPaused;
    setCheckoutOpen(false);
    setCheckoutSummary(null);
    setCheckoutTableId(null);
    setFrozenElapsedSeconds(null);
    setCheckoutWasPaused(false);

    if (!skipResume && wasPaused && tableId != null) {
      router.post(tablesRoutes.resume.url({ table: tableId }));
    }
  };

  const handleCheckoutComplete = () => {
    if (!checkoutSummary) {
return;
}

    const cashNum = parseFloat(cash) || 0;
    const cardNum = parseFloat(card) || 0;
    const transferNum = parseFloat(transfer) || 0;
    const totalPaid = Math.round((cashNum + cardNum + transferNum) * 100) / 100;
    const grandTotal = Number(checkoutSummary.grand_total);
    const grandTotalCents = Math.round(grandTotal * 100);
    const totalPaidCents = Math.round(totalPaid * 100);

    if (totalPaidCents !== grandTotalCents) {
      setCheckoutError(`Total paid (${money(totalPaid)}) must equal grand total (${money(grandTotal)}).`);

      return;
    }

    setCheckoutError(null);
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

    const url = tablesRoutes.end.url({ table: checkoutSummary.table_id });
    const payload: { payments: { method: string; amount: number }[]; customer_email?: string } = { payments };

    if (customerEmail.trim()) {
payload.customer_email = customerEmail.trim();
}

    setSubmitting(true);
    router.post(url, payload, {
      onSuccess: (visit: { page?: { props?: { errors?: Record<string, string> } } }) => {
        setSubmitting(false);
        const err = visit?.page?.props?.errors?.payments;

        if (err) {
          setCheckoutError(err);

          return;
        }

        closeCheckout(true);
      },
      onError: () => setSubmitting(false),
      onFinish: () => setSubmitting(false),
    });
  };

  const handlePrintInvoice = () => {
    // Mockup: no-op or could call window.print() on the invoice content
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

  const handleAddItem = (tableId: number) => {
    if (products.length === 0) {
      alert('No products available.');

      return;
    }

    setAddItemTableId(tableId);
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

  const handleConfirmAddItemTable = () => {
    if (!addItemTableId || addItemCart.length === 0) {
return;
}

    const items = addItemCart.map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
    }));
    router.post(`/tables/${addItemTableId}/items/bulk`, { items }, {
      onSuccess: () => {
        setAddItemModalOpen(false);
        setAddItemTableId(null);
        setAddItemCart([]);
      },
    });
  };

  const openDetails = (table: Table) => {
    if (table.current_session) {
setDetailsTable(table);
}
  };
  const openEdit = (table: Table) => {
    setEditTable(table);
    setEditName(table.name);
    setDeleteConfirm(false);
  };
  const handleSaveEdit = () => {
    if (!editTable) {
return;
}

    router.put(`/admin/tables/${editTable.id}`, { name: editName }, { onSuccess: () => setEditTable(null) });
  };
  const handleDeleteTable = () => {
    if (!editTable) {
return;
}

    router.delete(`/admin/tables/${editTable.id}`, { onSuccess: () => {
 setEditTable(null); setDeleteConfirm(false); 
} });
  };
  const handleAddTable = () => {
    const name = newTableName.trim();

    if (!name) {
return;
}

    router.post('/admin/tables', { name }, { onSuccess: () => {
 setAddTableOpen(false); setNewTableName(''); 
} });
  };

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title="Tables" />
      <div className="flex flex-1 flex-col gap-6 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Tables</h1>
          {isAdmin && (
            <Button onClick={() => setAddTableOpen(true)} size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              Add table
            </Button>
          )}
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {tables.map((table) => {
            const hasSession = table.current_session && ['running', 'paused'].includes(table.current_session.status);
            const isAvailable = table.status === 'available';
            const isRunning = table.status === 'running';
            const isPaused = table.status === 'paused';
            const isMaintenance = table.status === 'maintenance';
            const showTimer = hasSession;

            // Glow by status — visible but not harsh
            const glowClass = isMaintenance
              ? 'shadow-[0_0_28px_rgba(244,63,94,0.5)] ring-[3px] ring-rose-500/60'
              : isPaused
                ? 'shadow-[0_0_28px_rgba(245,158,11,0.5)] ring-[3px] ring-amber-500/60'
                : isRunning
                  ? 'shadow-[0_0_28px_rgba(16,185,129,0.5)] ring-[3px] ring-emerald-500/60'
                  : 'shadow-[0_0_24px_rgba(34,197,94,0.4)] ring-[3px] ring-emerald-500/50';

            return (
              <div key={table.id} className="group flex flex-col items-center">
                {/* Name pill above table */}
                <span
                  className={`mb-2 rounded-full px-3 py-1 text-sm font-semibold ${
                    hasSession ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' : 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                  }`}
                >
                  {table.name}
                </span>

                {/* Billiard table: portrait (faces upward), buttons on the table like sample */}
                <div
                  className={`relative w-full max-w-[180px] rounded-xl transition-shadow duration-300 ${glowClass}`}
                  onClick={() => {
                    if (!isTouchDevice) {
return;
}

                    setActiveMobileTableId(table.id);
                  }}
                >
                  <div className="relative rounded-lg border-[5px] border-amber-800/90 bg-amber-900/80 p-1.5 shadow-inner">
                    {/* 6 pockets: 4 corners + 2 side (portrait) */}
                    <div className="absolute left-0 top-0 h-3 w-3 rounded-full bg-black" />
                    <div className="absolute right-0 top-0 h-3 w-3 rounded-full bg-black" />
                    <div className="absolute left-0 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-black" />
                    <div className="absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-black" />
                    <div className="absolute bottom-0 left-0 h-3 w-3 rounded-full bg-black" />
                    <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-black" />

                    {/* Felt: portrait — taller than wide, compact proportion */}
                    <div className="relative flex aspect-[1/1.85] min-h-[180px] w-full flex-col rounded-md bg-slate-700">
                      {/* Timer (top) */}
                      <div className="flex flex-1 items-center justify-center px-2 pt-3">
                        {showTimer && (
                          <span className="font-mono text-xl font-semibold tabular-nums text-emerald-400">
                            {getDisplayTime(table)}
                          </span>
                        )}
{!showTimer && (
                        <span className="text-sm text-slate-500">—</span>
                      )}
                      </div>
                      {/* Buttons on the table (bottom), visible on hover */}
                      <div
                        className={`flex flex-wrap items-center justify-center gap-1.5 px-2 pb-3 transition-opacity duration-200 ${
                          isTouchDevice
                            ? activeMobileTableId === table.id
                              ? 'opacity-100 pointer-events-auto'
                              : 'opacity-0 pointer-events-none'
                            : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto'
                        }`}
                        onClick={(e) => {
                          // Prevent mobile tap on action buttons from toggling card visibility.
                          e.stopPropagation();
                        }}
                      >
                    {isAvailable && (
                      <Button
                        size="sm"
                        className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => handleAction(table.id, 'start')}
                      >
                        <Play className="h-4 w-4" />
                        Start
                      </Button>
                    )}
                    {(isRunning || isPaused) && (
                      <>
                        <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => openDetails(table)}>
                          <ListChecks className="h-4 w-4" />
                          Details
                        </Button>
                        <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700" onClick={() => handleAddItem(table.id)}>
                          <ShoppingCart className="h-4 w-4" />
                          Add item
                        </Button>
                        {isRunning ? (
                          <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => handleAction(table.id, 'pause')}>
                            <Pause className="h-4 w-4" />
                            Pause
                          </Button>
                        ) : (
                          <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => handleAction(table.id, 'resume')}>
                            <Play className="h-4 w-4" />
                            Resume
                          </Button>
                        )}
                        <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => handleAction(table.id, 'end')}>
                          <Square className="h-4 w-4" />
                          End
                        </Button>
                      </>
                    )}
                    {isAdmin && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 border-slate-500 bg-slate-800/80 text-slate-200 hover:bg-slate-700"
                        onClick={() => openEdit(table)}
                      >
                        <Pencil className="h-4 w-4" />
                        Edit
                      </Button>
                    )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <Dialog open={endChoiceOpen} onOpenChange={(open) => !open && closeEndChoice()}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>End session — {endChoiceSummary?.table_name ?? 'Table'}</DialogTitle>
              <DialogDescription>
                Grand total: {endChoiceSummary ? money(endChoiceSummary.grand_total) : '$0.00'}. Choose how to proceed.
              </DialogDescription>
            </DialogHeader>
            {endChoiceSummary && !showExistingTabPicker && (
              <DialogFooter className="flex-col gap-2 sm:flex-row">
                <Button className="w-full sm:w-auto" onClick={openPayNowModal}>
                  Pay now
                </Button>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                  <Button className="flex-1" variant="outline" onClick={handleMoveToOpenTab}>
                    New tab
                  </Button>
                  <Button className="flex-1" variant="outline" onClick={handleMoveToExistingTab}>
                    Add to existing tab
                  </Button>
                </div>
              </DialogFooter>
            )}
            {endChoiceSummary && showExistingTabPicker && (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Open tabs</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Select one tab to merge this table session into.
                  </p>
                </div>
                <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-sidebar-border/70 bg-muted/20 p-2">
                  {existingTabLoading && <p className="text-sm text-muted-foreground">Loading tabs...</p>}
                  {!existingTabLoading && existingTabOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setSelectedExistingTabId(option.id)}
                      className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                        selectedExistingTabId === option.id
                          ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                          : 'border-sidebar-border/70 bg-background hover:bg-accent'
                      }`}
                    >
                      <div className="font-medium">{option.label}</div>
                    </button>
                  ))}
                  {!existingTabLoading && existingTabOptions.length === 0 && !existingTabError && (
                    <p className="text-sm text-muted-foreground">No open tabs available.</p>
                  )}
                </div>
                {existingTabError && (
                  <p className="text-sm text-destructive">{existingTabError}</p>
                )}
                <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
                  <Button
                    className="w-full sm:w-auto"
                    variant="ghost"
                    onClick={() => {
                      setShowExistingTabPicker(false);
                      setExistingTabLoading(false);
                      setExistingTabOptions([]);
                      setSelectedExistingTabId(null);
                      setExistingTabError(null);
                    }}
                  >
                    Back
                  </Button>
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                    <Button
                      className="w-full sm:w-auto"
                      variant="outline"
                      onClick={handleMoveToOpenTab}
                    >
                      New tab instead
                    </Button>
                    <Button
                      className="w-full sm:w-auto"
                      disabled={selectedExistingTabId == null || existingTabLoading}
                      onClick={handleConfirmMoveToExistingTab}
                    >
                      Move to selected tab
                    </Button>
                  </div>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Details modal: timer (live) + session items */}
        <Dialog open={!!detailsTable} onOpenChange={(open) => !open && setDetailsTable(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{detailsTable?.name} — Details</DialogTitle>
              <DialogDescription>Session in progress. Timer keeps running.</DialogDescription>
            </DialogHeader>
            {detailsTable?.current_session && (
              <div className="space-y-4">
                <div className="rounded-lg bg-slate-800/50 p-3 text-center">
                  <span className="font-mono text-2xl font-semibold tabular-nums text-emerald-400">
                    {getDisplayTime(detailsTable)}
                  </span>
                </div>
                <div>
                  <h4 className="mb-2 text-sm font-medium text-muted-foreground">Items</h4>
                  {detailsTable.current_session.items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No items yet.</p>
                  ) : (
                    <ul className="space-y-1.5 text-sm">
                      {detailsTable.current_session.items.map((item) => (
                        <li key={item.id} className="flex justify-between">
                          <span>{item.product_name} × {item.quantity}</span>
                          <span className="tabular-nums">{money(item.total_price || 0)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDetailsTable(null)}>Close</Button>
                  <Button onClick={() => {
 if (detailsTable) {
handleAddItem(detailsTable.id);
}

 setDetailsTable(null); 
}} className="gap-1.5">
                    <ShoppingCart className="h-4 w-4" />
                    Add item
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Add item modal for a table session */}
        <Dialog open={addItemModalOpen} onOpenChange={(open) => !open && setAddItemModalOpen(false)}>
          <DialogContent className="w-[calc(100vw-1rem)] max-h-[90vh] overflow-y-auto sm:max-w-5xl">
            <DialogHeader>
              <DialogTitle>Add Items</DialogTitle>
              <DialogDescription>
                Search and add multiple products to this table&apos;s session.
              </DialogDescription>
            </DialogHeader>

            {/* Shell */}
            <div className="mt-2 rounded-xl border border-sidebar-border/70 bg-background/95 p-3 shadow-sm dark:border-sidebar-border sm:p-4">
              {/* Global search (top, full width) */}
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
                    <div className="grid max-h-[34vh] grid-cols-1 gap-3 overflow-y-auto text-sm sm:grid-cols-2 lg:max-h-none lg:h-full">
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
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => setAddItemModalOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={handleConfirmAddItemTable}
                      disabled={addItemCart.length === 0}
                    >
                      Add items
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit table modal (admin) */}
        <Dialog open={!!editTable} onOpenChange={(open) => !open && setEditTable(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Edit table</DialogTitle>
              <DialogDescription>Change name or delete this table.</DialogDescription>
            </DialogHeader>
            {editTable && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Name</Label>
                  <Input
                    id="edit-name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Table name"
                  />
                </div>
                <DialogFooter className="flex flex-col gap-2 sm:flex-row">
                  <Button variant="outline" onClick={() => setEditTable(null)}>Cancel</Button>
                  <Button onClick={handleSaveEdit}>Save</Button>
                  {!deleteConfirm ? (
                    <Button variant="destructive" onClick={() => setDeleteConfirm(true)}>Delete table</Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(false)}>Cancel</Button>
                      <Button variant="destructive" size="sm" onClick={handleDeleteTable}>Confirm delete</Button>
                    </div>
                  )}
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Add table modal (admin) */}
        <Dialog open={addTableOpen} onOpenChange={(open) => !open && setAddTableOpen(false)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Add table</DialogTitle>
              <DialogDescription>Create a new billiard table.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-table-name">Name</Label>
                <Input
                  id="new-table-name"
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value)}
                  placeholder="e.g. Table 1"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddTableOpen(false)}>Cancel</Button>
                <Button onClick={handleAddTable} disabled={!newTableName.trim()}>Add table</Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={checkoutOpen} onOpenChange={(open) => !open && closeCheckout()}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Checkout — {checkoutSummary?.table_name ?? 'Table'}</DialogTitle>
              <DialogDescription>Split payment across cash, card, or transfer. Total paid must equal grand total.</DialogDescription>
            </DialogHeader>
            {checkoutSummary && (
              <>
                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Time</span>
                    <span>{money(checkoutSummary.time_total)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Items</span>
                    <span>{money(checkoutSummary.items_total)}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>Grand total</span>
                    <span>{money(checkoutSummary.grand_total)}</span>
                  </div>
                </div>
                <div className="grid gap-3">
                  <div className="flex items-center gap-2">
                    <Label className="w-24 shrink-0">Cash</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0"
                      value={cash}
                      onChange={(e) => {
 setCash(e.target.value); setCheckoutError(null); 
}}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="w-24 shrink-0">Card</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0"
                      value={card}
                      onChange={(e) => {
 setCard(e.target.value); setCheckoutError(null); 
}}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="w-24 shrink-0">Transfer (QR)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0"
                      value={transfer}
                      onChange={(e) => {
 setTransfer(e.target.value); setCheckoutError(null); 
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
                {checkoutError && (
                  <p className="text-sm text-destructive">{checkoutError}</p>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={closeCheckout} disabled={submitting}>
                    Cancel
                  </Button>
                  <Button onClick={handleCheckoutComplete} disabled={submitting}>
                    {submitting ? 'Completing…' : 'Complete checkout'}
                  </Button>
                </DialogFooter>
              </>
            )}
            {checkoutLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          </DialogContent>
        </Dialog>

        <Dialog open={!!invoiceReceipt} onOpenChange={(open) => !open && setInvoiceReceipt(null)}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Invoice Details</DialogTitle>
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
                  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-muted-foreground/40 bg-muted/30 p-4 text-center text-sm text-muted-foreground">
                    <span className="font-medium">QR Code placeholder</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                    <span>Customer:</span>
                    <span className="text-foreground">{invoiceReceipt.customer_email || '—'}</span>
                    <span>Table:</span>
                    <span className="text-foreground">{invoiceReceipt.table_name}</span>
                  </div>
                  <div className="border-t pt-2 mt-2">
                    <div className="text-xs font-medium text-muted-foreground mb-1">Qty · Description · Subtotal</div>
                    {invoiceReceipt.line_items.map((item, i) => (
                      <div key={i} className="flex justify-between text-sm py-0.5">
                        <span>
                          {item.type === 'time' ? `${item.duration} @ ${item.rate}/min` : `${item.quantity} × ${item.description}`}
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
                {emailMessage && (
                  <p className="text-sm text-muted-foreground">{emailMessage}</p>
                )}
                <DialogFooter className="flex-row gap-2 sm:gap-0">
                  <Button variant="outline" onClick={handlePrintInvoice}>
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

