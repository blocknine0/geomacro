# Early Warning Distribution Receipt Contract

Status: PRELAUNCH · LIVE PUSH DISABLED

This contract hardens future public Early Warning distribution against duplicate posts and ambiguous delivery outcomes. It does not activate Telegram, Discord, Bluesky, Mastodon or any other push channel.

## Existing durable ledger

Migration `937_early_warning_alert_ledger.sql` created the service-role-only `early_warning_distribution_receipts` table with one durable row per Early Warning alert and channel.

Migrations `940_early_warning_distribution_claims.sql` and `941_early_warning_distribution_attempt_cap.sql` extend that ledger rather than creating a parallel marketing database.

## Claim contract

`claim_early_warning_distribution(...)`:

- only accepts an already-published, public-eligible `WARNING` or `CRITICAL` alert;
- binds the exact rendered channel payload with a SHA-256 hash;
- creates at most one receipt for an alert/channel pair;
- locks the receipt row before granting a worker lease;
- returns a unique claim token and bounded lease window;
- refuses to reacquire already-published, skipped, actively leased, ambiguous or payload-drifted receipts;
- remains callable only by `service_role`.

Default lease duration is 120 seconds and the supported range is 30–600 seconds.

## Finalize contract

`finalize_early_warning_distribution(...)` accepts four explicit outcomes:

- `PUBLISHED`
- `RETRYABLE_FAILURE`
- `AMBIGUOUS`
- `SKIPPED`

A finalize call requires the current claim token. Stale or superseded claims fail closed.

`PUBLISHED` stores the publication timestamp and optional external reference.

`RETRYABLE_FAILURE` clears the lease and may be reclaimed later, subject to the hard attempt cap.

`AMBIGUOUS` is deliberately different from an ordinary failure. It means the remote service may have accepted the post but Geomacro did not receive a trustworthy final response. Automatic retry is blocked so a timeout cannot silently create a duplicate public post.

`SKIPPED` is also terminal for automatic processing.

## Hard retry cap

Each alert/channel receipt is capped at five claimed attempts. This is a database-level fail-closed boundary, not only an application setting.

## Application helper

`scripts/marketing/distribution-receipt-ledger.mjs` provides:

- deterministic payload hashing;
- service-role Supabase client creation only when explicitly requested;
- claim RPC wrapper;
- finalize RPC wrapper;
- input and response-shape validation.

The module lazy-loads Supabase so shadow contract tests stay zero-install and zero-write.

## Activation boundary

`config/auto-distribution.json` remains:

- `mode = prelaunch-shadow`
- `live_publish_enabled = false`
- `receipt_policy.live_worker_wired = false`
- ambiguous retries = `manual_only`

Therefore the presence of the receipt contract does not authorize live posting.

Before live push can be considered, all of the following still have to be true:

1. migrations 940 and 941 replay cleanly and are applied to the intended production database;
2. the actual live worker is wired to claim before every external write and finalize after every result;
3. channel credentials are configured in protected secrets;
4. each channel's current API/automation terms remain compatible with the intended use;
5. live feed health is verified;
6. explicit owner launch authorization is given.

RSS remains a pull-based public syndication surface and does not require an external push receipt.
