import { Head, router, usePage } from '@inertiajs/react';
import {
    Play,
    Pause,
    ShoppingCart,
    Square,
    Pencil,
    Plus,
    RotateCw,
    CheckCircle2Icon,
    Timer,
    Wallet,
    X,
} from 'lucide-react';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
    AlertDialogTrigger,
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { categoryBadgeClass, normalizeCategory } from '@/lib/categories';
import { formatClock as formatElapsedSeconds } from '@/lib/dates';
import { jsonHeaders } from '@/lib/http';
import { useI18n } from '@/lib/i18n';
import { inertiaPost } from '@/lib/inertia-action';
import {
    buildExactSettlementPayments,
    formatMoney,
    roundMoney,
} from '@/lib/payments';
import { posCartRowClass, posPanelClass, posTileClass } from '@/lib/pos-ui';
import {
    DEFAULT_TIME_BLOCKS,
    emptyBlockCounts,
    playAlertBeep,
    totalForBlockCounts,
} from '@/lib/time-blocks';
import type { TimeBlock, TimeBlockCounts } from '@/lib/time-blocks';
import receiptsRoutes from '@/routes/receipts';
import tablesRoutes from '@/routes/tables';

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
    alert_at_played_seconds?: number | null;
    has_alert?: boolean;
    billing_mode?: 'timer' | 'prepaid';
    prepaid_seconds?: number;
    prepaid_amount?: number;
    prepaid_as_timer?: boolean;
    items: SessionItem[];
};

