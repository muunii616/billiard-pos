<?php

namespace App\Support;

use Illuminate\Http\Request;

final class PaymentPayload
{
    /**
     * Parse payments from mixed request formats (form, JSON string, or raw JSON body).
     *
     * @return array<int, array<string, mixed>>
     */
    public static function fromRequest(Request $request): array
    {
        $payments = $request->input('payments', []);

        if (is_string($payments)) {
            $payments = json_decode($payments, true) ?? [];
        }

        if (! is_array($payments)) {
            $payments = [];
        }

        if (empty($payments) && $request->getContent()) {
            $decoded = json_decode($request->getContent(), true);
            if (is_array($decoded['payments'] ?? null)) {
                $payments = $decoded['payments'];
            }
        }

        return is_array($payments) ? $payments : [];
    }

    /**
     * Normalize and validate payment rows against a grand total.
     *
     * Cash may overpay so change can be returned; card/transfer cannot exceed the total.
     * When $allowOverpay is true, cash overpayment is reduced to the retained amount.
     *
     * @param  array<int, array<string, mixed>>  $payments
     * @return array{payments: array<int, array{method: string, amount: float}>, error: null|string}
     */
    public static function normalizeForTotal(array $payments, float $grandTotal, bool $allowOverpay = true): array
    {
        $validMethods = self::methods();

        if (empty($payments)) {
            return [
                'payments' => $grandTotal > 0 ? [['method' => $validMethods[0] ?? 'cash', 'amount' => $grandTotal]] : [],
                'error' => null,
            ];
        }

        $validPayments = [];
        $totalPaid = 0.0;

        foreach ($payments as $payment) {
            $method = $payment['method'] ?? null;
            $amount = isset($payment['amount']) ? (float) $payment['amount'] : 0.0;

            if (! in_array($method, $validMethods, true) || $amount <= 0) {
                continue;
            }

            $roundedAmount = round($amount, 2);
            $validPayments[] = ['method' => $method, 'amount' => $roundedAmount];
            $totalPaid += $roundedAmount;
        }

        if ($allowOverpay) {
            if ($totalPaid + 0.01 < $grandTotal) {
                return ['payments' => $validPayments, 'error' => 'minimum_total_required'];
            }
        } elseif (abs($totalPaid - $grandTotal) > 0.01) {
            return ['payments' => $validPayments, 'error' => 'exact_total_required'];
        }

        $cardTransferTotal = 0.0;
        foreach ($validPayments as $payment) {
            if ($payment['method'] === 'card' || $payment['method'] === 'transfer_qr') {
                $cardTransferTotal += $payment['amount'];
            }
        }

        if ($cardTransferTotal > $grandTotal + 0.01) {
            return ['payments' => $validPayments, 'error' => 'card_transfer_exceeds'];
        }

        // Record money retained by the business, excluding cash handed back as change.
        $change = $allowOverpay ? round(max(0, $totalPaid - $grandTotal), 2) : 0;
        foreach ($validPayments as &$payment) {
            if ($payment['method'] === 'cash' && $change > 0) {
                $returned = min($payment['amount'], $change);
                $payment['amount'] = round($payment['amount'] - $returned, 2);
                $change = round($change - $returned, 2);
            }
        }
        unset($payment);

        return ['payments' => array_values(array_filter($validPayments, fn ($payment) => $payment['amount'] > 0)), 'error' => null];
    }

    /**
     * Normalize payments toward an open-tab remaining balance.
     * Partial payments (< remaining) are allowed; cash overpay closes the tab with change.
     *
     * @param  array<int, array<string, mixed>>  $payments
     * @return array{payments: array<int, array{method: string, amount: float}>, applied: float, closes: bool, error: null|string}
     */
    public static function normalizeTowardBalance(array $payments, float $remaining): array
    {
        $remaining = round(max(0, $remaining), 2);
        $validMethods = self::methods();

        if ($remaining <= 0.01) {
            return ['payments' => [], 'applied' => 0.0, 'closes' => true, 'error' => null];
        }

        if (empty($payments)) {
            return [
                'payments' => [['method' => $validMethods[0] ?? 'cash', 'amount' => $remaining]],
                'applied' => $remaining,
                'closes' => true,
                'error' => null,
            ];
        }

        $validPayments = [];
        $totalPaid = 0.0;

        foreach ($payments as $payment) {
            $method = $payment['method'] ?? null;
            $amount = isset($payment['amount']) ? (float) $payment['amount'] : 0.0;

            if (! in_array($method, $validMethods, true) || $amount <= 0) {
                continue;
            }

            $roundedAmount = round($amount, 2);
            $validPayments[] = ['method' => $method, 'amount' => $roundedAmount];
            $totalPaid += $roundedAmount;
        }

        $totalPaid = round($totalPaid, 2);

        if ($totalPaid <= 0.01) {
            return ['payments' => [], 'applied' => 0.0, 'closes' => false, 'error' => 'payment_required'];
        }

        $cardTransferTotal = 0.0;
        foreach ($validPayments as $payment) {
            if ($payment['method'] === 'card' || $payment['method'] === 'transfer_qr') {
                $cardTransferTotal += $payment['amount'];
            }
        }

        if ($cardTransferTotal > $remaining + 0.01) {
            return ['payments' => $validPayments, 'applied' => 0.0, 'closes' => false, 'error' => 'card_transfer_exceeds'];
        }

        $closes = $totalPaid + 0.01 >= $remaining;
        $applied = $closes ? $remaining : $totalPaid;
        $change = $closes ? round(max(0, $totalPaid - $remaining), 2) : 0.0;

        foreach ($validPayments as &$payment) {
            if ($payment['method'] === 'cash' && $change > 0) {
                $returned = min($payment['amount'], $change);
                $payment['amount'] = round($payment['amount'] - $returned, 2);
                $change = round($change - $returned, 2);
            }
        }
        unset($payment);

        $validPayments = array_values(array_filter($validPayments, fn ($payment) => $payment['amount'] > 0));
        $applied = round(array_sum(array_column($validPayments, 'amount')), 2);

        if ($applied <= 0.01) {
            return ['payments' => [], 'applied' => 0.0, 'closes' => false, 'error' => 'payment_required'];
        }

        return [
            'payments' => $validPayments,
            'applied' => $applied,
            'closes' => $applied + 0.01 >= $remaining,
            'error' => null,
        ];
    }

    /**
     * @return array<int, string>
     */
    public static function methods(): array
    {
        $methods = config('pos.payment_methods', ['cash', 'card', 'transfer_qr']);

        return is_array($methods) ? array_values($methods) : ['cash', 'card', 'transfer_qr'];
    }
}
