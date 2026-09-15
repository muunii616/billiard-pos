<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Page not found — Lox Billiard</title>
        <style>
            body {
                margin: 0;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: ui-sans-serif, system-ui, sans-serif;
                background: #111827;
                color: #f8fafc;
            }
            .wrap { text-align: center; padding: 1.5rem; }
            .brand {
                letter-spacing: 0.14em;
                text-transform: uppercase;
                font-size: 0.75rem;
                color: #94a3b8;
            }
            h1 { font-size: 1.75rem; margin: 0.5rem 0 0.75rem; }
            p { color: #94a3b8; margin: 0 0 1.5rem; }
            a {
                display: inline-block;
                background: #fff;
                color: #111827;
                text-decoration: none;
                font-weight: 600;
                padding: 0.65rem 1.1rem;
                border-radius: 0.6rem;
            }
        </style>
    </head>
    <body>
        <div class="wrap">
            <div class="brand">Lox Billiard</div>
            <h1>Page not found</h1>
            <p>This screen is not part of the POS.</p>
            <a href="{{ url('/dashboard') }}">Back to dashboard</a>
        </div>
    </body>
</html>
