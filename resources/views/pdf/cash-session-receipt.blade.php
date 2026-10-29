<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Shift #{{ $session->id }} — {{ $shiftDate }}</title>
    <style>
        body {
            font-family: DejaVu Sans, sans-serif;
            font-size: 12px;
            color: #111827;
            margin: 24px;
        }
        .header {
            text-align: center;
            margin-bottom: 18px;
        }
        .logo {
            height: 56px;
            margin-bottom: 6px;
        }
        .title {
            font-size: 20px;
            font-weight: bold;
            margin-bottom: 2px;
        }
        .subtitle {
            font-size: 12px;
            color: #4b5563;
        }
        .section {
            margin-top: 16px;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            padding: 10px 12px;
        }
        .section-title {
            font-weight: bold;
            margin-bottom: 8px;
            font-size: 13px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        td {
            padding: 4px 0;
            vertical-align: top;
        }
        .label {
            color: #4b5563;
            width: 45%;
        }
        .value {
            text-align: right;
            font-weight: 600;
            width: 55%;
        }
        .muted {
            color: #6b7280;
            font-size: 11px;
            margin-top: 16px;
            text-align: center;
        }
        .separator {
            border-top: 1px dashed #9ca3af;
            margin: 10px 0;
        }
    </style>
</head>
<body>
    @php
        $money = fn ($value) => number_format((float) $value, 0) . ' MNT';
        $displayTimezone = \App\Support\PosDate::timezone();
        $openedAt = ($session->opened_at ?? $session->created_at)->copy()->setTimezone($displayTimezone)->format('Y-m-d h:i A');
        $closedAt = $session->closed_at ? $session->closed_at->copy()->setTimezone($displayTimezone)->format('Y-m-d h:i A') : '-';
    @endphp

    <div class="header">
        @if(!empty($logoDataUri))
            <img src="{{ $logoDataUri }}" alt="{{ $appName }} logo" class="logo">
        @else
            <div class="title">{{ $appName }}</div>
        @endif
        <div class="subtitle">Register Shift Closing Receipt</div>
        <div class="title">Shift #{{ $session->id }} · {{ $shiftDate }}</div>
    </div>

    <div class="section">
        <div class="section-title">Shift Information</div>
        <table>
            <tr>
                <td class="label">Shift ID</td>
                <td class="value">#{{ $session->id }}</td>
            </tr>
            <tr>
                <td class="label">Opened At</td>
                <td class="value">{{ $openedAt }}</td>
            </tr>
            <tr>
                <td class="label">Closed At</td>
                <td class="value">{{ $closedAt }}</td>
            </tr>
            <tr>
                <td class="label">Opened By</td>
                <td class="value">{{ $session->openedBy?->name ?? '-' }}</td>
            </tr>
            <tr>
                <td class="label">Closed By</td>
                <td class="value">{{ $session->closedBy?->name ?? '-' }}</td>
            </tr>
        </table>
    </div>

    <div class="section">
        <div class="section-title">Billiard Table Revenue</div>
        <table>
            <tr>
                <td class="label">Total table time charges</td>
                <td class="value">{{ $money($tableTimeTotal) }}</td>
            </tr>
        </table>
    </div>

    <div class="section">
        <div class="section-title">Products Sold</div>
        @if($productSales->isEmpty())
            <div class="muted">No products sold during this shift.</div>
        @else
            <table>
                <tr><th style="text-align:left">Product</th><th style="text-align:right">Qty</th><th style="text-align:right">Total</th></tr>
                @foreach($productSales as $product)
                    <tr>
                        <td>{{ $product['description'] }}</td>
                        <td class="value">{{ rtrim(rtrim(number_format((float) $product['quantity'], 2), '0'), '.') }}</td>
                        <td class="value">{{ $money($product['total']) }}</td>
                    </tr>
                @endforeach
            </table>
        @endif
    </div>

    <div class="section">
        <div class="section-title">External Use (Not Sales)</div>
        @if($externalUsages->isEmpty())
            <div class="muted">No external product usage during this shift.</div>
        @else
            <table>
                <tr><th style="text-align:left">Person</th><th style="text-align:left">Product</th><th style="text-align:right">Qty</th><th style="text-align:right">Original price</th><th style="text-align:right">Total cost</th></tr>
                @foreach($externalUsages as $usage)
                    <tr>
                        <td>{{ $usage->user?->name ?? '-' }}</td>
                        <td>{{ $usage->product?->name ?? 'Deleted product' }}</td>
                        <td class="value">{{ $usage->quantity }}</td>
                        <td class="value">{{ $money($usage->unit_cost) }}</td>
                        <td class="value">{{ $money($usage->total_cost) }}</td>
                    </tr>
                @endforeach
            </table>
            <div class="separator"></div>
            <table><tr><td class="label">Total external-use cost</td><td class="value">{{ $money($externalUsages->sum('total_cost')) }}</td></tr></table>
        @endif
    </div>

    <div class="section">
        <div class="section-title">Stock Adjustments</div>
        @if($stockAdjustments->isEmpty())
            <div class="muted">No stock adjustments during this shift.</div>
        @else
            <table>
                <tr><th style="text-align:left">User</th><th style="text-align:left">Product</th><th style="text-align:right">Change</th><th style="text-align:right">Stock after</th></tr>
                @foreach($stockAdjustments as $adjustment)
                    <tr><td>{{ $adjustment->user?->name ?? '-' }}</td><td>{{ $adjustment->product?->name ?? 'Deleted product' }}</td><td class="value">{{ $adjustment->quantity_change > 0 ? '+' : '' }}{{ $adjustment->quantity_change }}</td><td class="value">{{ $adjustment->stock_after }}</td></tr>
                @endforeach
            </table>
        @endif
    </div>

    <div class="section">
        <div class="section-title">Stock Reconciliation</div>
        <table>
            <tr><th style="text-align:left">Product</th><th style="text-align:right">Opening</th><th style="text-align:right">Adjusted</th><th style="text-align:right">Sold</th><th style="text-align:right">External</th><th style="text-align:right">Expected</th><th style="text-align:right">Closing</th></tr>
            @foreach($stockReport as $stock)
                <tr><td>{{ $stock['product'] }}</td><td class="value">{{ $stock['opening'] }}</td><td class="value">{{ $stock['adjusted'] > 0 ? '+' : '' }}{{ $stock['adjusted'] }}</td><td class="value">{{ $stock['sold'] }}</td><td class="value">{{ $stock['external'] }}</td><td class="value">{{ $stock['expected'] }}</td><td class="value">{{ $stock['closing'] }}</td></tr>
            @endforeach
        </table>
    </div>

    <div class="section">
        <div class="section-title">Cash Summary</div>
        <table>
            <tr>
                <td class="label">Opening Cash</td>
                <td class="value">{{ $money($session->opening_cash) }}</td>
            </tr>
            <tr>
                <td class="label">Cash Sales</td>
                <td class="value">{{ $money($session->cash_sales) }}</td>
            </tr>
            <tr>
                <td class="label">Expected Cash</td>
                <td class="value">{{ $money($session->expected_cash) }}</td>
            </tr>
            <tr>
                <td class="label">Counted Cash</td>
                <td class="value">{{ $money($session->counted_cash) }}</td>
            </tr>
            <tr>
                <td class="label">Variance</td>
                <td class="value">{{ $money($session->variance) }}</td>
            </tr>
        </table>
        <div class="separator"></div>
        <table>
            <tr>
                <td class="label">Receipts Count</td>
                <td class="value">{{ (int) $session->receipts_count }}</td>
            </tr>
            <tr>
                <td class="label">Total Sales</td>
                <td class="value">{{ $money($session->total_sales) }}</td>
            </tr>
            <tr>
                <td class="label">Card Sales</td>
                <td class="value">{{ $money($session->card_sales) }}</td>
            </tr>
            <tr>
                <td class="label">Transfer Sales</td>
                <td class="value">{{ $money($session->transfer_sales) }}</td>
            </tr>
        </table>
    </div>

    @if($session->variance_reason)
        <div class="section">
            <div class="section-title">Variance Reason</div>
            <div>{{ $session->variance_reason }}</div>
        </div>
    @endif

    <div class="muted">Generated on {{ now()->format('Y-m-d h:i A') }}</div>
</body>
</html>
