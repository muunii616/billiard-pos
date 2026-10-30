# Store Server, Remote Administration, and Synchronization Specification

## 1. Purpose

This document defines how BilliardPOS will support:

- uninterrupted local POS operation when the internet is unavailable;
- remote administration from approved devices;
- corrections made by administrators against the live store data;
- automatic recovery after reboot or power loss;
- reliable local and offsite backups; and
- an optional future cloud reporting copy without introducing unsafe two-way synchronization.

The initial design deliberately uses one live database. Tailscale provides private remote access to that database through the Laravel application; it does not copy or synchronize the database.

## 2. Goals

1. Employees can continue selling, managing tables, and using the register when the store internet is down.
2. An administrator can remotely open the same application used in the store and correct employee mistakes.
3. Admin changes become visible at the store immediately after they commit and the employee refreshes.
4. Closing the POS window does not stop the Laravel server.
5. Rebooting the store PC automatically restores the server and private remote access.
6. The system maintains recoverable local and offsite backups.
7. Stock, payments, receipts, tabs, sessions, and register totals remain internally consistent.

## 3. Non-goals for the first release

The first release will not include:

- Neon or another cloud database as the live database;
- a second writable copy of the store database;
- bidirectional offline synchronization;
- automatic conflict resolution between store and cloud edits;
- public router port forwarding;
- a publicly accessible database port;
- Docker on the production store PC; or
- a replacement for the desktop POS currently in use.

These exclusions keep the first deployment understandable and prevent duplicate sales, inconsistent stock, and payment conflicts.

## 4. Architecture

```text
                          Private Tailscale network
Admin laptop or phone  -----------------------------------+
                                                          |
Store POS UI  ---- local/LAN ----> Laravel server ----> MariaDB
                                                          |
                                                          +----> local backups
                                                          |
                                                          +----> encrypted offsite backups
```

### 4.1 Source of truth

The MariaDB database on the store PC is the only live source of truth.

All reads and writes must pass through the Laravel application. The MariaDB port and data directory must never be exposed through a public router or shared over the network.

### 4.2 Local employee access

The store POS connects to the Laravel server through localhost or the store LAN. This path must not depend on internet access, DNS outside the store, Tailscale availability, or any cloud provider.

### 4.3 Remote administrator access

Approved administrator devices connect to the Laravel server through Tailscale. They use the normal Laravel login and application authorization after entering the private network.

Remote access therefore has two security layers:

1. the device/user must be authorized in Tailscale; and
2. the application user must have the administrator role.

The Laravel application and database must not be exposed through public router port forwarding.

### 4.4 Why no synchronization is needed

Employees and remote administrators use the same server and database. An administrator correction is a normal database transaction on the store PC, not a change waiting to synchronize.

If the store internet is unavailable:

- local POS operation continues;
- remote administration is temporarily unavailable; and
- there is no queue of conflicting cloud edits to merge later.

## 5. Administrator correction workflow

1. An employee identifies an incorrect tab, table session, product, receipt, payment, or stock operation.
2. The employee records the relevant identifier and contacts an administrator.
3. The administrator connects through Tailscale and signs in with their own account.
4. The administrator performs the correction through an authorized application action.
5. Laravel validates and commits the complete correction in one database transaction.
6. The employee refreshes the relevant screen and sees the corrected state.

### 5.1 Correction requirements

Every correction action must:

- require an authenticated administrator when the operation is admin-only;
- require a reason for financially or operationally significant corrections;
- record the administrator, timestamp, reason, target record, previous values, and resulting values;
- update related stock, receipt, payment, tab, table-session, and register data atomically;
- reject stale or already-changed records instead of silently overwriting them;
- be idempotent where a request can be retried; and
- return a clear success or failure result to the UI.

### 5.2 Deletion policy

Financial and stock history should normally be reversed or voided, not permanently deleted.

Preferred operations are:

- void a receipt;
- cancel a table session;
- restore or retain stock explicitly;
- reverse a payment effect;
- reopen a tab through an audited action; and
- soft-delete user or configuration records where appropriate.

Permanent deletion should be limited to records that have no financial, stock, register, or audit effect.

## 6. Store PC requirements

### 6.1 Hardware

- Reliable 64-bit Windows PC.
- SSD with sufficient free space for the application, logs, and backup retention.
- Wired Ethernet preferred over Wi-Fi.
- Hardware clock configured correctly.
- UPS strongly recommended.

