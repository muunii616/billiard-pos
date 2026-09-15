import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    clampNonCashInput,
    formatMoney,
    paymentPreview,
    roundMoney,
} from '@/lib/payments';

const QUICK_NOTES = [1000, 5000, 10000, 20000, 50000];

type PaymentFormProps = {
    /** Amount the customer owes. */
    total: number;
    /** Label used when no payment has been entered yet. */
    totalHint?: string;
    cash: string;
    card: string;
    transfer: string;
    email: string;
    onCashChange: (value: string) => void;
    onCardChange: (value: string) => void;
    onTransferChange: (value: string) => void;
    onEmailChange: (value: string) => void;
};

function MoneyInput({
    value,
    onChange,
    min,
    max,
    title,
}: {
    value: string;
    onChange: (value: string) => void;
    min?: number;
    max?: number;
    title?: string;
}) {
    return (
        <div className="relative flex-1">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
                ₮
            </span>
            <Input
                type="number"
                step="1"
                min={min}
                max={max}
                title={title}
                placeholder="0"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="pl-7 text-right tabular-nums"
            />
        </div>
    );
}

/**
 * Shared split-payment fields used by every pay dialog: a large
 * amount-due/change readout, quick cash buttons, and the three
 * method inputs plus an optional receipt email.
 */
export default function PaymentForm({
    total,
    totalHint,
    cash,
    card,
    transfer,
    email,
    onCashChange,
    onCardChange,
    onTransferChange,
    onEmailChange,
}: PaymentFormProps) {
    const money = formatMoney;
    const cashNum = parseFloat(cash) || 0;
    const cardNum = parseFloat(card) || 0;
    const transferNum = parseFloat(transfer) || 0;
    const totalNum = roundMoney(total) || 0;
    const preview = paymentPreview(cashNum, cardNum, transferNum, totalNum);
    const maxCardAmount = Math.max(0, roundMoney(totalNum - transferNum));
    const maxTransferAmount = Math.max(0, roundMoney(totalNum - cardNum));
    const hasEntry = preview.totalPaid > 0;
    const settled = hasEntry && preview.amountDue <= 0.01;

    const fillExactCash = () => {
        const exact = Math.max(0, roundMoney(totalNum - cardNum - transferNum));
        onCashChange(exact > 0 ? String(exact) : '');
    };

    const addCashNote = (note: number) => {
        onCashChange(String(roundMoney(cashNum + note)));
    };

    return (
        <div className="space-y-3">
            <div className="rounded-lg bg-muted/50 p-4 text-center">
                <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {settled
                        ? preview.change > 0.01
                            ? 'Change due'
                            : 'Paid in full'
                        : 'Amount due'}
                </div>
                <div
                    className={`mt-1 text-3xl font-semibold tabular-nums ${
                        settled ? 'text-emerald-700 dark:text-emerald-400' : ''
                    }`}
                >
                    {settled ? money(preview.change) : money(preview.amountDue)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                    {hasEntry
                        ? `Received ${money(preview.totalPaid)} of ${money(totalNum)}`
                        : (totalHint ?? `Cart total ${money(totalNum)}`)}
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
                <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={fillExactCash}
                >
                    Exact cash
                </Button>
                {QUICK_NOTES.map((note) => (
                    <Button
                        key={note}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="tabular-nums"
                        onClick={() => addCashNote(note)}
                    >
                        +{money(note)}
                    </Button>
                ))}
            </div>

            <div className="grid gap-3">
                <div className="flex items-center gap-2">
                    <Label className="w-24 shrink-0">Cash</Label>
                    <MoneyInput
                        min={0}
                        value={cash}
                        onChange={onCashChange}
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Label className="w-24 shrink-0">Card</Label>
                    <MoneyInput
                        min={0}
                        max={maxCardAmount}
                        title={`Max ${money(maxCardAmount)} (with current transfer)`}
                        value={card}
                        onChange={(value) =>
                            onCardChange(clampNonCashInput(value, maxCardAmount))
                        }
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Label className="w-24 shrink-0">Transfer</Label>
                    <MoneyInput
                        min={0}
                        max={maxTransferAmount}
                        title={`Max ${money(maxTransferAmount)} (with current card)`}
                        value={transfer}
                        onChange={(value) =>
                            onTransferChange(
                                clampNonCashInput(value, maxTransferAmount),
                            )
                        }
                    />
                </div>
                <details className="rounded-md border border-border px-3 py-2">
                    <summary className="cursor-pointer text-sm text-muted-foreground">
                        Email receipt
                    </summary>
                    <Input
                        type="email"
                        placeholder="customer@example.com"
                        value={email}
                        onChange={(event) => onEmailChange(event.target.value)}
                        className="mt-2"
                    />
                </details>
            </div>
        </div>
    );
}
