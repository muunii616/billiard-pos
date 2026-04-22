import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invoice</DialogTitle>
        </DialogHeader>
        {receipt && (
          <>
            <div className="invoice-print rounded-xl border border-sidebar-border/70 bg-background p-4 text-sm space-y-3">
              <div className="text-center">
                <h2 className="text-lg font-semibold">Billiard POS</h2>
                <p className="text-muted-foreground text-xs">GAME INVOICE</p>
              </div>
              <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                <span>Invoice:</span>
                <span className="font-medium text-foreground">{receipt.receipt_number}</span>
                <span>Date:</span>
                <span className="text-foreground">{receipt.date}</span>
                <span>Time:</span>
                <span className="text-foreground">{receipt.time}</span>
              </div>
              <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                <span>Customer:</span>
                <span className="text-foreground">{receipt.customer_email || '—'}</span>
                <span>Table:</span>
                <span className="text-foreground">{receipt.table_name || 'Open tab'}</span>
              </div>
              <div className="border-t pt-2 mt-2">
                <div className="text-xs font-medium text-muted-foreground mb-1">Line items</div>
                {(receipt.line_items || []).map((item, i) => (
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
                <span>{money(Number(receipt.grand_total) || 0)}</span>
              </div>
            </div>
            {emailMessage && <p className="no-print text-sm text-muted-foreground">{emailMessage}</p>}
            <DialogFooter className="no-print flex-row gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => window.print()}>
                Print
              </Button>
              <Button onClick={onEmail} disabled={!!emailSending}>
                {emailSending ? 'Sending…' : 'Email'}
              </Button>
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

