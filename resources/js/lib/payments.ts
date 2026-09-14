export type PaymentMethod = 'cash' | 'card' | 'transfer_qr';

export type PaymentRow = {
    method: PaymentMethod;
    amount: number;
};

const TOTAL_EPSILON = 0.01;

export function roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
}

export function roundToNearestIncrement(
    value: number,
    increment = 500,
): number {
    const safeIncrement = Math.max(1, Math.floor(increment || 500));

    return Math.round((Number(value) || 0) / safeIncrement) * safeIncrement;
}

export function formatMoney(value: number): string {
    return `₮${new Intl.NumberFormat('mn-MN', {
        maximumFractionDigits: 0,
    }).format(Number(value) || 0)}`;
}

export function clampNonCashInput(raw: string, maxAllowed: number): string {
    const cap = Math.max(0, roundMoney(maxAllowed));

    if (raw === '') {
        return '';
    }

    const n = parseFloat(raw);

    if (Number.isNaN(n)) {
        return raw;
    }

    if (n < 0) {
        return '0';
    }

    const clamped = Math.min(n, cap);

    if (clamped !== n) {
        return clamped === 0 ? '' : String(clamped);
    }

    return raw;
}

export function paymentPreview(
    cash: number,
    card: number,
    transfer: number,
    expected: number,
) {
    const cashValue = roundMoney(cash || 0);
    const cardValue = roundMoney(card || 0);
    const transferValue = roundMoney(transfer || 0);
    const total = roundMoney(expected || 0);
    const totalPaid = roundMoney(cashValue + cardValue + transferValue);
    const nonCashTotal = roundMoney(cardValue + transferValue);
    const change = Math.max(0, roundMoney(totalPaid - total));
    const amountDue = Math.max(0, roundMoney(total - totalPaid));

    return {
        cashValue,
        cardValue,
        transferValue,
        total,
        totalPaid,
        nonCashTotal,
        change,
        amountDue,
    };
}

export function validateOverpayAllowed({
    expected,
    cash,
    card,
    transfer,
    money,
}: {
    expected: number;
    cash: number;
    card: number;
    transfer: number;
    money: (value: number) => string;
}): { error: string | null; preview: ReturnType<typeof paymentPreview> } {
    const preview = paymentPreview(cash, card, transfer, expected);

    if (preview.nonCashTotal > preview.total + TOTAL_EPSILON) {
        return {
            error: 'Card and transfer combined cannot exceed the grand total.',
            preview,
        };
    }

    if (preview.totalPaid + Number.EPSILON < preview.total) {
        return {
            error: `Total paid (${money(preview.totalPaid)}) must be at least grand total (${money(preview.total)}).`,
            preview,
        };
    }

    if (
        preview.change > TOTAL_EPSILON &&
        preview.cashValue + Number.EPSILON < preview.change
    ) {
        return {
            error: `Change is ${money(preview.change)}. Cash (${money(preview.cashValue)}) must cover change when the customer is due cash back.`,
            preview,
        };
    }

    return { error: null, preview };
}

export function buildExactSettlementPayments({
    expected,
    cash,
    card,
    transfer,
    money,
}: {
    expected: number;
    cash: number;
    card: number;
    transfer: number;
    money: (value: number) => string;
}): {
    error: string | null;
    payments: PaymentRow[];
    preview: ReturnType<typeof paymentPreview>;
} {
    const { error, preview } = validateOverpayAllowed({
        expected,
        cash,
        card,
        transfer,
        money,
    });

    if (error) {
        return { error, payments: [], preview };
    }

    const cashApplied =
        preview.change > TOTAL_EPSILON
            ? roundMoney(preview.cashValue - preview.change)
            : preview.cashValue;

    if (cashApplied < -TOTAL_EPSILON) {
        return { error: 'Invalid cash amount.', payments: [], preview };
    }

    const payments: PaymentRow[] = [];

    if (preview.cardValue > 0) {
        payments.push({ method: 'card', amount: preview.cardValue });
    }

    if (preview.transferValue > 0) {
        payments.push({ method: 'transfer_qr', amount: preview.transferValue });
    }

    if (cashApplied > 0) {
        payments.push({ method: 'cash', amount: cashApplied });
    }

    const paymentsSum = roundMoney(
        payments.reduce((sum, payment) => sum + payment.amount, 0),
    );

    if (Math.abs(paymentsSum - preview.total) > 0.02) {
        return {
            error: 'Could not balance payment split. Check amounts.',
            payments: [],
            preview,
        };
    }

    return { error: null, payments, preview };
}
