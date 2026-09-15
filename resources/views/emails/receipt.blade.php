<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Receipt {{ $receiptNumber }}</title>
</head>
<body style="font-family: sans-serif; line-height: 1.5;">
    <h1>Lox Billiard — Receipt</h1>
    <p><strong>Invoice:</strong> {{ $receiptNumber }}</p>
    <p><strong>Date:</strong> {{ $date }}</p>
    <p><strong>Time:</strong> {{ $time }}</p>
    <p><strong>Table:</strong> {{ $tableName }}</p>
    @if($customerEmail)
    <p><strong>Customer:</strong> {{ $customerEmail }}</p>
    @endif

    <table style="border-collapse: collapse; width: 100%; margin-top: 1rem;">
        <thead>
            <tr style="border-bottom: 2px solid #333;">
                <th style="text-align: left; padding: 0.5rem;">Description</th>
                <th style="text-align: right; padding: 0.5rem;">Qty</th>
                <th style="text-align: right; padding: 0.5rem;">Subtotal</th>
            </tr>
        </thead>
        <tbody>
            @foreach($lineItems as $item)
            <tr style="border-bottom: 1px solid #ddd;">
                <td style="padding: 0.5rem;">{{ $item['description'] }}</td>
                <td style="text-align: right; padding: 0.5rem;">{{ $item['quantity'] ?? 1 }}</td>
                <td style="text-align: right; padding: 0.5rem;">₮{{ number_format($item['subtotal'], 0) }}</td>
            </tr>
            @endforeach
        </tbody>
    </table>

    <p style="margin-top: 1rem;"><strong>Grand total:</strong> ₮{{ number_format($grandTotal, 0) }}</p>

    <p style="margin-top: 2rem; color: #666; font-size: 0.9rem;">Thank you for your business.</p>
</body>
</html>
