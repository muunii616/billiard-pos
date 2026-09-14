# Lox Billiard POS for Windows

This desktop edition bundles Electron, PHP, Caddy, and MariaDB. It runs on a 64-bit Windows PC without XAMPP, Composer, Node, or a terminal. The installer includes Microsoft's Visual C++ runtime. Core POS operation is local; receipt email requires internet and a working mail account. Card entries remain manual; this installer does not integrate the bank terminal.

## Install and transfer your data

1. Run `Lox-Billiard-POS-Setup-1.0.2.exe` and complete the installer.
2. Open **Lox Billiard POS** from its desktop shortcut.
3. On first launch, select your `.loxbackup` file. Import creates a separate database and verifies every copied row.
4. Log in with your existing POS account and password.

The first release expects an existing backup, rather than creating demo accounts or sales. Keep using the current POS until your final move; make a fresh backup at the time you switch computers. Two separate installations do **not** synchronize. Data is specific to the Windows account running the app.

## Backups and updates

Use **Lox Billiard → Save backup…** to save a transfer file to a USB drive or another folder. Backups contain business data, account password hashes, the application encryption key, and mail settings: store them privately. Login sessions, password reset tokens, jobs, and caches are intentionally not transferred.

Automatic backups are made on startup, hourly while running, and on normal exit. They are retained in `%APPDATA%\Lox Billiard POS\backups`. Copy backups off the PC regularly; a backup on the same disk does not survive disk failure. The menu opens this folder.

Application data and logs live in `%APPDATA%\Lox Billiard POS`, separately from installed program files. The uninstaller preserves this directory. An update runs pending Laravel migrations after creating a backup; review application migrations before releasing an update. Imports are only offered on first setup and never replace an existing database.

The app listens only on `127.0.0.1`, using separate ports from the current website. Only one desktop instance can open per Windows account. Close through the app's Exit menu for a final backup and clean database shutdown. Closing the desktop app does not pause or stop table timers.

## Build on the development laptop

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