The BIOS power-recovery setting should be configured to power the PC on after electricity returns. Vendors use names such as `Restore on AC Power Loss`, `AC Back`, or `After Power Failure`.

### 6.2 Windows configuration

- Use a supported and patched Windows version.
- Disable sleep and hibernation while the PC is serving the POS.
- The monitor may turn off without suspending the computer.
- Prevent the network adapter from being powered down for energy saving.
- Configure active hours and controlled Windows Update restarts.
- Reserve a stable LAN address in the router if other store devices connect over LAN.
- Use a dedicated non-administrator Windows account for ordinary POS operation.

### 6.3 Timezone and clock

- Windows timezone must be `Asia/Ulaanbaatar` or the corresponding Windows timezone.
- Automatic time synchronization must be enabled.
- Application timestamps remain stored consistently and are presented in Ulaanbaatar time.
- Incorrect system time must trigger an operational warning because it affects shifts, receipts, reports, and backups.

## 7. Automatic startup and process supervision

The server must run independently of the visible POS window and independently of an interactive user login.

Required startup order:

1. Windows boots.
2. Networking becomes available.
3. The Laravel server starts as a background Windows service or startup task.
4. Required queue and scheduler processes start.
5. Tailscale starts in unattended/server mode.
6. A health check confirms that Laravel can read the database.
7. The POS UI can be opened.

### 7.1 Process behavior

- Processes start automatically at system startup.
- A crashed process restarts automatically with a bounded delay.
- Only one instance of each required process may run.
- Logs are written to a known location and rotated.
- Startup failures are visible locally and included in health monitoring.
- Stopping or closing the desktop UI must not stop the background server.

### 7.2 Health endpoint

A private health check should verify at minimum:

- the Laravel process responds;
- the database can be opened and queried;
- required migrations are present;
- the storage and backup locations are writable;
- available disk space is above a safe threshold; and
- the latest successful backup is not older than the allowed limit.

The endpoint must not expose secrets, paths, configuration values, customer data, or detailed exception traces.

## 8. Tailscale requirements

- Install Tailscale on the store PC and each administrator device.
- Enable unattended/server mode on the store PC.
- Restrict store-server access to approved administrator identities and devices.
- Do not grant employees general remote network access unless required.
- Disable key expiry only for the trusted store server, with an account recovery process documented.
- Remove lost or retired devices immediately.
- Require multi-factor authentication on the identity provider used for Tailscale.
- Test access after a reboot with no Windows user logged in.

