<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Sales overview</title>
    <style>
        body { font-family: DejaVu Sans, sans-serif; font-size: 10px; color: #16392f; }
        h1 { font-size: 23px; margin-bottom: 5px; }
        h2 { font-size: 14px; margin-top: 24px; }
        .muted { color: #64746e; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 8px 5px; border-bottom: 1px solid #dde5e1; text-align: left; }
        th { background: #edf3ef; }
        .amount { text-align: right; white-space: nowrap; }
        tr { page-break-inside: avoid; }
    </style>
</head>
<body>
    <h1>LOX BILLIARD</h1>
    <h2>{{ ucfirst($period === 'range' ? 'Date range' : $period) }} sales overview</h2>
    <p>{{ $start->format('d M Y') }} – {{ $end->format('d M Y') }} (inclusive)</p>
    <p class="muted">{{ $timezone }} · Paid sales across all register sessions · Amounts in MNT</p>
    <table>
        <tr><th>Total sales</th><td class="amount">{{ number_format($receipts->sum('grand_total'), 0) }}</td></tr>
        <tr><td>Receipts</td><td class="amount">{{ $receipts->count() }}</td></tr>
        <tr><td>Table time</td><td class="amount">{{ number_format($receipts->sum('time_total'), 0) }}</td></tr>
        <tr><td>Products</td><td class="amount">{{ number_format($receipts->sum('products_total'), 0) }}</td></tr>
    </table>
    <h2>Payment breakdown</h2>
    <table>
        @forelse($payments as $method => $amount)
            <tr><td>{{ $method === 'transfer_qr' ? 'Transfer / QR' : ucfirst($method) }}</td><td class="amount">{{ number_format($amount, 0) }}</td></tr>
        @empty
            <tr><td>No payments in this period.</td></tr>
        @endforelse
    </table>
    <h2>Receipts</h2>
    <table>
        <thead><tr><th>Receipt</th><th>Paid at</th><th>Payment</th><th class="amount">Total</th></tr></thead>
        <tbody>
            @forelse($receipts as $receipt)
                <tr>
                    <td>{{ $receipt->receipt_number }}</td>
                    <td>{{ $receipt->paid_at->copy()->setTimezone($timezone)->format('d M Y H:i') }}</td>
                    <td>{{ $receipt->payments->pluck('method')->unique()->map(fn ($method) => $method === 'transfer_qr' ? 'Transfer / QR' : ucfirst($method))->implode(', ') }}</td>
                    <td class="amount">{{ number_format($receipt->grand_total, 0) }}</td>
                </tr>
            @empty
                <tr><td colspan="4">No paid receipts in this period.</td></tr>
            @endforelse
        </tbody>
    </table>
    <p class="muted">Generated {{ now($timezone)->format('d M Y H:i') }}. Unpaid, voided and deleted receipts are excluded.</p>
</body>
</html>
