<!DOCTYPE html>
<html lang="{{ app()->getLocale() }}">
<head>
    <meta charset="UTF-8">
    <title>{{ __('Inventory overview') }}</title>
    <style>
        body { font-family: DejaVu Sans, sans-serif; font-size: 9px; color: #16392f; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        h2 { font-size: 13px; margin-top: 18px; }
        .muted { color: #64746e; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 5px 4px; border-bottom: 1px solid #dde5e1; text-align: left; }
        th { background: #edf3ef; }
        .num { text-align: right; white-space: nowrap; }
        tr { page-break-inside: avoid; }
    </style>
</head>
<body>
    <h1>LOX BILLIARD</h1>
    <h2>{{ __(match ($period) { 'monthly' => 'Monthly inventory', 'range' => 'Date range inventory', default => 'Daily inventory' }) }}</h2>
    <p>{{ $start->format('d/m/Y H:i') }} – {{ $end->format('d/m/Y H:i') }}</p>
    <p class="muted">
        {{ __('At start is the stock count at the beginning of the selected period.') }}
        {{ __(':closing is the count at the end. Change is :closing minus At start.', ['closing' => __($closingLabel)]) }}
        {{ __('First stock is the amount entered when the product was added. Later top-ups are under Added.') }}
        {{ __('Taken includes all units sold, including free items in special offers.') }}
    </p>

    <table>
        <tr><td>{{ __('At start') }}</td><td class="num">{{ $totals['at_start'] }}</td></tr>
        <tr><td>{{ __('First stock') }}</td><td class="num">{{ $totals['initial'] }}</td></tr>
        <tr><td>{{ __('Added') }}</td><td class="num">{{ $totals['added'] }}</td></tr>
        <tr><td>{{ __('Taken') }}</td><td class="num">{{ $totals['taken'] }}</td></tr>
        <tr><td>{{ __('External use') }}</td><td class="num">{{ $totals['external'] }}</td></tr>
        <tr><td>{{ __('Removed') }}</td><td class="num">{{ $totals['removed'] }}</td></tr>
        <tr><td>{{ __('Put back') }}</td><td class="num">{{ $totals['returned'] }}</td></tr>
        <tr><th>{{ __($closingLabel) }}</th><td class="num"><strong>{{ $totals['at_end'] }}</strong></td></tr>
        <tr><th>{{ __('Change') }}</th><td class="num"><strong>{{ $totals['change'] > 0 ? '+' : '' }}{{ $totals['change'] }}</strong></td></tr>
    </table>

    <h2>{{ __('By product') }}</h2>
    <table>
        <thead>
            <tr>
                <th>{{ __('Product') }}</th>
                <th class="num">{{ __('At start') }}</th>
                <th class="num">{{ __('First stock') }}</th>
                <th class="num">{{ __('Added') }}</th>
                <th class="num">{{ __('Taken') }}</th>
                <th class="num">{{ __('External') }}</th>
                <th class="num">{{ __('Removed') }}</th>
                <th class="num">{{ __('Put back') }}</th>
                <th class="num">{{ __($closingLabel) }}</th>
                <th class="num">{{ __('Change') }}</th>
            </tr>
        </thead>
        <tbody>
            @forelse($rows as $row)
                <tr>
                    <td>{{ $row['name'] }}</td>
                    <td class="num">{{ $row['at_start'] }}</td>
                    <td class="num">{{ $row['initial'] }}</td>
                    <td class="num">{{ $row['added'] }}</td>
                    <td class="num">{{ $row['taken'] }}</td>
                    <td class="num">{{ $row['external'] }}</td>
                    <td class="num">{{ $row['removed'] }}</td>
                    <td class="num">{{ $row['returned'] }}</td>
                    <td class="num">{{ $row['at_end'] }}</td>
                    <td class="num">{{ $row['change'] > 0 ? '+' : '' }}{{ $row['change'] }}</td>
                </tr>
            @empty
                <tr><td colspan="10">{{ __('No products in this period.') }}</td></tr>
            @endforelse
        </tbody>
    </table>
    <p class="muted">{{ __('At start + first stock + added − taken − external − removed + put back = :closing.', ['closing' => __($closingLabel)]) }}</p>

    <h2>{{ __('First stock, when the product was added') }}</h2>
    <table>
        <thead><tr><th>{{ __('When') }}</th><th>{{ __('Product') }}</th><th class="num">{{ __('Quantity') }}</th></tr></thead>
        <tbody>
            @forelse($initials as $row)
                <tr>
                    <td>{{ $row['at']->copy()->setTimezone($timezone)->format('d/m/Y H:i') }}</td>
                    <td>{{ $row['name'] }}</td>
                    <td class="num">+{{ $row['qty'] }}</td>
                </tr>
            @empty
                <tr><td colspan="3">{{ __('No product was first stocked in this period. Earlier first stock is already inside At start.') }}</td></tr>
            @endforelse
        </tbody>
    </table>

    <h2>{{ __('Later stock changes') }}</h2>
    <table>
        <thead><tr><th>{{ __('When') }}</th><th>{{ __('Product') }}</th><th>{{ __('By') }}</th><th class="num">{{ __('Change') }}</th><th class="num">{{ __('After') }}</th><th>{{ __('Note') }}</th></tr></thead>
        <tbody>
            @forelse($adjustments as $row)
                <tr>
                    <td>{{ $row->adjusted_at?->copy()->setTimezone($timezone)->format('d/m/Y H:i') }}</td>
                    <td>{{ $row->product->name ?? __('Deleted product') }}</td>
                    <td>{{ $row->user->name ?? __('Unknown') }}</td>
                    <td class="num">{{ $row->quantity_change > 0 ? '+' : '' }}{{ $row->quantity_change }}</td>
                    <td class="num">{{ $row->stock_after }}</td>
                    <td>{{ $row->note === 'Initial stock' ? __('Initial stock') : $row->note }}</td>
                </tr>
            @empty
                <tr><td colspan="6">{{ __('No later stock changes in this period.') }}</td></tr>
            @endforelse
        </tbody>
    </table>

    <h2>{{ __('External use') }}</h2>
    <table>
        <thead><tr><th>{{ __('When') }}</th><th>{{ __('Product') }}</th><th>{{ __('By') }}</th><th class="num">{{ __('Units') }}</th><th>{{ __('Note') }}</th></tr></thead>
        <tbody>
            @forelse($external as $row)
                <tr>
                    <td>{{ $row->used_at?->copy()->setTimezone($timezone)->format('d/m/Y H:i') }}</td>
                    <td>{{ $row->product->name ?? __('Deleted product') }}</td>
                    <td>{{ $row->user->name ?? __('Unknown') }}</td>
                    <td class="num">{{ $row->quantity }}</td>
                    <td>{{ $row->note === 'Initial stock' ? __('Initial stock') : $row->note }}</td>
                </tr>
            @empty
                <tr><td colspan="5">{{ __('No external use in this period.') }}</td></tr>
            @endforelse
        </tbody>
    </table>

    <p class="muted">{{ __('Generated :date.', ['date' => now($timezone)->format('d/m/Y H:i')]) }}</p>
</body>
</html>
