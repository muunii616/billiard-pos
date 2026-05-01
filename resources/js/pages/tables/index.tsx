import { Head, router, usePage, useRemember } from '@inertiajs/react';
import { Play, Pause, ShoppingCart, ListChecks, Square, Pencil, Plus, CheckCircle2Icon } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import InvoiceDialog from '@/components/invoice-dialog';
import type {InvoiceReceipt} from '@/components/invoice-dialog';
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
  AlertDialogTrigger,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import {
  buildExactSettlementPayments,
  clampNonCashInput,
  formatMoney,
  paymentPreview,
  roundMoney,
} from '@/lib/payments';
import receiptsRoutes from '@/routes/receipts';
import tablesRoutes from '@/routes/tables';
import type { BreadcrumbItem } from '@/types';

type SessionItem = {
  id: number;
  product_id: number | null;
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
  const [deleteAlertOpen, setDeleteAlertOpen] = useState(false);
  const [cancelSessionOpen, setCancelSessionOpen] = useState(false);
  const [cancelSessionTableId, setCancelSessionTableId] = useState<number | null>(null);
  const [cancelSessionSubmitting, setCancelSessionSubmitting] = useState(false);
  const [cancelSessionError, setCancelSessionError] = useState<string | null>(null);
  const [editSessionItemsOpen, setEditSessionItemsOpen] = useState(false);
  const [editSessionTableId, setEditSessionTableId] = useState<number | null>(null);
  const [editSessionDraft, setEditSessionDraft] = useState<SessionItem[]>([]);
  const [editSessionRemovedIds, setEditSessionRemovedIds] = useState<number[]>([]);
  const [editSessionSaving, setEditSessionSaving] = useState(false);
  const [editSessionError, setEditSessionError] = useState<string | null>(null);
  const [addItemModalOpen, setAddItemModalOpen] = useState(false);
  const [addItemTableId, setAddItemTableId] = useState<number | null>(null);
  const [addItemSearch, setAddItemSearch] = useState('');
  const [addItemCategory, setAddItemCategory] = useState<string>('all');
  const [addItemCart, setAddItemCart] = useState<{ productId: number; name: string; price: number; quantity: number; category: string }[]>([]);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [activeMobileTableId, setActiveMobileTableId] = useRemember<number | null>(null, 'tables.activeMobileTableId');
  const [tabSuccessMessage, setTabSuccessMessage] = useState<string | null>(null);
  const [tabErrorMessage, setTabErrorMessage] = useState<string | null>(null);
  const money = formatMoney;
  const checkoutGrandTotalNum =
    checkoutOpen && checkoutSummary ? roundMoney(Number(checkoutSummary.grand_total)) : 0;
  const checkoutCardNum = roundMoney(parseFloat(card) || 0);
  const checkoutTransferNum = roundMoney(parseFloat(transfer) || 0);
  const maxCardAmount =
    checkoutOpen && checkoutSummary
      ? Math.max(0, checkoutGrandTotalNum - checkoutTransferNum)
      : 0;
  const maxTransferAmount =
    checkoutOpen && checkoutSummary
      ? Math.max(0, checkoutGrandTotalNum - checkoutCardNum)
      : 0;

  useEffect(() => {
    if (!checkoutOpen || !checkoutSummary) {
return;
}

    const g = roundMoney(Number(checkoutSummary.grand_total));
    const d = roundMoney(parseFloat(card) || 0);
    const t = roundMoney(parseFloat(transfer) || 0);

    if (d + t <= g + 0.01) {
return;
}

    const newT = Math.min(t, g);
    const newD = Math.min(d, Math.max(0, g - newT));
    setCard(newD === 0 ? '' : String(newD));
    setTransfer(newT === 0 ? '' : String(newT));
  }, [card, checkoutOpen, checkoutSummary, transfer]);

  const pageErrors = (usePage().props as { errors?: Record<string, string> }).errors ?? {};

  useEffect(() => {
    if (receiptProp) {
setInvoiceReceipt(receiptProp);
}
  }, [receiptProp]);

  useEffect(() => {
    if (!tabSuccessMessage && !tabErrorMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setTabSuccessMessage(null);
      setTabErrorMessage(null);
    }, 3500);

    return () => window.clearTimeout(timeoutId);
  }, [tabErrorMessage, tabSuccessMessage]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      router.get('/tables', {}, {
        preserveState: true,
        preserveScroll: true,
        replace: true,
        only: ['tables'],
      });
    }, 2500);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(id);
  }, []);

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
  }, [setActiveMobileTableId]);

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
        setTabSuccessMessage('Open tab created successfully.');
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
        setTabSuccessMessage('Session moved to existing open tab.');
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

    const settlement = buildExactSettlementPayments({
      expected: Number(checkoutSummary.grand_total) || 0,
      cash: parseFloat(cash) || 0,
      card: parseFloat(card) || 0,
      transfer: parseFloat(transfer) || 0,
      money,
    });

    if (settlement.error) {
      setCheckoutError(settlement.error);

      return;
    }

    setCheckoutError(null);
    const url = tablesRoutes.end.url({ table: checkoutSummary.table_id });
    const payload: { payments: { method: string; amount: number }[]; customer_email?: string } = { payments: settlement.payments };

    if (customerEmail.trim()) {
payload.customer_email = customerEmail.trim();
}

    setSubmitting(true);
    router.post(url, payload, {
      onSuccess: () => {
        setSubmitting(false);
        closeCheckout(true);
      },
      onError: () => setSubmitting(false),
      onFinish: () => setSubmitting(false),
    });
  };

  const openCancelSessionDialog = (tableId: number) => {
    setCancelSessionTableId(tableId);
    setCancelSessionError(null);
    setCancelSessionOpen(true);
  };

  const confirmCancelSession = async () => {
    if (cancelSessionTableId == null) {
return;
}

    setCancelSessionSubmitting(true);
    setCancelSessionError(null);

    try {
      const csrfToken = document.cookie.split('; ').find((r) => r.startsWith('XSRF-TOKEN='))?.split('=')[1];
      const headers: Record<string, string> = {
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json',
        'Content-Type': 'application/json',
      };

      if (csrfToken) {
        headers['X-XSRF-TOKEN'] = decodeURIComponent(csrfToken);
      }

      const res = await fetch(`/admin/tables/${cancelSessionTableId}/cancel-session`, {
        method: 'POST',
        headers,
        credentials: 'same-origin',
        body: '{}',
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setCancelSessionError(
          typeof data.message === 'string' ? data.message : 'Failed to cancel session.',
        );

        return;
      }

      setCancelSessionOpen(false);
      setCancelSessionTableId(null);
      router.reload();
    } finally {
      setCancelSessionSubmitting(false);
    }
  };

  const openEditSessionItems = (table: Table) => {
    if (!table.current_session) {
return;
}

    setEditSessionTableId(table.id);
    setEditSessionDraft(
      table.current_session.items.map((i) => ({
        ...i,
        product_id: i.product_id ?? null,
      })),
    );
    setEditSessionRemovedIds([]);
    setEditSessionError(null);
    setEditSessionItemsOpen(true);
  };

  const closeEditSessionItems = () => {
    setEditSessionItemsOpen(false);
    setEditSessionTableId(null);
    setEditSessionDraft([]);
    setEditSessionRemovedIds([]);
    setEditSessionError(null);
  };

  const saveEditSessionItems = async () => {
    if (editSessionTableId == null) {
return;
}

    setEditSessionSaving(true);
    setEditSessionError(null);
    const items = [
      ...editSessionDraft.map((i) => ({
        id: i.id,
        quantity: Math.max(0, Math.floor(Number(i.quantity) || 0)),
      })),
      ...editSessionRemovedIds.map((id) => ({ id, quantity: 0 })),
    ];

    try {
      const res = await fetch(`/admin/tables/${editSessionTableId}/session-items`, {
        method: 'PUT',
        headers: adminJsonHeaders(),
        credentials: 'same-origin',
        body: JSON.stringify({ items }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setEditSessionError(typeof data.message === 'string' ? data.message : 'Could not save items.');

        return;
      }

      closeEditSessionItems();
      setDetailsTable(null);
      router.reload();
    } finally {
      setEditSessionSaving(false);
    }
  };

  const removeEditSessionLine = (id: number) => {
    setEditSessionDraft((d) => d.filter((x) => x.id !== id));
    setEditSessionRemovedIds((r) => (r.includes(id) ? r : [...r, id]));
  };

  const updateEditSessionQty = (id: number, qty: number) => {
    const q = Math.max(1, Math.floor(qty));
    setEditSessionDraft((d) =>
      d.map((row) =>
        row.id === id ? { ...row, quantity: q, total_price: roundMoney(q * row.unit_price) } : row,
      ),
    );
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
      setTabErrorMessage('No products available.');

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
      prev.map((i) =>
        i.productId === productId ? { ...i, quantity: Math.max(0, Math.floor(quantity)) } : i,
      ),
    );
  };

  const cartTotal = addItemCart.reduce((sum, item) => sum + item.price * Math.max(0, item.quantity), 0);

  const handleConfirmAddItemTable = () => {
    if (!addItemTableId || addItemCart.length === 0) {
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
    setDeleteAlertOpen(false);
  };
  const handleSaveEdit = () => {
    if (!editTable) {
      return;
    }

    router.put(
      `/admin/tables/${editTable.id}`,
      { name: editName, status: editTable.status },
      { onSuccess: () => setEditTable(null) },
    );
  };
  const handleDeleteTable = () => {
    if (!editTable) {
return;
}

    router.delete(`/admin/tables/${editTable.id}`, { onSuccess: () => {
 setEditTable(null); setDeleteAlertOpen(false); 
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
        {tabSuccessMessage && (
          <div className="pointer-events-none fixed left-1/2 top-6 z-50 w-full max-w-md -translate-x-1/2 px-2 sm:px-0">
            <Alert>
              <CheckCircle2Icon />
              <AlertTitle>Success</AlertTitle>
              <AlertDescription>{tabSuccessMessage}</AlertDescription>
            </Alert>
          </div>
        )}
        {tabErrorMessage && (
          <div className="pointer-events-none fixed left-1/2 top-6 z-50 w-full max-w-md -translate-x-1/2 px-2 sm:px-0">
            <Alert variant="destructive">
              <AlertTitle>Action failed</AlertTitle>
              <AlertDescription>{tabErrorMessage}</AlertDescription>
            </Alert>
          </div>
        )}
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

            const glowClass = isMaintenance
              ? 'shadow-[0_0_28px_rgba(244,63,94,0.5)] ring-[3px] ring-rose-500/60'
              : isPaused
                ? 'shadow-[0_0_28px_rgba(245,158,11,0.5)] ring-[3px] ring-amber-500/60'
                : isRunning
                  ? 'shadow-[0_0_28px_rgba(16,185,129,0.5)] ring-[3px] ring-emerald-500/60'
                  : 'shadow-[0_0_24px_rgba(34,197,94,0.4)] ring-[3px] ring-emerald-500/50';

            return (
              <div key={table.id} className="group flex flex-col items-center">
                <span
                  className={`mb-2 rounded-full px-3 py-1 text-sm font-semibold ${
                    hasSession ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' : 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                  }`}
                >
                  {table.name}
                </span>

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
                    <div className="absolute left-0 top-0 h-3 w-3 rounded-full bg-black" />
                    <div className="absolute right-0 top-0 h-3 w-3 rounded-full bg-black" />
                    <div className="absolute left-0 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-black" />
                    <div className="absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-black" />
                    <div className="absolute bottom-0 left-0 h-3 w-3 rounded-full bg-black" />
                    <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-black" />

                    <div className="relative flex aspect-[1/1.85] min-h-[180px] w-full flex-col rounded-md bg-slate-700">
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
                      <div
                        className={`flex flex-wrap items-center justify-center gap-1.5 px-2 pb-3 transition-opacity duration-200 ${
                          isTouchDevice
                            ? activeMobileTableId === table.id
                              ? 'opacity-100 pointer-events-auto'
                              : 'opacity-0 pointer-events-none'
                            : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto'
                        }`}
                        onClick={(e) => {
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
                        {isAdmin && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 border-rose-500/40 bg-rose-950/40 text-rose-200 hover:bg-rose-950/60"
                            onClick={() => openCancelSessionDialog(table.id)}
                          >
                            Cancel
                          </Button>
                        )}
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

        <Dialog open={!!detailsTable} onOpenChange={(open) => !open && setDetailsTable(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{detailsTable?.name} — Details</DialogTitle>
              <DialogDescription>
                {detailsTable?.current_session?.status === 'paused'
                  ? 'Session is paused. Timer is stopped.'
                  : 'Session in progress. Timer keeps running.'}
              </DialogDescription>
            </DialogHeader>
            {detailsTable?.current_session && (
              <div className="space-y-4">
                <div className="rounded-lg bg-slate-800/50 p-3 text-center">
                  <span className="font-mono text-2xl font-semibold tabular-nums text-emerald-400">
                    {getDisplayTime(detailsTable)}
                  </span>
                </div>
                <div className="rounded-lg bg-slate-800/30 p-3">
                  <h4 className="mb-2 text-sm font-medium text-muted-foreground">Items</h4>
                  {detailsTable.current_session.items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No items yet.</p>
                  ) : (
                    <ul className="space-y-1.5 text-sm">
                      {detailsTable.current_session.items.map((item) => (
                        <li key={item.id} className="flex justify-between gap-3">
                          <span className="truncate">{item.product_name} × {item.quantity}</span>
                          <span className="tabular-nums">{money(item.total_price || 0)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button variant="outline" onClick={() => setDetailsTable(null)}>
                    Close
                  </Button>
                  {isAdmin && detailsTable.current_session.items.length > 0 && (
                    <Button
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => openEditSessionItems(detailsTable)}
                    >
                      <Pencil className="h-4 w-4" />
                      Edit items
                    </Button>
                  )}
                  <Button
                    onClick={() => {
                      if (detailsTable) {
                        handleAddItem(detailsTable.id);
                      }

                      setDetailsTable(null);
                    }}
                    className="gap-1.5"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    Add item
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog
          open={editSessionItemsOpen}
          onOpenChange={(open) => {
            if (!open) {
closeEditSessionItems();
}
          }}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit session items</DialogTitle>
              <DialogDescription>
                Adjust quantities or remove lines for this table session. Use <span className="font-medium">Add item</span> to add products. Timer charges are separate.
              </DialogDescription>
            </DialogHeader>
            {editSessionDraft.length === 0 && (
              <p className="text-sm text-muted-foreground">No lines to edit.</p>
            )}
            {editSessionDraft.length > 0 && (
              <ul className="max-h-64 space-y-3 overflow-y-auto text-sm">
                {editSessionDraft.map((line) => (
                  <li
                    key={line.id}
                    className="flex flex-col gap-2 rounded-md border border-border/80 bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{line.product_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {money(line.unit_price)} each · line {money(line.total_price)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="sr-only" htmlFor={`sess-qty-${line.id}`}>
                        Quantity
                      </Label>
                      <Input
                        id={`sess-qty-${line.id}`}
                        type="number"
                        min={1}
                        className="h-9 w-20"
                        value={line.quantity}
                        onChange={(e) => updateEditSessionQty(line.id, Number(e.target.value) || 1)}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => removeEditSessionLine(line.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {editSessionError && <p className="text-sm text-destructive">{editSessionError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeEditSessionItems} disabled={editSessionSaving}>
                Close
              </Button>
              <Button
                type="button"
                onClick={saveEditSessionItems}
                disabled={
                  editSessionSaving ||
                  (editSessionDraft.length === 0 && editSessionRemovedIds.length === 0)
                }
              >
                {editSessionSaving ? 'Saving…' : 'Save changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={addItemModalOpen} onOpenChange={(open) => !open && setAddItemModalOpen(false)}>
          <DialogContent className="w-[calc(100vw-1rem)] max-h-[90vh] overflow-y-auto sm:max-w-5xl">
            <DialogHeader>
              <DialogTitle>Add Items</DialogTitle>
              <DialogDescription>
                Search and add multiple products to this table&apos;s session.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-2 rounded-xl border border-sidebar-border/70 bg-background/95 p-3 shadow-sm dark:border-sidebar-border sm:p-4">
              <div className="mb-4">
                <Input
                  placeholder="Search products..."
                  value={addItemSearch}
                  onChange={(e) => setAddItemSearch(e.target.value)}
                  className="h-10"
                />
              </div>

              <div className="flex flex-col gap-3 overflow-y-auto lg:h-[420px] lg:flex-row lg:gap-4 lg:overflow-hidden">
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
                      disabled={addItemCart.every((i) => i.quantity <= 0)}
                    >
                      Add items
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

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
                <div className="space-y-2">
                  <Label htmlFor="edit-status">Status</Label>
                  <Select
                    value={editTable.status}
                    onValueChange={(value) => setEditTable((prev) => (prev ? { ...prev, status: value } : prev))}
                  >
                    <SelectTrigger id="edit-status" className="w-full">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="available">Available</SelectItem>
                      <SelectItem value="maintenance">Maintenance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter className="flex flex-col gap-2 sm:flex-row">
                  <Button variant="outline" onClick={() => setEditTable(null)}>Cancel</Button>
                  <Button onClick={handleSaveEdit}>Save</Button>
                  <AlertDialog open={deleteAlertOpen} onOpenChange={setDeleteAlertOpen}>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive">Delete table</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete table?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This action cannot be undone.
                          {editTable ? ` "${editTable.name}" will be permanently removed.` : ''}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={handleDeleteTable}
                        >
                          Confirm delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

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
              <DialogDescription>
                Card and transfer cannot exceed the grand total together; use cash for tips or change. Change is taken from the cash portion.
              </DialogDescription>
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
                  {(() => {
                    const preview = paymentPreview(
                      parseFloat(cash) || 0,
                      parseFloat(card) || 0,
                      parseFloat(transfer) || 0,
                      Number(checkoutSummary.grand_total) || 0,
                    );

                    if (preview.cashValue <= 0 && preview.cardValue <= 0 && preview.transferValue <= 0) {
return null;
}

                    return (
                      <>
                        {preview.cardValue > 0 && (
                          <div className="flex justify-between border-t border-border/60 pt-2">
                            <span className="text-muted-foreground">Card</span>
                            <span>{money(preview.cardValue)}</span>
                          </div>
                        )}
                        {preview.transferValue > 0 && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Transfer</span>
                            <span>{money(preview.transferValue)}</span>
                          </div>
                        )}
                        {preview.cashValue > 0 && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Cash</span>
                            <span>{money(preview.cashValue)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-muted-foreground">
                          <span>Total received</span>
                          <span>{money(preview.totalPaid)}</span>
                        </div>
                        {preview.change > 0.01 && (
                          <div className="flex justify-between font-medium text-emerald-600 dark:text-emerald-400">
                            <span>Change</span>
                            <span>- {money(preview.change)}</span>
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
                      max={maxCardAmount}
                      placeholder="0"
                      title={`Max ${money(maxCardAmount)} (with current transfer)`}
                      value={card}
                      onChange={(e) => {
                        setCheckoutError(null);
                        setCard(clampNonCashInput(e.target.value, maxCardAmount));
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="w-24 shrink-0">Transfer</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max={maxTransferAmount}
                      placeholder="0"
                      title={`Max ${money(maxTransferAmount)} (with current card)`}
                      value={transfer}
                      onChange={(e) => {
                        setCheckoutError(null);
                        setTransfer(clampNonCashInput(e.target.value, maxTransferAmount));
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
                {checkoutError && (
                  <p className="text-sm text-destructive">{checkoutError}</p>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => closeCheckout()} disabled={submitting}>
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

        <AlertDialog
          open={cancelSessionOpen}
          onOpenChange={(open) => {
            setCancelSessionOpen(open);

            if (!open) {
              setCancelSessionTableId(null);
              setCancelSessionError(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel active session?</AlertDialogTitle>
              <AlertDialogDescription>
                This stops the timer and voids session items. No receipt is created.
                {cancelSessionTableId != null
                  ? ` Table: ${tables.find((t) => t.id === cancelSessionTableId)?.name ?? `#${cancelSessionTableId}`}.`
                  : ''}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {cancelSessionError && (
              <p className="text-sm text-destructive">{cancelSessionError}</p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={cancelSessionSubmitting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={cancelSessionSubmitting}
                onClick={async (e) => {
                  e.preventDefault();
                  await confirmCancelSession();
                }}
              >
                {cancelSessionSubmitting ? 'Cancelling…' : 'Confirm cancel'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}