Reference: [Tailscale unattended mode](https://tailscale.com/docs/how-to/run-unattended).

## 9. Network and application security

- Do not forward the Laravel, database, RDP, or SMB ports from the public internet.
- Bind services only to localhost, the trusted LAN, or the intended Tailscale interface.
- Keep Laravel debug mode disabled in production.
- Use unique accounts; administrators must not share credentials.
- Enforce application roles on the server, not only by hiding UI controls.
- Protect login endpoints with rate limiting.
- Maintain an audit trail for login, corrections, voids, stock restoration, and user-management actions.
- Store secrets outside Git and outside distributable installers.
- Rotate credentials after suspected compromise.
- Keep Windows, PHP, Laravel, Tailscale, and supporting tools patched.

## 10. Backup specification

Backups are not synchronization and are not a live secondary database. They exist for recovery after corruption, accidental deletion, ransomware, disk failure, or PC loss.

### 10.1 Backup contents

Each recoverable backup must include:

- a transaction-safe MariaDB logical dump;
- any application-managed uploaded files, if uploads are added later;
- a manifest containing application version, migration state, creation time, timezone, and checksums; and
- the minimum non-secret configuration required to identify and restore the installation.

Secrets should be restored from a separately protected secret store, not embedded unencrypted in the backup.

### 10.2 Safe MariaDB backup

Do not copy the live MariaDB data directory while writes may be occurring. Use `mariadb-dump`/`mysqldump` with a single transaction, or a separately approved physical-backup tool, to create a consistent backup.

The backup job must:

1. produce a consistent snapshot;
2. verify its integrity;
3. calculate a checksum;
4. encrypt the offsite copy;
5. upload using retry-safe naming; and
6. record success only after verification and upload complete.

### 10.3 Proposed schedule and retention

- Local snapshot every hour.
- Encrypted offsite snapshot every night.
- Retain 24 hourly backups.
- Retain 7 daily backups.
- Retain 4 weekly backups.
- Retain 6 monthly backups.

These values may be adjusted after measuring database size and upload capacity.

### 10.4 Recovery objectives

- Target recovery point objective (RPO): no more than one hour of data loss after local disk failure.
- Target recovery time objective (RTO): restore core POS operation within two hours when replacement hardware is available.
- Perform a documented restore test before production sign-off and at least quarterly afterward.

### 10.5 Offsite storage

Cloudflare R2 may be used later for encrypted backup objects. The bucket must be private, credentials must be limited to the required bucket operations, and retention/lifecycle rules must be configured.

R2 is not required for initial local operation and must not be treated as the live database.

## 11. Failure behavior

| Failure | Local POS | Remote admin | Required response |
|---|---|---|---|
| Internet unavailable | Continues | Unavailable | Wait for connectivity; do not create a second writable database |
| Tailscale unavailable | Continues | Unavailable | Diagnose Tailscale while local work continues |
| POS window closed | Continues | Continues | Background server remains running |
| Laravel process crashes | Brief interruption | Brief interruption | Supervisor restarts process and logs the event |
| Windows restarts | Interrupted during boot | Interrupted during boot | Services start automatically and health check runs |
| Power failure | Unavailable | Unavailable | UPS handles short outage; BIOS boots after power returns |
| MariaDB corruption | Unavailable or degraded | Unavailable or degraded | Stop writes, preserve the data directory, restore a verified backup |
| Store PC hardware failure | Unavailable | Unavailable | Restore latest backup to prepared replacement hardware |
| Admin device lost | Continues | Security risk | Revoke device and sessions immediately |
| Offsite backup upload fails | Continues | Continues | Keep local backup and retry with alerting |

## 12. Concurrency and data-integrity requirements

Because employees and administrators can act at the same time, every significant mutation must be transaction-safe.

Required protections include:

- database transactions for multi-record operations;
- fresh record reads before mutation;
- application-level locking where an operation spans related records;
- uniqueness constraints for identifiers and one-active-session rules;
- idempotency for payment and retryable administrative operations;
- stock availability revalidation immediately before commit;
- no silent last-write-wins behavior for financial corrections; and
- useful validation errors when another user changed the record first.

MariaDB remains the production database used by the store server and desktop package. A move to another database should be driven by demonstrated operational needs, not by remote access alone.

## 13. Observability and alerts

The installation should record and surface:

- server start, stop, crash, and restart events;
- failed logins and remote administrator logins;
- administrative corrections and reasons;
- backup success, failure, age, size, and checksum status;
- database integrity-check failures;
- low disk space;
- queue or scheduler failures; and
- application version and migration version.

At minimum, a responsible administrator must be notified when the nightly offsite backup fails or the last verified backup becomes too old.

## 14. Deployment phases

### Phase A: Audit and preparation

- Confirm the exact production database and storage paths.
- Inventory every admin edit, void, cancel, restore, reopen, and delete action.
- Confirm each action updates related financial and stock state atomically.
- Record current store PC specifications and Windows version.
- Create and verify a manual backup before any deployment change.

### Phase B: Development-machine rehearsal

- Reproduce the production runtime on the development PC.
- Test startup, shutdown, crash recovery, migrations, queues, scheduling, and backups.
- Restore a sanitized copy of production data.
- Test all core POS and admin correction workflows.
- Do not modify the live desktop installation during this phase.

### Phase C: Store-PC background server

- Install the tested background-server configuration alongside the current controlled release process.
- Configure automatic startup and process supervision.
- Verify the POS works locally with the internet disconnected.
- Verify closing the UI does not stop the server.
- Reboot twice and confirm unattended startup.

### Phase D: Private remote access

- Install and authorize Tailscale.
- Apply access rules.
- Test administrator access from a non-store network.
- Confirm an employee account cannot access admin operations.
- Confirm remote access fails safely when Tailscale is disconnected.

### Phase E: Backup and recovery

- Enable scheduled local backups.
- Enable encrypted offsite backups.
- Test alerting by forcing one controlled upload failure.
- Restore onto a separate test location or replacement machine.
- Record the restoration procedure and elapsed time.

### Phase F: Production acceptance

- Run a controlled pilot outside peak business hours.
- Verify register, stock, tables, tabs, receipts, reports, and admin corrections.
- Confirm local operation during a simulated internet outage.
- Obtain explicit approval before replacing or updating the current desktop release.

## 15. Acceptance criteria

The first production release is acceptable only when all the following pass:

1. The store PC boots and the server becomes healthy without opening the POS manually.
2. The local POS completes a test sale with the internet disconnected.
3. The local POS can manage a table and open tab without internet.
4. A remote administrator can connect through Tailscale and sign in.
5. An administrator correction is immediately visible locally after refresh.
6. Employee accounts cannot call admin correction endpoints directly.
7. Concurrent or repeated correction requests do not double-adjust stock or payments.
8. Closing the visible POS window does not stop the server.
9. Restarting Windows restores the server and Tailscale unattended access.
10. A verified local backup is produced automatically.
11. A verified encrypted offsite backup is produced automatically.
12. A backup restores successfully to a clean test environment.
13. No application, database, RDP, or SMB port is publicly exposed.
14. Logs and health output contain no secrets or customer-sensitive data.

## 16. Optional future cloud reporting replica

Only add a cloud replica if administrators must view reports while the store PC or its internet connection is unavailable.

The first cloud replica must be read-only and use an outbox pattern:

1. A committed store transaction creates an outbox event in the same database transaction.
2. A background worker sends pending events to the cloud when internet is available.
3. Every event has a globally unique ID, type, aggregate ID, version, creation time, and payload schema version.
4. The cloud consumer applies each event idempotently.
5. Acknowledged events are retained long enough for audit and replay.
6. Failed events retry with backoff and remain observable.
7. Events for the same business entity are applied in order.

Suitable read-only data includes:

- completed receipts;
- register-shift summaries;
- sales reports;
- inventory reports;
- audit history; and
- summarized table usage.

Cloud reporting must never become an alternative write path without a separately approved bidirectional-sync design.

## 17. Requirements for any future bidirectional synchronization

Bidirectional synchronization is a separate major project. It must not be enabled by adding a second database connection alone.

Before implementation it requires:

- globally unique IDs generated independently of database auto-increment values;
- per-record or per-aggregate versions;
- deletion tombstones instead of untracked hard deletes;
- an immutable operation/audit log;
- idempotency keys for payments and stock operations;
- explicit ownership of which system may edit each record type;
- deterministic conflict rules for every writable entity;
- ordered delivery for dependent events;
- retry, dead-letter, replay, and reconciliation tools;
- schema-version compatibility during rolling upgrades;
- clock-skew tolerance;
- authentication and rotation for machine credentials;
- encryption in transit and at rest;
- dashboards for lag, failures, and conflicts; and
- extensive automated and failure-injection tests.

Payments, receipts, register movements, and stock should be modeled as append-only operations or explicit reversals. They must not use generic last-write-wins conflict resolution.

## 18. Operational runbook summary

### Remote admin cannot connect

1. Confirm the store has internet.
2. Confirm the store PC is powered on.
3. Check the device in the Tailscale admin console.
4. Ask store staff whether the local POS is healthy.
5. Do not ask employees to expose ports or share database credentials or files.

### Local POS cannot connect

1. Check the background server status.
2. Check the private health endpoint locally.
3. Review recent server logs.
4. Restart only the failed supervised service.
5. Avoid repeatedly launching extra server instances.

### Suspected database corruption

1. Stop application writes.
2. Preserve the MariaDB data directory for investigation.
3. Run integrity checks against a copy, not the only original.
4. Select the newest verified backup.
5. Restore into a separate location and validate it.
6. Switch production only after the restored data passes validation.

### Employee needs an urgent correction

1. Record the receipt, tab, table, or session identifier.
2. Record the requested correction and reason.
3. Administrator performs the approved action through the application.
4. Employee refreshes and confirms the result.
5. Administrator verifies related stock and register totals when applicable.

## 19. Decision record

The selected first architecture is:

- store PC as the application server;
- MariaDB as the single live database;
- local/LAN access for store operation;
- Tailscale for private remote administration;
- supervised automatic startup;
- transaction-safe local backups;
- encrypted offsite backups; and
- no live cloud database or bidirectional synchronization.

This architecture prioritizes store continuity, data consistency, and recoverability. It can later support a read-only cloud reporting replica without changing the store database into a multi-writer system.
