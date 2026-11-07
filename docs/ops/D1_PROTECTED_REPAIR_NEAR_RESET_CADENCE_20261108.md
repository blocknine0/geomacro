# Protected D1 0204–0211 repair: account-aware UTC admission cadence

**Scope:** schedule governance only; this is NOT a D1 migration, Worker release,
payment activation, quota-limit increase, proof of provider headroom or risk-signing.

## Root cause
Before this change the protected migration preflight ran at 15/35/55 minutes
of **every hour** (72 scheduled invocations/day) **plus** 00:04 UTC.
The previous live D1 provider sample was 4.216M rows read and 401k written.
The strict migration-only gate requires **fewer than 60k** rows read AND written
already observed today to reserve 80k headroom. Once the old Worker exhausts
that morning window, another 70+ preflights cannot create real headroom;
they expend GitHub Actions minutes and Cloudflare Billing/Worker/Time Travel
API calls without applying a migration.

## Permanent scheduling change
- Daily 00:04 and 00:09 UTC; no recurring all-day 20-minute preflight. This is
  at most **two scheduled attempted preflight runs/day**, down from **73**.
- No modification to the independent Hot50/source poll 20-minute cron.
- Manual `workflow_dispatch`, code-change PR tests and push exact-main path
  triggers remain available.
- Stage B still requires real Workers Paid, same-account D1 Time Travel bookmark
  and baseline, same-UTC-day live provider usage, 80k read **and** write reserve,
  reviewed/hash-pinned migration SQL, bounded table exposure and 0204–0211
  history/schema proof. The existing production concurrency group remains.
- Canceled/delayed GitHub scheduler executions, provider counter lag, exceeding
  the 60k cutoff before job starts, long/missing migration history, and
  divergent exact-main SHA remain legitimate holds. GitHub scheduler delivery
  is not guaranteed and no completion can be inferred from scheduled events.

## Required physical acceptance
1. Successful exact-head Product CI + CodeQL.
2. During fresh UTC window, inspect provider-migration-headroom **and**
   protected-0204-0211-migration job receipts. A skipped/held Stage B remains
   incomplete and never counts as DDL applied.
3. Require real D1 migration history empty and exact 0204–0211 object readback.
4. Separately authorize existing protected Hot50 Worker 0-to-100 no-funds
   rollout; then verify deployed SHA, cache/SWR publisher ACK, persistent
   source storage, signer and auth parity, backup and rollback.
5. Collect a sustained complete UTC day with provider-billed rows_read and
   rows_written each at or below the owner's 140,000/day target. Check B2/R2
   and account usage independently before reopening commercialization.

**Safety:** preserving the canary HOLD is deliberate; a PR merge does not
remove the need for provider-backed migration and traffic rollout.
