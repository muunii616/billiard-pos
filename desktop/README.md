# Lox Billiard POS for Windows

This desktop edition bundles Electron, PHP, Caddy, and MariaDB. It runs on a 64-bit Windows PC without XAMPP, Composer, Node, or a terminal. The installer includes Microsoft's Visual C++ runtime. Core POS operation is local; receipt email requires internet and a working mail account. Card entries remain manual; this installer does not integrate the bank terminal.

## Install and transfer your data

1. Run `Lox-Billiard-POS-Setup-1.0.16.exe` and complete the installer.
2. Copy your `.loxbackup` file onto that PC (USB or network folder).
3. Open **Lox Billiard POS**. On first launch it asks you to **Import my data** — choose that `.loxbackup` file.
4. If the app already opened once without your backup, close it, rename `%APPDATA%\Lox Billiard POS` (for example to `Lox Billiard POS-old`), then open the app again to get the import prompt. Newer builds also have **Lox Billiard → Replace data from backup…**.
5. Log in with your existing POS account and password.

The first release expects an existing backup, rather than creating demo accounts or sales. Keep using the current POS until your final move; make a fresh backup at the time you switch computers. Two separate installations do **not** synchronize. Data is specific to the Windows account running the app.

## Backups and updates

Use **Lox Billiard → Save backup…** to save a transfer file to a USB drive or another folder. Backups contain business data, account password hashes, the application encryption key, and mail settings: store them privately. Login sessions, password reset tokens, jobs, and caches are intentionally not transferred.

Automatic backups are made on startup, hourly while running, and on normal exit. They are retained in `%APPDATA%\Lox Billiard POS\backups`. Copy backups off the PC regularly; a backup on the same disk does not survive disk failure. The menu opens this folder.

Application data and logs live in `%APPDATA%\Lox Billiard POS`, separately from installed program files. The uninstaller preserves this directory. An update runs pending Laravel migrations after creating a backup; review application migrations before releasing an update. Imports are only offered on first setup and never replace an existing database.

The app listens only on `127.0.0.1`, using separate ports from the current website. Only one desktop instance can open per Windows account. Close through the app's Exit menu for a final backup and clean database shutdown. Closing the desktop app does not pause or stop table timers.

## Build on the development laptop

Version 1.0.16 completes Stock translations, including dialogs and inventory PDF reports. Open tabs have date separators in Ulaanbaatar time, newest first. New merges retain the latest source-tab date, including repeated merges, while table timestamps and product lines from different days retain their original dates. A nullable latest-tab timestamp migration runs automatically after the startup backup. Register cash-change handling was verified: a 5,000 sale paid with 20,000 adds only 5,000 to expected cash after returning 15,000 change.

Version 1.0.15 opens Register after every password or two-factor login. If another employee owns the open shift, choose to continue it or count cash and close/open a shift under your own name. Handover is atomic and requires a reason for any cash difference. The register page now highlights ownership and expected cash, includes clearer history and report links, and supports English and Mongolian. History uses the local opening date and shows both opening and closing times. PDF names use shift-N-YYYY-MM-DD.pdf with the opening date, even for overnight shifts. Closing stock snapshots are saved correctly. No new database migration is required for this release.

Version 1.0.14 checks shared inventory while adding or editing the POS cart and before opening payment. Four beers allow one 2+1 package, but not two; regular beer and Special offers share the same stock limit. The server still checks stock when saving the sale.

Version 1.0.13 fixes Special offer stock validation: a valid 2+1 sale now succeeds when only three to five base items remain. Deals still deduct the full package quantity and reject actual shortages. This applies to new tabs, existing tabs, table orders, and admin item additions.

Prerequisites: current project dependencies installed, PHP 8.5, Node, and internet for the first build.

```powershell
cd C:\Users\muuni\Documents\BilliardPOS\desktop
npm ci
node prepare.mjs
npm test
npm run package
```

`prepare.mjs` uses a separate staging copy under `.build/payload/app`. It does not copy the live `.env`, database files, or logs. Runtime downloads are pinned in `runtimes.json` and checked against upstream hashes; Microsoft's redistributable also has its Authenticode signature checked. The main app's PHP and JavaScript code is copied as-is, apart from desktop-only storage paths, local HTTP support, and disabling service worker registration. Existing source files and the live database are not modified.

Create a fresh read-only export from the current web POS (choose a new filename each time):

