# Early Warning Distribution Receipt Contract

Status: PRELAUNCH · LIVE PUSH DISABLED

This contract hardens future public Early Warning distribution against duplicate posts and ambiguous delivery outcomes. It does not activate Telegram, Discord, Bluesky, Mastodon or any other push channel.

## Durable ledger

Migration `937_early_warning_alert_ledger.sql` created the service-role-only `early_warning_distribution_receipts` table with one durable row per Early Warning alert and channel.

The receipt safety chain is now:

- `940_early_warning_distribution_claims.sql`: payload-bound atomic leases and claim/finalize RPCs;
- `941_early_warning_distribution_attempt_cap.sql`: hard maximum of five claimed attempts per alert/channel;
- `942_early_warning_expired_lease_safety.sql`: an expired unfinalized lease becomes ambiguous instead of being reacquired;
- `943_early_warning_distribution_reconciliation.sql`: append-only manual reconciliation audit and service-role-only reconciliation RPC.

## Claim contract

`claim_early_warning_distribution(...)`:

- only accepts an already-published, public-eligible `WARNING` or `CRITICAL` alert;
- binds the exact rendered channel payload with a SHA-256 hash;
- creates at most one receipt for an alert/channel pair;
- locks the receipt row before granting a worker lease;
- returns a unique claim token and bounded lease window;
- refuses already-published, skipped, ambiguous or payload-drifted receipts;
- refuses an active lease;
- refuses a sixth delivery attempt;
- remains callable only by `service_role`.

Default lease duration is 120 seconds and the supported range is 30–600 seconds.

## Why an expired lease is ambiguous

An expired lease is not equivalent to a safe failure.

A worker can:

1. claim a receipt;
2. send the post to an external platform;
3. have the platform accept the post;
4. crash before Geomacro records `PUBLISHED`.

If another worker simply reclaimed that expired lease, Telegram, Discord or another non-idempotent surface could receive a duplicate post.

Migration 942 therefore changes the rule: an unfinalized expired lease is atomically changed to `FAILED` with `ambiguous_outcome=true`, the lease is cleared, and automatic retry is blocked. The receipt must be checked manually before anything else happens.

This is deliberately conservative. A worker that crashed before sending anything also requires reconciliation, because Geomacro cannot prove that the remote write did not happen.

## Finalize contract

`finalize_early_warning_distribution(...)` accepts four explicit outcomes:

- `PUBLISHED`
- `RETRYABLE_FAILURE`
- `AMBIGUOUS`
- `SKIPPED`

A finalize call requires the current claim token. Stale or superseded claims fail closed.

`PUBLISHED` stores the publication timestamp and optional external reference.

`RETRYABLE_FAILURE` means the worker has trustworthy evidence that the external write did not happen. It clears the lease and may be reclaimed later, subject to the five-attempt cap.

`AMBIGUOUS` means the remote service may have accepted the post but Geomacro did not receive a trustworthy final result. Automatic retry is blocked.

`SKIPPED` is terminal for automatic processing.

## Manual reconciliation

`reconcile_early_warning_distribution(...)` is service-role only and operates only on an ambiguous receipt that has no lease.

It requires an actor and a human-readable note, then accepts one of three explicit resolutions:

- `PUBLISHED`: the operator verified that the remote post exists. The receipt becomes published. An observed external reference and publication time can be recorded.
- `RETRYABLE_FAILURE`: the operator verified that no remote post exists. Ambiguity is cleared and a later claim may be allowed if the attempt cap has not been reached.
- `SKIPPED`: the operator intentionally stops further delivery attempts.

Every reconciliation appends a row to `early_warning_distribution_reconciliations`. The audit history is not overwritten if another ambiguity happens after a later retry.

## Hard retry cap

Each alert/channel receipt is capped at five claimed attempts. This is a database-level fail-closed boundary, not only an application setting.

## Application helper

`scripts/marketing/distribution-receipt-ledger.mjs` provides:

- deterministic payload hashing;
- service-role Supabase client creation only when explicitly requested;
- claim RPC wrapper;
- finalize RPC wrapper;
- manual reconciliation RPC wrapper;
- input and response-shape validation.

Receipt contract version: `early-warning-distribution-lease-v2`.

The module lazy-loads Supabase so shadow contract tests stay zero-install and zero-write.

## Activation boundary

`config/auto-distribution.json` remains fail-closed:

- `mode = prelaunch-shadow`
- `live_publish_enabled = false`
- `receipt_policy.live_worker_wired = false`
- ambiguous retries = `manual_only`
- expired claims = `manual_only`

Therefore the presence of the receipt contract does not authorize live posting.

Before live push can be considered, all of the following still have to be true:

1. migrations 940–943 replay cleanly and are applied to the intended production database;
2. the actual live worker is wired to claim before every external write and finalize after every result;
3. the worker classifies uncertain network/process outcomes as ambiguous, never as safe retryable failures;
4. channel credentials are configured in protected secrets;
5. each channel's current API/automation terms remain compatible with the intended use;
6. live feed health is verified;
7. explicit owner launch authorization is given.

RSS remains a pull-based public syndication surface and does not require an external push receipt.
