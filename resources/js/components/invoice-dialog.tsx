import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/lib/i18n';

export type InvoiceLineItem = {
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

export type InvoiceReceipt = {
    id: number;
    receipt_number: string;
    date: string;
    time: string;
    table_name: string;
    customer_email?: string | null;
    time_total: number;
    products_total: number;
    grand_total: number;
    line_items: InvoiceLineItem[];
    payments?: { method: string; amount: number }[];
};

export default function InvoiceDialog({
    receipt,
    open,
    onOpenChange,
    money,
    emailMessage,
    emailSending,
    onEmail,
    onClose,
}: {
    receipt: InvoiceReceipt | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    money: (amount: number) => string;
    emailMessage?: string | null;
    emailSending?: boolean;
    onEmail: () => void;
    onClose: () => void;
}) {
    const { t } = useI18n();
    const methodLabel = (method: string) => {
        if (method === 'cash') {
            return t('Cash');
        }

        if (method === 'card') {
            return t('Card');
        }

        if (method === 'transfer_qr' || method === 'transfer') {
            return t('Transfer');
        }

        return method.replaceAll('_', ' ');
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t('Invoice')}</DialogTitle>
                </DialogHeader>
                {receipt && (
                    <>
                        <div className="invoice-print space-y-3 rounded-xl border border-sidebar-border/70 bg-background p-4 text-sm">
                            <div className="text-center">
                                <h2 className="text-lg font-semibold">
                                    Lox Billiard
                                </h2>
                                <p className="text-xs text-muted-foreground">
                                    {t('GAME INVOICE')}
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                                <span>{t('Invoice:')}</span>
                                <span className="font-medium text-foreground">
                                    {receipt.receipt_number}
                                </span>
                                <span>{t('Date:')}</span>
                                <span className="text-foreground">
                                    {receipt.date}
                                </span>
                                <span>{t('Time:')}</span>
                                <span className="text-foreground">
                                    {receipt.time}
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                                <span>{t('Customer:')}</span>
                                <span className="text-foreground">
                                    {receipt.customer_email || '—'}
                                </span>
                                <span>{t('Table:')}</span>
                                <span className="text-foreground">
                                    {receipt.table_name || t('Open tab')}
                                </span>
                            </div>
                            <div className="mt-2 border-t pt-2">
                                <div className="mb-1 text-xs font-medium text-muted-foreground">
                                    {t('Line items')}
                                </div>
                                {(receipt.line_items || []).map((item, i) => (
                                    <div
                                        key={i}
                                        className="flex justify-between py-0.5 text-sm"
                                    >
                                        <span>
                                            {item.type === 'time'
                                                ? `${item.duration} @ ${money(Number(item.rate) || 0)}/min`
                                                : `${item.quantity} × ${item.description}`}
                                        </span>
                                        <span>
                                            {money(Number(item.subtotal) || 0)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            {(receipt.payments?.length ?? 0) > 0 && (
                                <div className="mt-2 border-t pt-2">
                                    <div className="mb-1 text-xs font-medium text-muted-foreground">
                                        {t('Payments')}
                                    </div>
                                    {receipt.payments!.map((payment, i) => (
                                        <div
                                            key={i}
                                            className="flex justify-between py-0.5 text-sm"
                                        >
                                            <span>
                                                {methodLabel(payment.method)}
                                            </span>
                                            <span>
                                                {money(
                                                    Number(payment.amount) || 0,
                                                )}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="flex justify-between border-t pt-2 font-semibold">
                                <span>{t('Grand total')}</span>
                                <span>
                                    {money(Number(receipt.grand_total) || 0)}
                                </span>
                            </div>
                        </div>
                        {emailMessage && (
                            <p className="no-print text-sm text-muted-foreground">
                                {t(emailMessage)}
                            </p>
                        )}
                        <DialogFooter className="no-print flex-row gap-2 sm:gap-2">
                            <Button
                                variant="outline"
                                onClick={() => window.print()}
                            >
                                {t('Print')}
                            </Button>
                            <Button onClick={onEmail} disabled={!!emailSending}>
                                {emailSending ? t('Sending…') : t('Email')}
                            </Button>
                            <Button variant="secondary" onClick={onClose}>
                                {t('Close')}
                            </Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
