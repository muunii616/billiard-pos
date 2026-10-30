# Store-server deployment

This deployment keeps one writable MariaDB database on the store PC. The local POS and remote administrators use the same Laravel application. Never expose the web, database, RDP, or SMB ports through the public router.

The existing Electron/MariaDB desktop package is separate and unchanged. Rehearse this server deployment with a sanitized database before moving production data.

## 1. Prerequisites

- Supported 64-bit Windows with sleep and hibernation disabled.
- PHP 8.4+ with `pdo_mysql`, `openssl`, `mbstring`, and the other extensions required by Laravel.
- MariaDB and its matching `mariadb-dump` client.
- Caddy and Tailscale installed.
- A dedicated non-administrator Windows account for normal POS use.
- A UPS and BIOS `Restore on AC Power Loss` setting are strongly recommended.
- Windows timezone set to Ulaanbaatar Standard Time with automatic clock synchronization enabled.

Keep PHP, Caddy, and the application in fixed paths. The scheduled tasks run as `SYSTEM`, independently of login and the visible POS window.

## 2. Production configuration

Copy `.env.example` to `.env`, generate `APP_KEY`, and use production values. At minimum:

```dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=https://YOUR-TAILSCALE-NAME.YOUR-TAILNET.ts.net
APP_FORCE_HTTPS=false
APP_VERSION=your-release-version

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=lox_billiard
DB_USERNAME=dedicated-pos-user
DB_PASSWORD=private-database-password
QUEUE_CONNECTION=database
SESSION_DRIVER=file
CACHE_STORE=file
LOG_CHANNEL=stack
LOG_STACK=daily,slack
LOG_SLACK_WEBHOOK_URL=your-private-alert-webhook

POS_HEALTH_TOKEN=long-random-secret
POS_BACKUP_PATH=C:\LoxBilliardPOS\backups\local
POS_DB_DUMP_BINARY=C:\mariadb\bin\mariadb-dump.exe
POS_BACKUP_TIMEOUT_SECONDS=300
POS_BACKUP_MAX_AGE_MINUTES=90
POS_MINIMUM_FREE_BYTES=2147483648

POS_OFFSITE_BACKUP_PATH=R:\LoxBilliardPOS\encrypted-backups
POS_BACKUP_ENCRYPTION_KEY=base64-encoded-32-byte-key
POS_OFFSITE_BACKUP_MAX_AGE_MINUTES=2160
```

`APP_FORCE_HTTPS=false` is intentional: Caddy listens only on localhost and Tailscale terminates remote HTTPS. Laravel still respects Tailscale's forwarded HTTPS scheme. Do not enable Tailscale Funnel.

Generate the two secrets once and store them in `.env` and the protected recovery record, never in Git:

```powershell
php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"
php -r "echo base64_encode(random_bytes(32)), PHP_EOL;"
```

The first value is the health token; the second is the backup encryption key. Losing the encryption key makes offsite backups unrecoverable.

Run the controlled deployment steps from an elevated terminal:

```powershell
php artisan migrate --force
php artisan pos:backup
php artisan config:cache
```

## 3. Background processes

Install the startup tasks from an elevated PowerShell terminal, using the fixed executable paths:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Install-StoreServerTasks.ps1 `
  -PhpPath C:\php\php.exe `
  -PhpCgiPath C:\php\php-cgi.exe `
  -CaddyPath C:\caddy\caddy.exe
```

The installer registers one-instance-at-a-time tasks for PHP-CGI, Caddy, the queue worker, the scheduler, and the health monitor. Crashed processes restart after one minute. Caddy and PHP listen only on `127.0.0.1`; logs are under `storage/logs` and process logs rotate at 10 MB.

Start each `Lox Billiard POS - ...` task once in Task Scheduler, then open `http://127.0.0.1:8080` locally. Closing the browser or desktop shell does not stop these tasks.

## 4. Tailscale

After signing in on the store PC, enable **Preferences → Run unattended**. This keeps the node connected after logout or reboot. Restrict access in the tailnet policy to approved administrator identities and devices, require MFA at the identity provider, and disable key expiry only for this trusted server with a documented recovery owner.

In an elevated terminal, publish only the localhost web service to the tailnet:

```powershell
tailscale serve --bg 8080
tailscale serve status
```

The background Serve configuration resumes after reboot. Verify from an approved remote device, then verify that an employee identity is denied by both the Tailscale policy and Laravel's server-side role middleware. Current references: [Windows unattended mode](https://tailscale.com/docs/how-to/run-unattended) and [Tailscale Serve](https://tailscale.com/docs/reference/tailscale-cli/serve).

## 5. Backups and health

The scheduler creates a consistent MariaDB logical dump every hour with a single transaction, records its SHA-256 checksum and migration state, and applies 24-hourly/7-daily/4-weekly/6-monthly retention. The configured database account needs read access to the application database and the privileges required to dump routines, events, and triggers.

If `POS_OFFSITE_BACKUP_PATH` is configured, a nightly job creates a new verified snapshot, encrypts it with AES-256-GCM, and writes only the encrypted file and non-secret manifest to that path. The target must be on another device, removable media that is rotated, or a private synchronized/mounted cloud location; a second folder on the same disk is not offsite protection.

Check health locally without printing the token:

```powershell
$token = ((Get-Content .env | Select-String '^POS_HEALTH_TOKEN=').Line -split '=', 2)[1]
Invoke-RestMethod http://127.0.0.1:8080/up -Headers @{ Authorization = "Bearer $token" }
```

Health returns only status, version, boolean checks, and backup ages. It reports failure for database access, pending migrations, unwritable storage, low disk space, stale local backups, or stale configured offsite backups. The scheduled monitor appends failures to `storage/logs/health.log`.

## 6. Recovery rehearsal

Never restore over the only live database.

1. Stop the web, queue, and scheduler tasks.
2. Preserve the live MariaDB data directory unchanged; do not restore into it directly.
3. Select the newest verified backup manifest.
4. For an encrypted backup, decrypt and verify it into a new path:

   ```powershell
   php artisan pos:backup-decrypt R:\backups\pos-example.json C:\restore-test\database.sql
   ```

5. Create an empty test database and import the dump without touching production:

   ```powershell
   mariadb.exe --host=127.0.0.1 --user=root --password --execute="CREATE DATABASE lox_billiard_restore CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
   cmd.exe /c "mariadb.exe --host=127.0.0.1 --user=root --password lox_billiard_restore < C:\restore-test\database.sql"
   ```

6. Point a separate test installation at `lox_billiard_restore`, run health and core POS acceptance tests, and compare receipt/register/stock totals.
7. Switch production only after explicit approval.

Perform this rehearsal before sign-off and quarterly. Record the chosen backup, result, elapsed time, and reviewer.

## 7. Production acceptance

- Reboot twice without signing in; verify all scheduled tasks and Tailscale return.
- Complete a sale, table session, and open tab with the internet disconnected.
- Close the visible UI and repeat the local health check.
- Make an admin correction remotely and verify it locally after refresh.
- Confirm employee accounts receive HTTP 403 from admin endpoints.
- Force one controlled offsite-path failure and verify the local backup remains and the failure is logged.
- Restore a backup to a separate test location.
- Confirm the router has no public forwarding for application, database, RDP, or SMB ports.
- Confirm health output and logs contain no credentials or customer data.

BIOS, UPS, Windows Update hours, router reservations, Tailscale identity policy, key-expiry approval, and the physical offsite target cannot be configured by repository code and must be signed off on the store PC.