```powershell
php bridge.php export-source .. backups\move-day.loxbackup
```

Create the `backups` directory first. The result prints only counts and the output filename, never credentials or customer records. Keep this file separate from the installer.

Run the actual desktop with a separate test profile and imported copy:

```powershell
npm start -- --smoke-test --data-dir "$env:TEMP\LoxDesktopTest" --backup "C:\path\copy.loxbackup"
```

The smoke test opens the main POS pages in Electron, records a screenshot and JSON result in the test profile, and closes. Its test login is enabled only by the explicit smoke-test flags. Do not use your real desktop profile for the test.

Build output is under `dist`. The installer is unsigned until a Windows code-signing certificate is configured. A clean Windows-machine installation test is still required before moving daily operations to it. Bundled runtime licenses are included in `resources/payload`; MariaDB source for the pinned release is available at https://archive.mariadb.org/ (retain its GPL notices when distributing).

Version 1.0.2 includes PDF overview downloads for a day, inclusive date range, or whole month, and a repeating startup animation with a one-second pause. The installer contains no business database; data is transferred separately using a .loxbackup file.

Version 1.0.4 starts faster and loads pages with smaller payloads, closes the create-tab and add-item dialogs reliably after saving, and disables submit buttons while a save is in flight. Cash may exceed the total on table checkout so change can be returned, matching the other payment screens. Employees can now void an open tab or cancel a running session, but must type a reason, which is stored with their name. This release adds a database migration for those reason fields; it runs automatically on first launch after the startup backup.

Version 1.0.5 replaces per-minute table billing with stacked 1h / 30m / 15m blocks at end or move-to-tab. An optional play-clock alert countdown can be set or extended; when it hits zero the app sounds and requires Extend, End, or Clear. Partial open-tab payments, the Stock page, and related POS fixes from this cycle are included. Alert and time-block columns migrate automatically on first launch after the startup backup.

Version 1.0.6 adds **Replace data from backup…** so a PC that already started empty can import a `.loxbackup` without reinstalling. First-launch import messaging is clearer, and the file picker also lists all files if the backup extension is hard to find.

Version 1.0.7 asks whether to return products to stock when cancelling a table or deleting a tab. Overview shows item-level detail for cancelled sessions and voided tabs. Open tabs list products for everyone, with View details for employees and Edit items still admin-only. Soft-delete for staff accounts is included so users with sales history can be removed from the active list.

Version 1.0.8 clears stuck running/paused sessions that were left on tables already marked available (this blocked Start on tables 6 and 7). Cancel/pause/resume now find those sessions correctly, and Start failures show an on-screen error.

Version 1.0.9 lets admins edit table time blocks inside open-tab Edit items, stops number fields from changing on scroll/arrow keys (stock −/+ buttons stay), restores table hover actions on hybrid Windows PCs, and allows merging open tabs that already have partial payments (payments follow the target tab).

Version 1.0.10 adds Special buy/get deals (1+1, 2+1, 2+2) as Special-category products: pick a base product, ratio, and optional dates; POS charges paid units only and deducts full package stock from the base product. Also fixes product create so empty cost/stock fields and the products-page poll no longer hide newly added deals. Deal columns migrate automatically on first launch after the startup backup.

Version 1.0.12 adds prepaid tables and Mongolian. A free table can Run timer (count up, billed in blocks at the end) or Prepaid (pick 1h / 30m / 15m, take payment now, start a countdown). Prepaid time can be extended, ended, or continued as a timer. Closing a prepaid table does not charge that time again; payment is asked only for items that were not paid. The interface defaults to Mongolian, with МН / EN at the bottom of the sidebar. Product names stay as stored. Cash is shown as Бэлэн and transfer QR as Шилжүүлэг. Open-tab and overview labels are translated. The end-session buttons stay inside the window in both languages. Prepaid columns migrate automatically on first launch after the startup backup.

Version 1.0.11 is the store-floor update. Clicking a table opens a full-height sidebar with Session (timer, items, start, pause, end) and Settings (name, rotate, move earlier or later, status). Vertical and horizontal tables are the same size turned on their side, four fit on a row, and horizontal tables sit centered in the row. Status stays locked while a table is running or paused. The products cart and Continue stay on screen while the product list scrolls. One Special deal can be created for several base products at once. Stock can download an inventory PDF. Overview invoices for a tab payment list the table time and items that were on that tab. Table rotation and order migrate automatically on first launch after the startup backup.