type Table = {
    id: number;
    name: string;
    status: string;
    rotation?: number;
    sort_order?: number;
    current_session: TableSession | null;
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

type CartItem = {
    productId: number;
    name: string;
    price: number;
    quantity: number;
    category: string;
};

type Props = {
    tables: Table[];
    products: Product[];
    timeBlocks?: TimeBlock[];
    receipt?: InvoiceReceipt | null;
    isAdmin?: boolean;
};

type CheckoutSummary = {
    table_id: number;
    table_name: string;
    session_id: number;
    played_seconds?: number;
    time_total: number;
    items_total: number;
    grand_total: number;
    time_blocks?: TimeBlock[];
    billing_mode?: 'timer' | 'prepaid';
    prepaid_amount?: number;
    prepaid_as_timer?: boolean;
};

function sessionFlags(table: Table) {
    const hasSession = Boolean(
        table.current_session &&
        ['running', 'paused'].includes(table.current_session.status),
    );
    const isAvailable = table.status === 'available' && !hasSession;
    const isRunning = hasSession
        ? table.current_session!.status === 'running'
        : table.status === 'running';
    const isPaused = hasSession
        ? table.current_session!.status === 'paused'
        : table.status === 'paused';

    return {
        hasSession,
        isAvailable,
        isRunning,
        isPaused,
        isMaintenance: table.status === 'maintenance',
        showTimer: hasSession,
    };
}

function TableSidePanel({
    table,
    isAdmin,
    displayTime,
    timerClass,
    onClose,
    onStart,
    onPrepaid,
    onPause,
    onResume,
    onEnd,
    onCancel,
    onAddItem,
    onAlert,
    onEditItems,
    editName,
    onEditName,
    editRotation,
    onToggleRotation,
    onMove,
    isFirst,
    isLast,
    editStatus,
    onEditStatus,
    onSave,
    onDelete,
    deleteOpen,
    onDeleteOpen,
}: {
    table: Table;
    isAdmin: boolean;
    displayTime: string;
    timerClass: string;
    onClose: () => void;
    onStart: () => void;
    onPrepaid: () => void;
    onPause: () => void;
    onResume: () => void;
    onEnd: () => void;
    onCancel: () => void;
    onAddItem: () => void;
    onAlert: () => void;
    onEditItems: () => void;
    editName: string;
    onEditName: (value: string) => void;
    editRotation: number;
    onToggleRotation: () => void;
    onMove: (direction: -1 | 1) => void;
    isFirst: boolean;
    isLast: boolean;
    editStatus: string;
    onEditStatus: (value: string) => void;
    onSave: () => void;
    onDelete: () => void;
    deleteOpen: boolean;
    onDeleteOpen: (open: boolean) => void;
}) {
    const { t } = useI18n();
    const { hasSession, isAvailable, isRunning, isPaused, isMaintenance } =
        sessionFlags(table);
    const [pane, setPane] = useState<'session' | 'settings'>('session');
    const items = table.current_session?.items ?? [];

    useEffect(() => {
        setPane('session');
    }, [table.id]);

    return (
        <aside className="fixed inset-y-0 right-0 z-40 flex h-svh w-[min(100vw,20rem)] flex-col border-l border-border bg-background shadow-2xl xl:sticky xl:top-16 xl:z-auto xl:h-[calc(100svh-4rem)] xl:w-80 xl:shrink-0 xl:self-start xl:shadow-none">
            <div className="flex items-center justify-between gap-3 px-4 pt-3">
                <h2 className="text-lg font-semibold">{table.name}</h2>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    aria-label={t('Close table menu')}
                >
                    <X className="h-4 w-4" />
                </Button>
            </div>
            <div className="grid grid-cols-2 border-b">
                {(
                    [
                        ['session', t('Session')],
                        ['settings', t('Settings')],
                    ] as const
                ).map(([value, label]) => (
                    <button
                        key={value}
                        type="button"
                        onClick={() => setPane(value)}
                        className={`relative py-2.5 text-sm font-medium ${
                            pane === value
                                ? 'text-sky-500'
                                : 'text-muted-foreground'
                        }`}
                    >
                        {label}
                        <span
                            className={`absolute inset-x-8 bottom-0 h-0.5 ${
                                pane === value ? 'bg-sky-500' : 'bg-transparent'
                            }`}
                        />
                    </button>
                ))}
            </div>
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
                {pane === 'session' && (
                    <>
                        <div className="rounded-lg bg-slate-800/50 p-3 text-center">
                            <span
                                className={`font-mono text-3xl font-semibold tabular-nums ${hasSession ? timerClass : 'text-slate-500'}`}
                            >
                                {hasSession ? displayTime : '—'}
                            </span>
                            {table.current_session?.billing_mode ===
                                'prepaid' && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {table.current_session.prepaid_as_timer
                                        ? t('Extra time')
                                        : t('Prepaid {amount}', {
                                              amount: formatMoney(
                                                  table.current_session
                                                      .prepaid_amount || 0,
                                              ),
                                          })}
                                </p>
                            )}
                        </div>
                        <div className="rounded-lg bg-slate-800/30 p-3">
                            <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                                {t('Items')}
                            </h3>
                            {!hasSession || items.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    {t('No items yet.')}
                                </p>
                            ) : (
                                <ul className="space-y-1.5 text-sm">
                                    {items.map((item) => (
                                        <li
                                            key={item.id}
                                            className="flex justify-between gap-3"
                                        >
                                            <span className="truncate">
                                                {item.product_name} ×{' '}
                                                {item.quantity}
                                            </span>
                                            <span className="tabular-nums">
                                                {formatMoney(
                                                    item.total_price || 0,
                                                )}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <div className="flex flex-col gap-2">
                            {isAvailable && (
                                <>
                                    <Button
                                        className="w-full justify-start gap-2 bg-emerald-600 hover:bg-emerald-700"
                                        onClick={onStart}
                                    >
                                        <Play className="h-4 w-4" />
                                        {t('Run timer')}
                                    </Button>
                                    <Button
                                        className="w-full justify-start gap-2"
                                        variant="secondary"
                                        onClick={onPrepaid}
                                    >
                                        <Wallet className="h-4 w-4" />
                                        {t('Prepaid')}
                                    </Button>
                                </>
                            )}
                            {(isRunning || isPaused) && (
                                <>
                                    <Button
                                        className="w-full justify-start gap-2 bg-blue-600 hover:bg-blue-700"
                                        onClick={onAddItem}
                                    >
                                        <ShoppingCart className="h-4 w-4" />
                                        {t('Add item')}
                                    </Button>
                                    {isRunning ? (
                                        <Button
                                            variant="secondary"
                                            className="w-full justify-start gap-2"
                                            onClick={onPause}
                                        >
                                            <Pause className="h-4 w-4" />
                                            {t('Pause')}
                                        </Button>
                                    ) : (
                                        <Button
                                            variant="secondary"
                                            className="w-full justify-start gap-2"
                                            onClick={onResume}
                                        >
                                            <Play className="h-4 w-4" />
                                            {t('Resume')}
                                        </Button>
                                    )}
                                    {table.current_session?.billing_mode ===
                                        'prepaid' && (
                                        <Button
                                            variant="secondary"
                                            className="w-full justify-start gap-2"
                                            onClick={onPrepaid}
                                        >
                                            <Wallet className="h-4 w-4" />
                                            {t('Extend prepaid')}
                                        </Button>
                                    )}
                                    {(table.current_session?.billing_mode !==
                                        'prepaid' ||
                                        table.current_session
                                            .prepaid_as_timer) && (
                                        <Button
                                            variant="secondary"
                                            className="w-full justify-start gap-2"
                                            onClick={onAlert}
                                        >
                                            <Timer className="h-4 w-4" />
                                            {table.current_session?.has_alert
                                                ? t('Extend alert')
                                                : t('Set alert')}
                                        </Button>
                                    )}
                                    <Button
                                        variant="destructive"
                                        className="w-full justify-start gap-2"
                                        onClick={onEnd}
                                    >
                                        <Square className="h-4 w-4" />
                                        {t('End')}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        className="w-full justify-start gap-2 border-rose-500/40 text-rose-700 hover:bg-rose-500/10 dark:text-rose-200"
                                        onClick={onCancel}
                                    >
                                        {t('Cancel session')}
                                    </Button>
                                </>
                            )}
                            {isMaintenance && (
                                <p className="text-sm text-muted-foreground">
                                    {t('This table is in maintenance.')}
                                </p>
                            )}
                        </div>
                    </>
                )}
                {pane === 'settings' && !isAdmin && (
                    <p className="text-sm text-muted-foreground">
                        {t('Only an admin can edit this table.')}
                    </p>
                )}
                {pane === 'settings' && isAdmin && (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="edit-name">{t('Name')}</Label>
                            <Input
                                id="edit-name"
                                value={editName}
                                onChange={(e) => onEditName(e.target.value)}
                                placeholder={t('Table name')}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>{t('Layout')}</Label>
                            <div className="flex flex-col gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="justify-start gap-1.5"
                                    onClick={onToggleRotation}
                                >
                                    <RotateCw className="h-4 w-4" />
                                    {editRotation === 90
                                        ? t('Horizontal')
                                        : t('Vertical')}
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="justify-start"
                                    onClick={() => onMove(-1)}
                                    disabled={isFirst}
                                >
                                    {t('Move earlier')}
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="justify-start"
                                    onClick={() => onMove(1)}
                                    disabled={isLast}
                                >
                                    {t('Move later')}
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {t(
                                    'Rotate switches the table between upright and sideways. Move earlier or later changes its place on the floor.',
                                )}
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-status">{t('Status')}</Label>
                            <Select
                                value={
                                    isRunning || isPaused
                                        ? isRunning
                                            ? 'running'
                                            : 'paused'
                                        : editStatus
                                }
                                onValueChange={onEditStatus}
                                disabled={isRunning || isPaused}
                            >
                                <SelectTrigger
                                    id="edit-status"
                                    className="w-full disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <SelectValue
                                        placeholder={t('Select status')}
                                    />
                                </SelectTrigger>
                                <SelectContent>
                                    {isRunning || isPaused ? (
                                        <SelectItem
                                            value={
                                                isRunning ? 'running' : 'paused'
                                            }
                                        >
                                            {isRunning
                                                ? t('Running')
                                                : t('Paused')}
                                        </SelectItem>
                                    ) : (
                                        <>
                                            <SelectItem value="available">
                                                {t('Available')}
                                            </SelectItem>
                                            <SelectItem value="maintenance">
                                                {t('Maintenance')}
                                            </SelectItem>
                                        </>
                                    )}
                                </SelectContent>
                            </Select>
                            {(isRunning || isPaused) && (
                                <p className="text-xs text-muted-foreground">
                                    {t(
                                        'Status stays locked while this table is in use.',
                                    )}
                                </p>
                            )}
                        </div>
                        {hasSession && items.length > 0 && (
                            <Button
                                variant="outline"
                                className="w-full justify-start gap-2"
                                onClick={onEditItems}
                            >
                                <Pencil className="h-4 w-4" />
                                {t('Edit items')}
                            </Button>
                        )}
                        <Button className="w-full" onClick={onSave}>
                            {t('Save')}
                        </Button>
                        <AlertDialog
                            open={deleteOpen}
                            onOpenChange={onDeleteOpen}
                        >
                            <AlertDialogTrigger asChild>
                                <Button
                                    variant="destructive"
                                    className="w-full"
                                >
                                    {t('Delete table')}
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>
                                        {t('Delete table?')}
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                        {t('This action cannot be undone.')}{' '}
                                        {t(
                                            '"{name}" will be permanently removed.',
                                            { name: table.name },
                                        )}
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>
                                        Cancel
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        onClick={onDelete}
                                    >
                                        {t('Confirm delete')}
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                )}
            </div>
        </aside>
    );
}

export default function TablesIndex({
    tables,
    products,
    timeBlocks: timeBlocksProp,
    receipt: receiptProp,
    isAdmin = false,
}: Props) {
    const { t } = useI18n();
    const catalogBlocks =
        timeBlocksProp && timeBlocksProp.length > 0
            ? timeBlocksProp
            : DEFAULT_TIME_BLOCKS;
    const [checkoutOpen, setCheckoutOpen] = useState(false);
    const [checkoutLoading, setCheckoutLoading] = useState(false);
    const [checkoutSummary, setCheckoutSummary] =
        useState<CheckoutSummary | null>(null);
    const [checkoutError, setCheckoutError] = useState<string | null>(null);
    const [checkoutTableId, setCheckoutTableId] = useState<number | null>(null);
    const [frozenElapsedSeconds, setFrozenElapsedSeconds] = useState<
        number | null
    >(null);
    const [cash, setCash] = useState('');
    const [card, setCard] = useState('');
    const [transfer, setTransfer] = useState('');
    const [customerEmail, setCustomerEmail] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [invoiceReceipt, setInvoiceReceipt] = useState<InvoiceReceipt | null>(
        null,
    );
    const [now, setNow] = useState(() => Date.now());
    const [emailSending, setEmailSending] = useState(false);
    const [emailMessage, setEmailMessage] = useState<string | null>(null);
    const [checkoutWasPaused, setCheckoutWasPaused] = useState(false);
    const [endChoiceOpen, setEndChoiceOpen] = useState(false);
    const [endChoiceTableId, setEndChoiceTableId] = useState<number | null>(
        null,
    );
    const [endChoiceSummary, setEndChoiceSummary] =
        useState<CheckoutSummary | null>(null);
    const [endChoiceWasPaused, setEndChoiceWasPaused] = useState(false);
    const [showExistingTabPicker, setShowExistingTabPicker] = useState(false);
    const [existingTabLoading, setExistingTabLoading] = useState(false);
    const [existingTabOptions, setExistingTabOptions] = useState<
        { id: number; label: string }[]
    >([]);
    const [selectedExistingTabId, setSelectedExistingTabId] = useState<
        number | null
    >(null);
    const [existingTabError, setExistingTabError] = useState<string | null>(
        null,
    );
    const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
    const [editTable, setEditTable] = useState<Table | null>(null);
    const [editName, setEditName] = useState('');
    const [editRotation, setEditRotation] = useState(0);
    const [addTableOpen, setAddTableOpen] = useState(false);
    const [newTableName, setNewTableName] = useState('');
    const [deleteAlertOpen, setDeleteAlertOpen] = useState(false);
    const [cancelSessionOpen, setCancelSessionOpen] = useState(false);
    const [cancelSessionTableId, setCancelSessionTableId] = useState<
        number | null
    >(null);
    const [cancelSessionSubmitting, setCancelSessionSubmitting] =
        useState(false);
    const [cancelSessionError, setCancelSessionError] = useState<string | null>(
        null,
    );
    const [cancelSessionReason, setCancelSessionReason] = useState('');
    const [cancelSessionRestock, setCancelSessionRestock] = useState(true);
    const [editSessionItemsOpen, setEditSessionItemsOpen] = useState(false);
    const [editSessionTableId, setEditSessionTableId] = useState<number | null>(
        null,
    );
    const [editSessionDraft, setEditSessionDraft] = useState<SessionItem[]>([]);
    const [editSessionRemovedIds, setEditSessionRemovedIds] = useState<
        number[]
    >([]);
    const [editSessionSaving, setEditSessionSaving] = useState(false);
    const [editSessionError, setEditSessionError] = useState<string | null>(
        null,
    );
    const [editSessionReason, setEditSessionReason] = useState('');
    const [addItemModalOpen, setAddItemModalOpen] = useState(false);
    const [addItemTableId, setAddItemTableId] = useState<number | null>(null);
    const [addItemSearch, setAddItemSearch] = useState('');
    const [addItemCategory, setAddItemCategory] = useState<string>('all');
    const [addItemCart, setAddItemCart] = useState<CartItem[]>([]);
    const [addItemSubmitting, setAddItemSubmitting] = useState(false);
    const [moveTabSubmitting, setMoveTabSubmitting] = useState(false);
    const [tabSuccessMessage, setTabSuccessMessage] = useState<string | null>(
        null,
    );
    const [tabErrorMessage, setTabErrorMessage] = useState<string | null>(null);
    const [checkoutBlockCounts, setCheckoutBlockCounts] =
        useState<TimeBlockCounts>(() => emptyBlockCounts(catalogBlocks));
    const [endChoiceBlockCounts, setEndChoiceBlockCounts] =
        useState<TimeBlockCounts>(() => emptyBlockCounts(catalogBlocks));
    const [alertDialogOpen, setAlertDialogOpen] = useState(false);
    const [alertDialogTableId, setAlertDialogTableId] = useState<number | null>(
        null,
    );
    const [alertDialogExtend, setAlertDialogExtend] = useState(false);
    const [alertDraftCounts, setAlertDraftCounts] = useState<TimeBlockCounts>(
        () => emptyBlockCounts(catalogBlocks),
    );
    const [alertSubmitting, setAlertSubmitting] = useState(false);
    const [expiredAlertTableId, setExpiredAlertTableId] = useState<
        number | null
    >(null);
    /** Tables where staff already chose Extend/End/Clear — stop beep/modal until alert is fixed. */
    const [silencedExpiredTableIds, setSilencedExpiredTableIds] = useState<
        number[]
    >([]);
    const [prepaidOpen, setPrepaidOpen] = useState(false);
    const [prepaidTableId, setPrepaidTableId] = useState<number | null>(null);
    const [prepaidExtend, setPrepaidExtend] = useState(false);
    const [prepaidCounts, setPrepaidCounts] = useState<TimeBlockCounts>(
        emptyBlockCounts(catalogBlocks),
    );
    const [prepaidCash, setPrepaidCash] = useState('');
    const [prepaidCard, setPrepaidCard] = useState('');
    const [prepaidTransfer, setPrepaidTransfer] = useState('');
    const [prepaidEmail, setPrepaidEmail] = useState('');
    const [prepaidError, setPrepaidError] = useState<string | null>(null);
    const [prepaidSubmitting, setPrepaidSubmitting] = useState(false);
    const alertAudioRef = useRef<AudioContext | null>(null);
    /** Bumped on table lifecycle POSTs so a slow poll cannot overwrite fresh state. */
    const tableSyncEpochRef = useRef(0);
    const alertClosedAfterSaveRef = useRef(false);
    const money = formatMoney;

    const checkoutBlocks = checkoutSummary?.time_blocks?.length
        ? checkoutSummary.time_blocks
        : catalogBlocks;
    const prepaidItemCheckout = checkoutSummary?.billing_mode === 'prepaid';
    const checkoutTimeTotal = prepaidItemCheckout
        ? 0
        : totalForBlockCounts(checkoutBlockCounts, checkoutBlocks);
    const checkoutGrandTotal = roundMoney(
        checkoutTimeTotal + (Number(checkoutSummary?.items_total) || 0),
    );
    const endChoiceTimeTotal = totalForBlockCounts(
        endChoiceBlockCounts,
        catalogBlocks,
    );
    const endChoiceGrandTotal = roundMoney(
        endChoiceTimeTotal + (Number(endChoiceSummary?.items_total) || 0),
    );

    useEffect(() => {
        if (!checkoutOpen || !checkoutSummary) {
            return;
        }

        const g = roundMoney(checkoutGrandTotal);
        const d = roundMoney(parseFloat(card) || 0);
        const t = roundMoney(parseFloat(transfer) || 0);

        if (d + t <= g + 0.01) {
            return;
        }

        const newT = Math.min(t, g);
        const newD = Math.min(d, Math.max(0, g - newT));
        setCard(newD === 0 ? '' : String(newD));
        setTransfer(newT === 0 ? '' : String(newT));
    }, [card, checkoutGrandTotal, checkoutOpen, checkoutSummary, transfer]);

    const pageErrors =
        (usePage().props as { errors?: Record<string, string> }).errors ?? {};

    useEffect(() => {
        if (receiptProp) {
            setInvoiceReceipt(receiptProp);
            setCheckoutOpen(false);
            setSubmitting(false);
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

            // Avoid clobbering in-progress end/checkout Inertia visits.
            if (endChoiceOpen || checkoutOpen || checkoutLoading) {
                return;
            }

            const epochAtPollStart = tableSyncEpochRef.current;

            router.get(
                '/tables',
                {},
                {
                    preserveState: true,
                    preserveScroll: true,
                    replace: true,
                    only: ['tables'],
                    onSuccess: () => {
                        if (epochAtPollStart !== tableSyncEpochRef.current) {
                            router.get(
                                '/tables',
                                {},
                                {
                                    preserveScroll: true,
                                    replace: true,
                                    only: ['tables'],
                                },
                            );
                        }
                    },
                },
            );
        }, 2500);

        return () => window.clearInterval(intervalId);
    }, [checkoutLoading, checkoutOpen, endChoiceOpen]);

    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);

        return () => clearInterval(id);
    }, []);

    const getElapsedSeconds = useCallback(
        (table: Table): number | null => {
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
        },
        [now],
    );

    const getAlertRemainingSeconds = useCallback(
        (table: Table): number | null => {
            const session = table.current_session;

            if (
                !session?.has_alert ||
                session.alert_at_played_seconds == null
            ) {
                return null;
            }

            const played = getElapsedSeconds(table) ?? 0;

            return Math.max(0, session.alert_at_played_seconds - played);
        },
        [getElapsedSeconds],
    );

    const getDisplayTime = useCallback(
        (table: Table): string => {
            if (table.id === checkoutTableId && frozenElapsedSeconds !== null) {
                const target =
                    table.current_session?.alert_at_played_seconds ?? null;

                if (target != null) {
                    return formatElapsedSeconds(
                        Math.max(0, target - frozenElapsedSeconds),
                    );
                }

                return formatElapsedSeconds(frozenElapsedSeconds);
            }

            const session = table.current_session;

            if (
                session?.billing_mode === 'prepaid' &&
                session.prepaid_as_timer
            ) {
                const played = getElapsedSeconds(table) ?? 0;

                return formatElapsedSeconds(
                    Math.max(0, played - (session.prepaid_seconds ?? 0)),
                );
            }

            const remaining = getAlertRemainingSeconds(table);

            if (remaining !== null) {
                return formatElapsedSeconds(remaining);
            }

            const sec = getElapsedSeconds(table);

            return sec !== null
                ? formatElapsedSeconds(sec)
                : (table.current_session?.elapsed ?? '00:00:00');
        },
        [
            checkoutTableId,
            frozenElapsedSeconds,
            getAlertRemainingSeconds,
            getElapsedSeconds,
        ],
    );

    const getTimerToneClass = useCallback(
        (table: Table): string => {
            if (
                table.current_session?.billing_mode === 'prepaid' &&
                table.current_session.prepaid_as_timer
            ) {
                return 'text-amber-300';
            }

            const remaining = getAlertRemainingSeconds(table);

            if (remaining === null) {
                return 'text-emerald-400';
            }

            if (remaining <= 0) {
                return 'text-rose-400';
            }

            if (remaining <= 60) {
                return 'text-amber-300';
            }

            return 'text-sky-300';
        },
        [getAlertRemainingSeconds],
    );

    const expiredAlertTables = useMemo(
        () =>
            tables.filter((table) => {
                if (silencedExpiredTableIds.includes(table.id)) {
                    return false;
                }

                const remaining = getAlertRemainingSeconds(table);

                return (
                    table.current_session?.has_alert &&
                    remaining !== null &&
                    remaining <= 0
                );
            }),
        [getAlertRemainingSeconds, silencedExpiredTableIds, tables],
    );

    const silenceExpiredAlarm = useCallback((tableId: number) => {
        setSilencedExpiredTableIds((prev) =>
            prev.includes(tableId) ? prev : [...prev, tableId],
        );
        setExpiredAlertTableId((current) =>
            current === tableId ? null : current,
        );
    }, []);

    const restoreExpiredAlarm = useCallback((tableId: number) => {
        setSilencedExpiredTableIds((prev) =>
            prev.filter((id) => id !== tableId),
        );
    }, []);

    // Drop silence once the alert is cleared or has time remaining again.
    useEffect(() => {
        if (silencedExpiredTableIds.length === 0) {
            return;
        }

        setSilencedExpiredTableIds((prev) => {
            const next = prev.filter((id) => {
                const table = tables.find((t) => t.id === id);

                if (!table?.current_session?.has_alert) {
                    return false;
                }

                const remaining = getAlertRemainingSeconds(table);

                return remaining === null || remaining <= 0;
            });

            return next.length === prev.length ? prev : next;
        });
    }, [getAlertRemainingSeconds, silencedExpiredTableIds.length, tables]);

    useEffect(() => {
        if (expiredAlertTables.length === 0) {
            setExpiredAlertTableId(null);

            return;
        }

        const active =
            expiredAlertTables.find((t) => t.id === expiredAlertTableId) ??
            expiredAlertTables[0];
        setExpiredAlertTableId(active.id);
        alertAudioRef.current = playAlertBeep(alertAudioRef.current);
        const id = window.setInterval(() => {
            alertAudioRef.current = playAlertBeep(alertAudioRef.current);
        }, 2500);

        return () => window.clearInterval(id);
    }, [expiredAlertTableId, expiredAlertTables]);

    useEffect(() => {
        if (checkoutOpen && pageErrors.payments) {
            setCheckoutError(pageErrors.payments);
        }
    }, [checkoutOpen, pageErrors.payments]);

    useEffect(() => {
        if (pageErrors.table) {
            setTabErrorMessage(pageErrors.table);
        }
    }, [pageErrors.table]);

    const handleAction = (
        tableId: number,
        action: 'start' | 'pause' | 'resume' | 'end',
    ) => {
        if (action === 'end') {
            setCheckoutLoading(true);
            setCheckoutError(null);
            void (async () => {
                try {
                    const res = await fetch(
                        `/tables/${tableId}/checkout-summary`,
                    );

                    if (!res.ok) {
                        throw new Error('Could not load summary');
                    }

                    const data = (await res.json()) as CheckoutSummary;
                    const t = tables.find((tbl) => tbl.id === data.table_id);
                    const wasRunning = t?.status === 'running';
                    const itemsTotal = Number(data.items_total) || 0;

                    if (data.billing_mode === 'prepaid' && itemsTotal <= 0.01) {
                        silenceExpiredAlarm(data.table_id);
                        const result = await inertiaPost(
                            tablesRoutes.end.url({ table: data.table_id }),
                            {
                                payments: [],
                                time_blocks: emptyBlockCounts(catalogBlocks),
                            },
                        );

                        if (result !== 'success') {
                            restoreExpiredAlarm(data.table_id);
                            router.reload();
                        }

                        return;
                    }

                    if (data.billing_mode === 'prepaid') {
                        setCash('');
                        setCard('');
                        setTransfer('');
                        setCustomerEmail('');
                        setCheckoutError(null);
                        setCheckoutSummary(data);
                        setCheckoutTableId(data.table_id);
                        setCheckoutBlockCounts(emptyBlockCounts(catalogBlocks));
                        setFrozenElapsedSeconds(data.played_seconds ?? 0);
                        setCheckoutWasPaused(wasRunning);
                        setCheckoutOpen(true);

                        if (wasRunning) {
                            await inertiaPost(
                                tablesRoutes.pause.url({
                                    table: data.table_id,
                                }),
                                {},
                                { preserveState: true },
                            );
                        }

                        return;
                    }

                    // Open the end modal first. Pausing must preserve React state —
                    // a full Inertia remount would drop endChoiceOpen and leave the
                    // table looking merely paused.
                    setEndChoiceWasPaused(wasRunning);
                    setEndChoiceTableId(data.table_id);
                    setEndChoiceSummary(data);
                    setEndChoiceBlockCounts(emptyBlockCounts(catalogBlocks));
                    setEndChoiceOpen(true);

                    if (wasRunning) {
                        await inertiaPost(
                            tablesRoutes.pause.url({ table: data.table_id }),
                            {},
                            { preserveState: true },
                        );
                    }
                } catch {
                    setCheckoutError('Failed to load checkout summary.');
                } finally {
                    setCheckoutLoading(false);
                }
            })();

            return;
        }

        tableSyncEpochRef.current += 1;
        const routeDef = tablesRoutes[action]({ table: tableId });
        void inertiaPost(
            routeDef.url,
            {},
            {
                onError: () => {
                    router.reload();
                },
            },
        );
    };

    const openPrepaid = (tableId: number, extend: boolean) => {
        setPrepaidTableId(tableId);
        setPrepaidExtend(extend);
        setPrepaidCounts(emptyBlockCounts(catalogBlocks));
        setPrepaidCash('');
        setPrepaidCard('');
        setPrepaidTransfer('');
        setPrepaidEmail('');
        setPrepaidError(null);
        setPrepaidOpen(true);
    };

    const prepaidTotal = totalForBlockCounts(prepaidCounts, catalogBlocks);

    const submitPrepaid = async () => {
        if (prepaidTableId == null || prepaidSubmitting) {
            return;
        }

        const settlement = buildExactSettlementPayments({
            expected: prepaidTotal,
            cash: parseFloat(prepaidCash) || 0,
            card: parseFloat(prepaidCard) || 0,
            transfer: parseFloat(prepaidTransfer) || 0,
            money,
        });

        if (settlement.error) {
            setPrepaidError(settlement.error);

            return;
        }

        setPrepaidError(null);
        setPrepaidSubmitting(true);
        const url = prepaidExtend
            ? `/tables/${prepaidTableId}/prepaid`
            : tablesRoutes.start.url({ table: prepaidTableId });
        const payload: {
            mode?: string;
            time_blocks: TimeBlockCounts;
            payments: { method: string; amount: number }[];
            customer_email?: string;
        } = {
            time_blocks: prepaidCounts,
            payments: settlement.payments,
        };

        if (!prepaidExtend) {
            payload.mode = 'prepaid';
        }

        if (prepaidEmail.trim()) {
            payload.customer_email = prepaidEmail.trim();
        }

        const tableId = prepaidTableId;
        const result = await inertiaPost(url, payload, {
            preserveState: true,
        });
        setPrepaidSubmitting(false);

        if (result === 'success') {
            silenceExpiredAlarm(tableId);
            setPrepaidOpen(false);
            setPrepaidTableId(null);
        } else if (result === 'error') {
            setPrepaidError('Payment failed. Please try again.');
            router.reload();
        }
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

        if (tableId != null) {
            // Cancelling end with an expired alert should bring the alarm back.
            restoreExpiredAlarm(tableId);
        }

        if (wasPaused && tableId != null) {
            router.post(
                tablesRoutes.resume.url({ table: tableId }),
                {},
                {
                    preserveState: true,
                },
            );
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
                sec =
                    base +
                    Math.max(
                        0,
                        Math.floor(
                            (Date.now() -
                                new Date(session.last_resume_at).getTime()) /
                                1000,
                        ),
                    );
            } else {
                sec = base;
            }
        }

        setFrozenElapsedSeconds(sec);
        setCheckoutWasPaused(endChoiceWasPaused);
        setCheckoutBlockCounts({ ...endChoiceBlockCounts });
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

    const handleMoveToOpenTab = async () => {
        if (endChoiceTableId == null || moveTabSubmitting) {
            return;
        }

        const tableId = endChoiceTableId;
        setMoveTabSubmitting(true);
        setTabErrorMessage(null);
        // Close immediately — overlapping Inertia visits can skip onSuccess
        // even after the server already moved the session.
        setShowExistingTabPicker(false);
        setExistingTabLoading(false);
        setExistingTabOptions([]);
        setSelectedExistingTabId(null);
        setExistingTabError(null);
        setEndChoiceOpen(false);
        setEndChoiceTableId(null);
        setEndChoiceSummary(null);
        setEndChoiceWasPaused(false);

        const result = await inertiaPost(
            `/tables/${tableId}/move-to-checkout`,
            { time_blocks: endChoiceBlockCounts },
        );
        setMoveTabSubmitting(false);

        if (result !== 'success') {
            if (result === 'error') {
                setTabErrorMessage('Failed to create open tab. Refreshing…');
            }

            router.reload();

            return;
        }

        setTabSuccessMessage('Open tab created successfully.');
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
                setExistingTabError(
                    'No open tabs available. Create a new tab instead.',
                );

                return;
            }

            setSelectedExistingTabId(options[0].id);
        } catch {
            setExistingTabError('Failed to load open tabs.');
        } finally {
            setExistingTabLoading(false);
        }
    };

    const handleConfirmMoveToExistingTab = async () => {
        if (
            endChoiceTableId == null ||
            selectedExistingTabId == null ||
            moveTabSubmitting
        ) {
            return;
        }

        const tableId = endChoiceTableId;
        const checkoutId = selectedExistingTabId;
        setMoveTabSubmitting(true);
        setTabErrorMessage(null);
        setShowExistingTabPicker(false);
        setExistingTabLoading(false);
        setExistingTabOptions([]);
        setSelectedExistingTabId(null);
        setExistingTabError(null);
        setEndChoiceOpen(false);
        setEndChoiceTableId(null);
        setEndChoiceSummary(null);
        setEndChoiceWasPaused(false);

        const result = await inertiaPost(
            `/tables/${tableId}/move-to-checkout`,
            {
                checkout_session_id: checkoutId,
                time_blocks: endChoiceBlockCounts,
            },
        );
        setMoveTabSubmitting(false);

        if (result !== 'success') {
            if (result === 'error') {
                setTabErrorMessage(
                    'Failed to move session to tab. Refreshing…',
                );
            }

            router.reload();

            return;
        }

        setTabSuccessMessage('Session moved to existing open tab.');
    };

    const closeCheckout = (skipResume = false) => {
        const tableId = checkoutTableId;
        const wasPaused = checkoutWasPaused;
        setCheckoutOpen(false);
        setCheckoutSummary(null);
        setCheckoutTableId(null);
        setFrozenElapsedSeconds(null);
        setCheckoutWasPaused(false);

        // Only restore alarm when cancelling checkout. Successful pay keeps silence.
        if (!skipResume && tableId != null) {
            restoreExpiredAlarm(tableId);
        }

        if (!skipResume && wasPaused && tableId != null) {
            router.post(
                tablesRoutes.resume.url({ table: tableId }),
                {},
                {
                    preserveState: true,
                },
            );
        }
    };

    const handleCheckoutComplete = async () => {
        if (!checkoutSummary || submitting) {
            return;
        }

        const settlement = buildExactSettlementPayments({
            expected: checkoutGrandTotal,
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
        const payload: {
            payments: { method: string; amount: number }[];
            customer_email?: string;
            time_blocks: TimeBlockCounts;
        } = {
            payments: settlement.payments,
            time_blocks: checkoutBlockCounts,
        };

        if (customerEmail.trim()) {
            payload.customer_email = customerEmail.trim();
        }

        setSubmitting(true);
        closeCheckout(true);
        const result = await inertiaPost(url, payload);
        setSubmitting(false);

        if (result !== 'success') {
            if (result === 'error') {
                setCheckoutError('Payment failed. Please try again.');
            }

            router.reload();
        }
    };

    const openCancelSessionDialog = (tableId: number) => {
        setCancelSessionTableId(tableId);
        setCancelSessionError(null);
        setCancelSessionReason('');
        setCancelSessionRestock(true);
        setCancelSessionOpen(true);
    };

    const confirmCancelSession = async () => {
        if (cancelSessionTableId == null) {
            return;
        }

        if (cancelSessionReason.trim() === '') {
            setCancelSessionError('Reason is required to cancel a session.');

            return;
        }

        setCancelSessionSubmitting(true);
        setCancelSessionError(null);

        try {
            const res = await fetch(
                `/tables/${cancelSessionTableId}/cancel-session`,
                {
                    method: 'POST',
                    headers: jsonHeaders(),
                    body: JSON.stringify({
                        reason: cancelSessionReason.trim() || null,
                        restock: cancelSessionRestock,
                    }),
                },
            );
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(
                    data.message || 'Could not cancel the session.',
                );
            }

            setCancelSessionOpen(false);
            setCancelSessionTableId(null);
            setCancelSessionReason('');
            setCancelSessionRestock(true);
            router.reload();
        } catch (error) {
            setCancelSessionError(
                error instanceof Error
                    ? error.message
                    : 'Could not cancel the session.',
            );
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
        setEditSessionReason('');
        setEditSessionItemsOpen(true);
    };

    const closeEditSessionItems = () => {
        setEditSessionItemsOpen(false);
        setEditSessionTableId(null);
        setEditSessionDraft([]);
        setEditSessionRemovedIds([]);
        setEditSessionError(null);
        setEditSessionReason('');
    };

    const saveEditSessionItems = async () => {
        if (editSessionTableId == null || editSessionReason.trim() === '') {
            setEditSessionError('Reason is required.');

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
            const res = await fetch(
                `/admin/tables/${editSessionTableId}/session-items`,
                {
                    method: 'PUT',
                    headers: jsonHeaders(),
                    credentials: 'same-origin',
                    body: JSON.stringify({
                        items,
                        reason: editSessionReason.trim(),
                    }),
                },
            );
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                setEditSessionError(
                    typeof data.message === 'string'
                        ? data.message
                        : 'Could not save items.',
                );

                return;
            }

            closeEditSessionItems();
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
            setTabErrorMessage('This Special deal is not active today.');

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

    const handleConfirmAddItemTable = async () => {
        if (!addItemTableId || addItemCart.length === 0 || addItemSubmitting) {
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

        const tableId = addItemTableId;
        setAddItemSubmitting(true);
        setAddItemModalOpen(false);
        setAddItemTableId(null);
        setAddItemCart([]);

        const result = await inertiaPost(`/tables/${tableId}/items/bulk`, {
            items,
        });
        setAddItemSubmitting(false);

        if (result !== 'success') {
            if (result === 'error') {
                setTabErrorMessage('Failed to add items. Refreshing…');
            }

            router.reload();
        }
    };

    const handleSaveEdit = () => {
        if (!selectedTable) {
            return;
        }

        router.put(`/admin/tables/${selectedTable.id}`, {
            name: editName,
            status: editTable?.status ?? selectedTable.status,
            rotation: editRotation,
        });
    };
    const moveTable = (table: Table, direction: -1 | 1) => {
        const index = tables.findIndex((item) => item.id === table.id);
        const target = index + direction;

        if (index < 0 || target < 0 || target >= tables.length) {
            return;
        }

        const ids = tables.map((item) => item.id);
        const [moved] = ids.splice(index, 1);
        ids.splice(target, 0, moved);
        router.put('/admin/tables/reorder', { ids }, { preserveScroll: true });
    };
    const handleDeleteTable = () => {
        if (!selectedTable) {
            return;
        }

        router.delete(`/admin/tables/${selectedTable.id}`, {
            onSuccess: () => {
                setEditTable(null);
                setDeleteAlertOpen(false);
                setSelectedTableId(null);
            },
        });
    };
    const handleAddTable = () => {
        const name = newTableName.trim();

        if (!name) {
            return;
        }

        router.post(
            '/admin/tables',
            { name },
            {
                onSuccess: () => {
                    setAddTableOpen(false);
                    setNewTableName('');
                },
            },
        );
    };

    const selectedTable =
        tables.find((table) => table.id === selectedTableId) ?? null;

    useEffect(() => {
        if (selectedTableId == null) {
            return;
        }

        if (!selectedTable) {
            return;
        }

        setEditTable(selectedTable);
        setEditName(selectedTable.name);
        setEditRotation(selectedTable.rotation === 90 ? 90 : 0);
        setDeleteAlertOpen(false);
    }, [selectedTable, selectedTableId]);

    return (
        <AppLayout breadcrumbs={[]}>
            <Head title={t('Tables')} />
            <div className="flex min-h-[calc(100svh-4rem)] flex-1 items-stretch">
                <div className="flex min-w-0 flex-1 flex-col gap-4 p-4">
                    {tabSuccessMessage && (
                        <div className="pointer-events-none fixed top-6 left-1/2 z-50 w-full max-w-md -translate-x-1/2 px-2 sm:px-0">
                            <Alert>
                                <CheckCircle2Icon />
                                <AlertTitle>Success</AlertTitle>
                                <AlertDescription>
                                    {tabSuccessMessage}
                                </AlertDescription>
                            </Alert>
                        </div>
                    )}
                    {tabErrorMessage && (
                        <div className="pointer-events-none fixed top-6 left-1/2 z-50 w-full max-w-md -translate-x-1/2 px-2 sm:px-0">
                            <Alert variant="destructive">
                                <AlertTitle>Action failed</AlertTitle>
                                <AlertDescription>
                                    {tabErrorMessage}
                                </AlertDescription>
                            </Alert>
                        </div>
                    )}
                    <PageHeader title={t('Tables')}>
                        {isAdmin && (
                            <Button
                                onClick={() => setAddTableOpen(true)}
                                size="sm"
                                className="gap-1.5"
                            >
                                <Plus className="h-4 w-4" />
                                {t('Add table')}
                            </Button>
                        )}
                    </PageHeader>

                    <div className="@container w-full">
                        <div className="grid w-full grid-cols-1 items-center justify-items-center gap-4 sm:mx-auto sm:w-max sm:max-w-full sm:grid-cols-[repeat(2,max-content)] xl:grid-cols-[repeat(4,max-content)]">
                            {tables.map((table) => {
                                const {
                                    hasSession,
                                    isRunning,
                                    isPaused,
                                    isMaintenance,
                                    showTimer,
                                } = sessionFlags(table);

                                const glowClass = isMaintenance
                                    ? 'shadow-[0_0_28px_rgba(244,63,94,0.5)] ring-[3px] ring-rose-500/60'
                                    : isPaused
                                      ? 'shadow-[0_0_28px_rgba(245,158,11,0.5)] ring-[3px] ring-amber-500/60'
                                      : isRunning
                                        ? 'shadow-[0_0_28px_rgba(16,185,129,0.5)] ring-[3px] ring-emerald-500/60'
                                        : 'shadow-[0_0_24px_rgba(34,197,94,0.4)] ring-[3px] ring-emerald-500/50';

                                const horizontal = table.rotation === 90;
                                const selected = selectedTableId === table.id;

                                return (
                                    <button
                                        key={table.id}
                                        type="button"
                                        onClick={() =>
                                            setSelectedTableId((current) =>
                                                current === table.id
                                                    ? null
                                                    : table.id,
                                            )
                                        }
                                        className={`flex min-w-0 cursor-pointer flex-col items-center border-0 bg-transparent p-0 ${horizontal ? 'w-full sm:w-[calc((100cqw-1rem)/2)] xl:w-[min(calc((100cqw-3rem)/4),calc((100svh-15.5rem)/2))]' : 'w-[calc(100%/1.85)] sm:w-[calc((100cqw-1rem)/3.7)] xl:w-[min(calc((100cqw-3rem)/7.4),calc((100svh-15.5rem)/3.7))]'}`}
                                    >
                                        <span
                                            className={`mb-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                                hasSession
                                                    ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                                    : 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                                            }`}
                                        >
                                            {table.name}
                                        </span>

                                        <div
                                            className={`relative w-full rounded-xl transition-shadow duration-300 ${horizontal ? 'aspect-[1.85/1]' : 'aspect-[1/1.85]'} ${glowClass} ${selected ? 'outline outline-2 outline-offset-2 outline-white/80' : ''}`}
                                        >
                                            <div className="relative h-full rounded-lg border-4 border-amber-800/90 bg-amber-900/80 p-1 shadow-inner">
                                                <div className="absolute top-0 left-0 h-2.5 w-2.5 rounded-full bg-black" />
                                                <div className="absolute top-0 right-0 h-2.5 w-2.5 rounded-full bg-black" />
                                                <div
                                                    className={`absolute h-2.5 w-2.5 rounded-full bg-black ${horizontal ? 'top-0 left-1/2 -translate-x-1/2' : 'top-1/2 left-0 -translate-y-1/2'}`}
                                                />
                                                <div
                                                    className={`absolute h-2.5 w-2.5 rounded-full bg-black ${horizontal ? 'bottom-0 left-1/2 -translate-x-1/2' : 'top-1/2 right-0 -translate-y-1/2'}`}
                                                />
                                                <div className="absolute bottom-0 left-0 h-2.5 w-2.5 rounded-full bg-black" />
                                                <div className="absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full bg-black" />

                                                <div className="relative flex h-full w-full flex-col rounded-md bg-slate-700">
                                                    <div className="flex flex-1 items-center justify-center px-2">
                                                        {showTimer && (
                                                            <div className="flex flex-col items-center gap-1">
                                                                <span
                                                                    className={`font-mono text-base font-semibold tabular-nums ${getTimerToneClass(table)}`}
                                                                >
                                                                    {getDisplayTime(
                                                                        table,
                                                                    )}
                                                                </span>
                                                                {table
                                                                    .current_session
                                                                    ?.billing_mode ===
                                                                    'prepaid' && (
                                                                    <span className="text-[10px] tracking-wide text-slate-300 uppercase">
                                                                        {table
                                                                            .current_session
                                                                            .prepaid_as_timer
                                                                            ? t(
                                                                                  'Extra',
                                                                              )
                                                                            : t(
                                                                                  'Prepaid',
                                                                              )}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                        {!showTimer && (
                                                            <span className="text-sm text-slate-500">
                                                                —
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <Dialog
                        open={endChoiceOpen}
                        onOpenChange={(open) => !open && closeEndChoice()}
                    >
                        <DialogContent className="sm:max-w-lg [&>*]:min-w-0">
                            <DialogHeader>
                                <DialogTitle>
                                    {t('End session — {name}', {
                                        name:
                                            endChoiceSummary?.table_name ??
                                            t('Table'),
                                    })}
                                </DialogTitle>
                                <DialogDescription>
                                    {endChoiceSummary?.billing_mode ===
                                    'prepaid'
                                        ? t(
                                              'Prepaid {amount} is already paid. Add blocks only for extra time, then pay drinks and that extra.',
                                              {
                                                  amount: money(
                                                      endChoiceSummary.prepaid_amount ||
                                                          0,
                                                  ),
                                              },
                                          )
                                        : t(
                                              'Played time is a hint only. Stack 1h / 30m / 15m blocks, then pay or move to a tab.',
                                          )}
                                </DialogDescription>
                            </DialogHeader>
                            {endChoiceSummary && !showExistingTabPicker && (
                                <>
                                    <TimeBlockPicker
                                        blocks={catalogBlocks}
                                        counts={endChoiceBlockCounts}
                                        onChange={setEndChoiceBlockCounts}
                                        playedLabel={
                                            endChoiceSummary.played_seconds !=
                                            null
                                                ? formatElapsedSeconds(
                                                      endChoiceSummary.played_seconds,
                                                  )
                                                : null
                                        }
                                    />
                                    <div className="flex justify-between text-sm font-semibold">
                                        <span>{t('Estimated total')}</span>
                                        <span>
                                            {money(endChoiceGrandTotal)}
                                        </span>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {t('Items {items} · Time {time}', {
                                            items: money(
                                                endChoiceSummary.items_total,
                                            ),
                                            time: money(endChoiceTimeTotal),
                                        })}
                                    </div>
                                    <DialogFooter
                                        className={`grid w-full gap-2 sm:grid ${
                                            endChoiceSummary.billing_mode ===
                                            'prepaid'
                                                ? 'grid-cols-1'
                                                : 'grid-cols-3'
                                        }`}
                                    >
                                        <Button
                                            className="h-auto min-h-9 w-full px-3 py-2 whitespace-normal"
                                            onClick={() => {
                                                if (
                                                    endChoiceSummary.billing_mode ===
                                                        'prepaid' &&
                                                    endChoiceGrandTotal <= 0.01
                                                ) {
                                                    void inertiaPost(
                                                        tablesRoutes.end.url({
                                                            table: endChoiceSummary.table_id,
                                                        }),
                                                        {
                                                            payments: [],
                                                            time_blocks:
                                                                endChoiceBlockCounts,
                                                        },
                                                        {
                                                            onError: () => {
                                                                router.reload();
                                                            },
                                                        },
                                                    );

                                                    return;
                                                }

                                                openPayNowModal();
                                            }}
                                        >
                                            {endChoiceSummary.billing_mode ===
                                                'prepaid' &&
                                            endChoiceGrandTotal <= 0.01
                                                ? t('Close table')
                                                : t('Pay now')}
                                        </Button>
                                        {endChoiceSummary.billing_mode !==
                                            'prepaid' && (
                                            <>
                                                <Button
                                                    className="h-auto min-h-9 w-full px-3 py-2 whitespace-normal"
                                                    variant="outline"
                                                    disabled={moveTabSubmitting}
                                                    onClick={() =>
                                                        void handleMoveToOpenTab()
                                                    }
                                                >
                                                    {moveTabSubmitting
                                                        ? t('Moving…')
                                                        : t('New tab')}
                                                </Button>
                                                <Button
                                                    className="h-auto min-h-9 w-full px-3 py-2 whitespace-normal"
                                                    variant="outline"
                                                    disabled={moveTabSubmitting}
                                                    onClick={
                                                        handleMoveToExistingTab
                                                    }
                                                >
                                                    {t('Add to existing tab')}
                                                </Button>
                                            </>
                                        )}
                                    </DialogFooter>
                                </>
                            )}
                            {endChoiceSummary && showExistingTabPicker && (
                                <div className="space-y-3">
                                    <div>
                                        <Label className="text-xs tracking-wide text-muted-foreground uppercase">
                                            Open tabs
                                        </Label>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            Select one tab to merge this table
                                            session into.
                                        </p>
                                    </div>
                                    <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-sidebar-border/70 bg-muted/20 p-2">
                                        {existingTabLoading && (
                                            <p className="text-sm text-muted-foreground">
                                                Loading tabs...
                                            </p>
                                        )}
                                        {!existingTabLoading &&
                                            existingTabOptions.map((option) => (
                                                <button
                                                    key={option.id}
                                                    type="button"
                                                    onClick={() =>
                                                        setSelectedExistingTabId(
                                                            option.id,
                                                        )
                                                    }
                                                    className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                                                        selectedExistingTabId ===
                                                        option.id
                                                            ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                                                            : 'border-sidebar-border/70 bg-background hover:bg-accent'
                                                    }`}
                                                >
                                                    <div className="font-medium">
                                                        {option.label}
                                                    </div>
                                                </button>
                                            ))}
                                        {!existingTabLoading &&
                                            existingTabOptions.length === 0 &&
                                            !existingTabError && (
                                                <p className="text-sm text-muted-foreground">
                                                    No open tabs available.
                                                </p>
                                            )}
                                    </div>
                                    {existingTabError && (
                                        <p className="text-sm text-destructive">
                                            {existingTabError}
                                        </p>
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
                                                disabled={moveTabSubmitting}
                                                onClick={() =>
                                                    void handleMoveToOpenTab()
                                                }
                                            >
                                                {moveTabSubmitting
                                                    ? 'Moving…'
                                                    : 'New tab instead'}
                                            </Button>
                                            <Button
                                                className="w-full sm:w-auto"
                                                disabled={
                                                    moveTabSubmitting ||
                                                    selectedExistingTabId ==
                                                        null ||
                                                    existingTabLoading
                                                }
                                                onClick={() =>
                                                    void handleConfirmMoveToExistingTab()
                                                }
                                            >
                                                {moveTabSubmitting
                                                    ? 'Moving…'
                                                    : 'Move to selected tab'}
                                            </Button>
                                        </div>
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
                        <DialogContent className="max-h-[90vh] overflow-x-hidden overflow-y-auto sm:max-w-md [&>*]:min-w-0">
                            <DialogHeader>
                                <DialogTitle>
                                    {t('Edit session items')}
                                </DialogTitle>
                                <DialogDescription>
                                    Adjust quantities or remove lines for this
                                    table session. Use{' '}
                                    <span className="font-medium">
                                        Add item
                                    </span>{' '}
                                    to add products. Timer charges are separate.
                                </DialogDescription>
                            </DialogHeader>
                            {editSessionDraft.length === 0 && (
                                <p className="text-sm text-muted-foreground">
                                    No lines to edit.
                                </p>
                            )}
                            {editSessionDraft.length > 0 && (
                                <ul className="max-h-64 space-y-3 overflow-y-auto text-sm">
                                    {editSessionDraft.map((line) => (
                                        <li
                                            key={line.id}
                                            className="flex flex-col gap-2 rounded-md border border-border/80 bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="font-medium">
                                                    {line.product_name}
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    {money(line.unit_price)}{' '}
                                                    each · line{' '}
                                                    {money(line.total_price)}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Label
                                                    className="sr-only"
                                                    htmlFor={`sess-qty-${line.id}`}
                                                >
                                                    Quantity
                                                </Label>
                                                <Input
                                                    id={`sess-qty-${line.id}`}
                                                    type="number"
                                                    min={1}
                                                    className="h-9 w-20"
                                                    value={line.quantity}
                                                    onChange={(e) =>
                                                        updateEditSessionQty(
                                                            line.id,
                                                            Number(
                                                                e.target.value,
                                                            ) || 1,
                                                        )
                                                    }
                                                />
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="destructive"
                                                    onClick={() =>
                                                        removeEditSessionLine(
                                                            line.id,
                                                        )
                                                    }
                                                >
                                                    Remove
                                                </Button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {editSessionError && (
                                <p className="text-sm text-destructive">
                                    {editSessionError}
                                </p>
                            )}
                            <div className="space-y-2">
                                <Label htmlFor="edit-session-reason">
                                    Reason (required)
                                </Label>
                                <textarea
                                    id="edit-session-reason"
                                    className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    value={editSessionReason}
                                    onChange={(event) =>
                                        setEditSessionReason(event.target.value)
                                    }
                                    placeholder="Explain why this correction is needed"
                                />
                            </div>
                            <DialogFooter>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={closeEditSessionItems}
                                    disabled={editSessionSaving}
                                >
                                    Close
                                </Button>
                                <Button
                                    type="button"
                                    onClick={saveEditSessionItems}
                                    disabled={
                                        editSessionSaving ||
                                        editSessionReason.trim() === '' ||
                                        (editSessionDraft.length === 0 &&
                                            editSessionRemovedIds.length === 0)
                                    }
                                >
                                    {editSessionSaving
                                        ? 'Saving…'
                                        : 'Save changes'}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    <Dialog
                        open={addItemModalOpen}
                        onOpenChange={(open) =>
                            !open && setAddItemModalOpen(false)
                        }
                    >
                        <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-5xl">
                            <DialogHeader>
                                <DialogTitle>{t('Add Items')}</DialogTitle>
                                <DialogDescription>
                                    Search and add multiple products to this
                                    table&apos;s session.
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
                                            Categories
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
                                                    {cat}
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
                                                {filteredProducts.length ===
                                                    0 && (
                                                    <div className="col-span-2 px-2 py-1 text-muted-foreground">
                                                        No products match your
                                                        search.
                                                    </div>
                                                )}
                                                {filteredProducts.map((p) => {
                                                    const dealOff =
                                                        !!p.is_deal &&
                                                        p.deal_active === false;
                                                    const displayPrice =
                                                        p.is_deal
                                                            ? Number(p.price) *
                                                              Number(
                                                                  p.deal_buy_qty ??
                                                                      1,
                                                              )
                                                            : Number(p.price);

                                                    return (
                                                        <button
                                                            key={p.id}
                                                            type="button"
                                                            disabled={dealOff}
                                                            onClick={() =>
                                                                addProductToCart(
                                                                    p,
                                                                )
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
                                                                    ? 'Deal off'
                                                                    : p.is_deal
                                                                      ? `Packages: ${p.stock_quantity}`
                                                                      : `Stock: ${p.stock_quantity}`}
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
                                                        className={
                                                            posCartRowClass
                                                        }
                                                    >
                                                        <div className="flex-1">
                                                            <div className="text-sm font-medium">
                                                                {item.name}
                                                            </div>
                                                            <div className="text-xs text-muted-foreground">
                                                                {item.quantity}{' '}
                                                                ×{' '}
                                                                {money(
                                                                    item.price,
                                                                )}
                                                            </div>
                                                        </div>
                                                        <Input
                                                            type="number"
                                                            min={0}
                                                            className="h-8 w-16"
                                                            value={
                                                                item.quantity
                                                            }
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
                                        <div className="mt-3 border-t border-emerald-500/40 pt-3">
                                            <div className="mb-3 flex items-center justify-between text-sm font-semibold">
                                                <span>Total:</span>
                                                <span>{money(cartTotal)}</span>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="flex-1"
                                                onClick={() =>
                                                    setAddItemCart([])
                                                }
                                                disabled={
                                                    addItemCart.length === 0
                                                }
                                            >
                                                Clear
                                            </Button>
                                            <Button
                                                type="button"
                                                className="flex-1"
                                                onClick={
                                                    handleConfirmAddItemTable
                                                }
                                                disabled={
                                                    addItemSubmitting ||
                                                    addItemCart.every(
                                                        (i) => i.quantity <= 0,
                                                    )
                                                }
                                            >
                                                {addItemSubmitting
                                                    ? 'Adding…'
                                                    : 'Add items'}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </DialogContent>
                    </Dialog>

                    <Dialog
                        open={addTableOpen}
                        onOpenChange={(open) => !open && setAddTableOpen(false)}
                    >
                        <DialogContent className="sm:max-w-sm">
                            <DialogHeader>
                                <DialogTitle>{t('Add table')}</DialogTitle>
                                <DialogDescription>
                                    Create a new billiard table.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="new-table-name">Name</Label>
                                    <Input
                                        id="new-table-name"
                                        value={newTableName}
                                        onChange={(e) =>
                                            setNewTableName(e.target.value)
                                        }
                                        placeholder={t('e.g. Table 1')}
                                    />
                                </div>
                                <DialogFooter>
                                    <Button
                                        variant="outline"
                                        onClick={() => setAddTableOpen(false)}
                                    >
                                        {t('Cancel')}
                                    </Button>
                                    <Button
                                        onClick={handleAddTable}
                                        disabled={!newTableName.trim()}
                                    >
                                        {t('Add table')}
                                    </Button>
                                </DialogFooter>
                            </div>
                        </DialogContent>
                    </Dialog>

                    <Dialog
                        open={checkoutOpen}
                        onOpenChange={(open) => !open && closeCheckout()}
                    >
                        <DialogContent className="max-h-[90vh] overflow-x-hidden overflow-y-auto sm:max-w-md [&>*]:min-w-0">
                            <DialogHeader>
                                <DialogTitle>
                                    {t('Checkout — {name}', {
                                        name:
                                            checkoutSummary?.table_name ??
                                            t('Table'),
                                    })}
                                </DialogTitle>
                                <DialogDescription>
                                    {checkoutSummary?.billing_mode === 'prepaid'
                                        ? t(
                                              'Prepaid {amount} is already paid. Collect payment for the items only.',
                                              {
                                                  amount: money(
                                                      checkoutSummary.prepaid_amount ||
                                                          0,
                                                  ),
                                              },
                                          )
                                        : t(
                                              'Split between cash, card, and transfer. Cash may exceed the total; change is returned from cash.',
                                          )}
                                </DialogDescription>
                            </DialogHeader>
                            {checkoutSummary && (
                                <>
                                    {checkoutSummary.billing_mode !==
                                        'prepaid' && (
                                        <>
                                            <div className="text-xs text-muted-foreground">
                                                Played{' '}
                                                {formatElapsedSeconds(
                                                    frozenElapsedSeconds ??
                                                        checkoutSummary.played_seconds ??
                                                        0,
                                                )}
                                            </div>
                                            <TimeBlockPicker
                                                blocks={checkoutBlocks}
                                                counts={checkoutBlockCounts}
                                                onChange={
                                                    setCheckoutBlockCounts
                                                }
                                            />
                                        </>
                                    )}
                                    <div className="grid gap-2 text-sm">
                                        {checkoutSummary.billing_mode !==
                                            'prepaid' && (
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">
                                                    {t('Time')}
                                                </span>
                                                <span>
                                                    {money(checkoutTimeTotal)}
                                                </span>
                                            </div>
                                        )}
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">
                                                {t('Items')}
                                            </span>
                                            <span>
                                                {money(
                                                    checkoutSummary.items_total,
                                                )}
                                            </span>
                                        </div>
                                        <div className="flex justify-between font-semibold">
                                            <span>{t('Grand total')}</span>
                                            <span>
                                                {money(checkoutGrandTotal)}
                                            </span>
                                        </div>
                                    </div>
                                    <PaymentForm
                                        total={checkoutGrandTotal}
                                        cash={cash}
                                        card={card}
                                        transfer={transfer}
                                        email={customerEmail}
                                        onCashChange={(value) => {
                                            setCash(value);
                                            setCheckoutError(null);
                                        }}
                                        onCardChange={(value) => {
                                            setCard(value);
                                            setCheckoutError(null);
                                        }}
                                        onTransferChange={(value) => {
                                            setTransfer(value);
                                            setCheckoutError(null);
                                        }}
                                        onEmailChange={setCustomerEmail}
                                    />
                                    {checkoutError && (
                                        <p className="text-sm text-destructive">
                                            {checkoutError}
                                        </p>
                                    )}
                                    <DialogFooter className="flex-col gap-2 sm:flex-col">
                                        <Button
                                            className="h-11 w-full"
                                            onClick={handleCheckoutComplete}
                                            disabled={submitting}
                                        >
                                            {submitting
                                                ? t('Completing…')
                                                : t(
                                                      'Complete checkout · {amount}',
                                                      {
                                                          amount: money(
                                                              checkoutGrandTotal,
                                                          ),
                                                      },
                                                  )}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            className="w-full"
                                            onClick={() => closeCheckout()}
                                            disabled={submitting}
                                        >
                                            Cancel
                                        </Button>
                                    </DialogFooter>
                                </>
                            )}
                            {checkoutLoading && (
                                <p className="text-sm text-muted-foreground">
                                    Loading…
                                </p>
                            )}
                        </DialogContent>
                    </Dialog>

                    <Dialog
                        open={alertDialogOpen}
                        onOpenChange={(open) => {
                            setAlertDialogOpen(open);

                            if (!open) {
                                const tableId = alertDialogTableId;
                                setAlertDialogTableId(null);
                                setAlertDraftCounts(
                                    emptyBlockCounts(catalogBlocks),
                                );

                                if (
                                    !alertClosedAfterSaveRef.current &&
                                    tableId != null
                                ) {
                                    restoreExpiredAlarm(tableId);
                                }

                                alertClosedAfterSaveRef.current = false;
                            }
                        }}
                    >
                        <DialogContent className="overflow-x-hidden sm:max-w-md [&>*]:min-w-0">
                            <DialogHeader>
                                <DialogTitle>
                                    {alertDialogExtend
                                        ? t('Extend timer')
                                        : t('Set timer')}
                                </DialogTitle>
                                <DialogDescription>
                                    {t(
                                        'Adds time to this table’s play clock countdown. Pause freezes it. Billing still uses blocks when you end.',
                                    )}
                                </DialogDescription>
                            </DialogHeader>
                            <TimeBlockPicker
                                blocks={catalogBlocks}
                                counts={alertDraftCounts}
                                onChange={setAlertDraftCounts}
                            />
                            <DialogFooter className="flex-col gap-2 sm:flex-col">
                                <Button
                                    className="w-full"
                                    disabled={
                                        alertSubmitting ||
                                        totalForBlockCounts(
                                            alertDraftCounts,
                                            catalogBlocks,
                                        ) <= 0
                                    }
                                    onClick={async () => {
                                        if (alertDialogTableId == null) {
                                            return;
                                        }

                                        const tableId = alertDialogTableId;
                                        setAlertSubmitting(true);
                                        const result = await inertiaPost(
                                            `/tables/${tableId}/alert`,
                                            {
                                                time_blocks: alertDraftCounts,
                                                extend: alertDialogExtend,
                                            },
                                            { preserveState: true },
                                        );
                                        setAlertSubmitting(false);

                                        if (result === 'success') {
                                            silenceExpiredAlarm(tableId);
                                            alertClosedAfterSaveRef.current = true;
                                            setAlertDialogOpen(false);
                                            setAlertDialogTableId(null);
                                        } else {
                                            restoreExpiredAlarm(tableId);
                                            router.reload();
                                        }
                                    }}
                                >
                                    {alertSubmitting
                                        ? 'Saving…'
                                        : alertDialogExtend
                                          ? 'Extend alert'
                                          : 'Start alert'}
                                </Button>
                                <Button
                                    variant="ghost"
                                    className="w-full"
                                    disabled={alertSubmitting}
                                    onClick={() => setAlertDialogOpen(false)}
                                >
                                    Cancel
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    <Dialog
                        open={expiredAlertTableId != null}
                        onOpenChange={() => {
                            /* must take an action */
                        }}
                    >
                        <DialogContent
                            className="sm:max-w-md"
                            onPointerDownOutside={(e) => e.preventDefault()}
                            onEscapeKeyDown={(e) => e.preventDefault()}
                        >
                            <DialogHeader>
                                <DialogTitle className="text-rose-600 dark:text-rose-400">
                                    {tables.find(
                                        (table) =>
                                            table.id === expiredAlertTableId,
                                    )?.current_session?.billing_mode ===
                                        'prepaid' &&
                                    !tables.find(
                                        (table) =>
                                            table.id === expiredAlertTableId,
                                    )?.current_session?.prepaid_as_timer
                                        ? t('Prepaid time is up')
                                        : t('Alert time is up')}
                                    {expiredAlertTableId
                                        ? ` — ${
                                              tables.find(
                                                  (t) =>
                                                      t.id ===
                                                      expiredAlertTableId,
                                              )?.name ?? 'Table'
                                          }`
                                        : ''}
                                </DialogTitle>
                                <DialogDescription>
                                    {t(
                                        'Choose what to do next. This dialog stays open until you act.',
                                    )}
                                </DialogDescription>
                            </DialogHeader>
                            <DialogFooter className="flex-col gap-2 sm:flex-col">
                                <Button
                                    className="w-full"
                                    onClick={() => {
                                        if (expiredAlertTableId == null) {
                                            return;
                                        }

                                        const id = expiredAlertTableId;
                                        const expiredSession = tables.find(
                                            (table) => table.id === id,
                                        )?.current_session;
                                        const prepaidClock =
                                            expiredSession?.billing_mode ===
                                                'prepaid' &&
                                            !expiredSession.prepaid_as_timer;
                                        silenceExpiredAlarm(id);

                                        if (prepaidClock) {
                                            openPrepaid(id, true);

                                            return;
                                        }

                                        setAlertDialogTableId(id);
                                        setAlertDialogExtend(true);
                                        setAlertDraftCounts(
                                            emptyBlockCounts(catalogBlocks),
                                        );
                                        setAlertDialogOpen(true);
                                    }}
                                >
                                    {tables.find(
                                        (table) =>
                                            table.id === expiredAlertTableId,
                                    )?.current_session?.billing_mode ===
                                        'prepaid' &&
                                    !tables.find(
                                        (table) =>
                                            table.id === expiredAlertTableId,
                                    )?.current_session?.prepaid_as_timer
                                        ? t('Extend prepaid')
                                        : t('Extend alert')}
                                </Button>
                                <Button
                                    className="w-full"
                                    variant="destructive"
                                    onClick={() => {
                                        if (expiredAlertTableId == null) {
                                            return;
                                        }

                                        const id = expiredAlertTableId;
                                        silenceExpiredAlarm(id);
                                        handleAction(id, 'end');
                                    }}
                                >
                                    {t('End session')}
                                </Button>
                                <Button
                                    className="w-full"
                                    variant="outline"
                                    onClick={async () => {
                                        if (expiredAlertTableId == null) {
                                            return;
                                        }

                                        const id = expiredAlertTableId;
                                        silenceExpiredAlarm(id);
                                        const result = await inertiaPost(
                                            `/tables/${id}/alert/clear`,
                                            {},
                                            { preserveState: true },
                                        );

                                        if (result !== 'success') {
                                            restoreExpiredAlarm(id);
                                            router.reload();
                                        }
                                    }}
                                >
                                    {tables.find(
                                        (table) =>
                                            table.id === expiredAlertTableId,
                                    )?.current_session?.billing_mode ===
                                        'prepaid' &&
                                    !tables.find(
                                        (table) =>
                                            table.id === expiredAlertTableId,
                                    )?.current_session?.prepaid_as_timer
                                        ? t('Continue as timer')
                                        : t('Clear alert · keep playing')}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    <Dialog
                        open={prepaidOpen}
                        onOpenChange={(open) => {
                            setPrepaidOpen(open);

                            if (!open) {
                                setPrepaidTableId(null);
                                setPrepaidError(null);
                            }
                        }}
                    >
                        <DialogContent className="max-h-[85vh] overflow-x-hidden overflow-y-auto sm:max-w-md [&>*]:min-w-0">
                            <DialogHeader>
                                <DialogTitle>
                                    {prepaidExtend
                                        ? t('Extend prepaid')
                                        : t('Prepaid start')}
                                </DialogTitle>
                                <DialogDescription>
                                    {t(
                                        'Take the money now. The table counts down that time. When it hits zero you can extend, end, or keep playing on a timer.',
                                    )}
                                </DialogDescription>
                            </DialogHeader>
                            <TimeBlockPicker
                                blocks={catalogBlocks}
                                counts={prepaidCounts}
                                onChange={setPrepaidCounts}
                            />
                            <PaymentForm
                                total={prepaidTotal}
                                totalHint={`Prepaid ${money(prepaidTotal)}`}
                                cash={prepaidCash}
                                card={prepaidCard}
                                transfer={prepaidTransfer}
                                email={prepaidEmail}
                                onCashChange={setPrepaidCash}
                                onCardChange={setPrepaidCard}
                                onTransferChange={setPrepaidTransfer}
                                onEmailChange={setPrepaidEmail}
                            />
                            {prepaidError && (
                                <p className="text-sm text-destructive">
                                    {prepaidError}
                                </p>
                            )}
                            <DialogFooter className="flex-col gap-2 sm:flex-col">
                                <Button
                                    className="w-full"
                                    disabled={
                                        prepaidSubmitting || prepaidTotal <= 0
                                    }
                                    onClick={() => void submitPrepaid()}
                                >
                                    {prepaidSubmitting
                                        ? 'Saving…'
                                        : prepaidExtend
                                          ? `Extend · ${money(prepaidTotal)}`
                                          : `Start prepaid · ${money(prepaidTotal)}`}
                                </Button>
                                <Button
                                    variant="ghost"
                                    className="w-full"
                                    disabled={prepaidSubmitting}
                                    onClick={() => setPrepaidOpen(false)}
                                >
                                    Cancel
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    <InvoiceDialog
                        receipt={invoiceReceipt}
                        open={!!invoiceReceipt}
                        onOpenChange={(open) =>
                            !open && setInvoiceReceipt(null)
                        }
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
                                setCancelSessionReason('');
                                setCancelSessionRestock(true);
                            }
                        }}
                    >
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>
                                    {t('Cancel active session?')}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                    This stops the timer and voids session
                                    items. No receipt is created.
                                    {cancelSessionTableId != null
                                        ? ` Table: ${tables.find((t) => t.id === cancelSessionTableId)?.name ?? `#${cancelSessionTableId}`}.`
                                        : ''}
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <div className="space-y-3">
                                <div className="space-y-2">
                                    <Label htmlFor="cancel-session-reason">
                                        Reason (required)
                                    </Label>
                                    <textarea
                                        id="cancel-session-reason"
                                        className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        value={cancelSessionReason}
                                        onChange={(event) => {
                                            setCancelSessionReason(
                                                event.target.value,
                                            );
                                            setCancelSessionError(null);
                                        }}
                                        placeholder="Explain why this session is being cancelled"
                                    />
                                </div>
                                <label className="flex items-start gap-3 rounded-md border border-border/70 bg-muted/30 p-3 text-sm">
                                    <Checkbox
                                        checked={cancelSessionRestock}
                                        onCheckedChange={(checked) =>
                                            setCancelSessionRestock(
                                                checked === true,
                                            )
                                        }
                                        className="mt-0.5"
                                    />
                                    <span>
                                        <span className="font-medium">
                                            Return products to stock
                                        </span>
                                        <span className="mt-0.5 block text-muted-foreground">
                                            Turn off if drinks/snacks were
                                            already given out or used.
                                        </span>
                                    </span>
                                </label>
                            </div>
                            {cancelSessionError && (
                                <p className="text-sm text-destructive">
                                    {cancelSessionError}
                                </p>
                            )}
                            <AlertDialogFooter>
                                <AlertDialogCancel
                                    disabled={cancelSessionSubmitting}
                                >
                                    Cancel
                                </AlertDialogCancel>
                                <AlertDialogAction
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    disabled={
                                        cancelSessionSubmitting ||
                                        cancelSessionReason.trim() === ''
                                    }
                                    onClick={async (e) => {
                                        e.preventDefault();
                                        await confirmCancelSession();
                                    }}
                                >
                                    {cancelSessionSubmitting
                                        ? 'Cancelling…'
                                        : 'Confirm cancel'}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
                {selectedTable && (
                    <TableSidePanel
                        table={selectedTable}
                        isAdmin={isAdmin}
                        displayTime={getDisplayTime(selectedTable)}
                        timerClass={getTimerToneClass(selectedTable)}
                        onClose={() => setSelectedTableId(null)}
                        onStart={() => handleAction(selectedTable.id, 'start')}
                        onPrepaid={() =>
                            openPrepaid(
                                selectedTable.id,
                                Boolean(selectedTable.current_session),
                            )
                        }
                        onPause={() => handleAction(selectedTable.id, 'pause')}
                        onResume={() =>
                            handleAction(selectedTable.id, 'resume')
                        }
                        onEnd={() => handleAction(selectedTable.id, 'end')}
                        onCancel={() =>
                            openCancelSessionDialog(selectedTable.id)
                        }
                        onAddItem={() => handleAddItem(selectedTable.id)}
                        onAlert={() => {
                            setAlertDialogTableId(selectedTable.id);
                            setAlertDialogExtend(
                                !!selectedTable.current_session?.has_alert,
                            );
                            setAlertDraftCounts(
                                emptyBlockCounts(catalogBlocks),
                            );
                            setAlertDialogOpen(true);
                        }}
                        onEditItems={() => openEditSessionItems(selectedTable)}
                        editName={editName}
                        onEditName={setEditName}
                        editRotation={editRotation}
                        onToggleRotation={() =>
                            setEditRotation((current) =>
                                current === 90 ? 0 : 90,
                            )
                        }
                        onMove={(direction) =>
                            moveTable(selectedTable, direction)
                        }
                        isFirst={tables[0]?.id === selectedTable.id}
                        isLast={
                            tables[tables.length - 1]?.id === selectedTable.id
                        }
                        editStatus={editTable?.status ?? selectedTable.status}
                        onEditStatus={(value) =>
                            setEditTable((prev) =>
                                prev ? { ...prev, status: value } : prev,
                            )
                        }
                        onSave={handleSaveEdit}
                        onDelete={handleDeleteTable}
                        deleteOpen={deleteAlertOpen}
                        onDeleteOpen={setDeleteAlertOpen}
                    />
                )}
            </div>
        </AppLayout>
    );
}
