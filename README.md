# Billiard POS (Thesis Project)

Laravel + Vite (React/TypeScript) point-of-sale system for managing billiard tables, checkouts, and admin workflows.

## Requirements

- PHP 8.2+ and Composer
- Node.js 18+ (npm)
- MySQL 8+ (or MariaDB)

Optional (recommended):
- Git

## Quick start (local development)

### 1) Install dependencies

```bash
composer install
npm install
```

### 2) Create your `.env`

```bash
copy .env.example .env
```

Open `.env` and configure at least:

- `APP_URL`
- `DB_CONNECTION=mysql`
- `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`

### 3) App key + database setup

```bash
php artisan key:generate
php artisan migrate
```

If the project includes seeders and you want demo data:

```bash
php artisan db:seed
```

### 4) Run the app (two terminals)

Terminal A (Vite):

```bash
npm run dev
```

Terminal B (Laravel):

```bash
php artisan serve
```

Then open the URL printed by `php artisan serve` (commonly `http://127.0.0.1:8000`).

## Mobile testing (LAN)

If you want to open the app on your phone while developing:

- Make sure your **phone and PC are on the same Wi‑Fi / network**
- Allow Windows Firewall access for the ports you use (commonly **8000** for Laravel and **5173** for Vite)

### 1) Find your PC LAN IP

On Windows (PowerShell):

```powershell
ipconfig
```

Look for something like `192.168.x.x` or `10.x.x.x`.

### 2) Start servers listening on the network

Terminal A (Vite):

```bash
npm run dev -- --host 0.0.0.0 --port 5173
```

Terminal B (Laravel):

```bash
php artisan serve --host 0.0.0.0 --port 8000
```

### 3) Open from your phone

- Open: `http://<YOUR_PC_IP>:8000`
- If assets don’t load, set in `.env`:
  - `APP_URL=http://<YOUR_PC_IP>:8000`

## Email setup (optional)

This project uses Laravel's mail system. If you want to test email sending (password reset / verification emails), configure SMTP in your `.env`.

### Option A: Mailtrap (recommended for reviewers)

1) Create a Mailtrap inbox and copy the SMTP credentials.
2) Set in `.env`:

```
MAIL_MAILER=smtp
MAIL_HOST=<MAILTRAP_HOST>
MAIL_PORT=<MAILTRAP_PORT>
MAIL_USERNAME=<MAILTRAP_USERNAME>
MAIL_PASSWORD=<MAILTRAP_PASSWORD>
MAIL_ENCRYPTION=tls
MAIL_FROM_ADDRESS="no-reply@example.com"
MAIL_FROM_NAME="${APP_NAME}"
```

### Option B: Gmail SMTP (works, but needs an App Password)

1) Enable 2‑Step Verification on your Google account.
2) Create an **App Password** for “Mail”.
3) Set in `.env`:

```
MAIL_MAILER=smtp
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=<YOUR_GMAIL_ADDRESS>
MAIL_PASSWORD=<YOUR_GMAIL_APP_PASSWORD>
MAIL_ENCRYPTION=tls
MAIL_FROM_ADDRESS=<YOUR_GMAIL_ADDRESS>
MAIL_FROM_NAME="${APP_NAME}"
```

Security note: never commit real credentials (do not upload your `.env`).

## Common commands

- Build assets for production:

```bash
npm run build
```

- Clear caches (if something looks stuck):

```bash
php artisan optimize:clear
```

## Troubleshooting

- **Blank page / assets not loading**: make sure `npm run dev` is running and your `APP_URL` matches the served URL.
- **Database errors**: confirm MySQL is running and `.env` DB credentials are correct, then re-run `php artisan migrate`.
- **Permission/storage issues** (rare on Windows): ensure the `storage/` directory is writable.

