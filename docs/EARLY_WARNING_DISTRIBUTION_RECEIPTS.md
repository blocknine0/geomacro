# Early Warning Distribution Receipt Contract

Status: PRELAUNCH · WORKER RECEIPT-WIRED · LIVE PUSH DISABLED

This contract hardens future public Early Warning distribution against duplicate posts and ambiguous delivery outcomes. The worker is now wired to the durable receipt ledger, but this change does not activate Telegram, Discord, Bluesky, Mastodon or any other push channel.

## Existing durable ledger

Migration `937_early_warning_alert_ledger.sql` created the service-role-only `early_warning_distribution_receipts` table with one durable row per Early Warning alert and channel.

Migrations `940_early_warning_distribution_claims.sql`, `941_early_warning_distribution_attempt_cap.sql` and `942_early_warning_distribution_fail_closed_reclaim.sql` extend that same ledger. There is no parallel marketing receipt database.

## Claim contract

`claim_early_warning_distribution(...)`:

- only accepts an already-published, public-eligible `WARNING` or `CRITICAL` alert;
- binds the exact rendered channel payload with a SHA-256 hash;
- creates at most one receipt for an alert/channel pair;
- locks the receipt row before granting a worker lease;
- returns a unique claim token and bounded lease window;
- refuses to reacquire already-published, skipped, actively leased, ambiguous or payload-drifted receipts;
- allows a retry only after an explicitly finalized, non-ambiguous retryable failure;
- refuses a sixth claimed attempt and keeps the database-level five-attempt cap;
- remains callable only by `service_role`.

Default lease duration is 120 seconds and the supported range is 30–600 seconds.

## Stale-claim fail-closed rule

A lease timeout by itself is not proof that an external post failed. The remote service may have accepted the write before the worker crashed or lost the response.

Migration 942 therefore changes expired, unfinalized `PENDING` claims into an ambiguous failed receipt that requires manual reconciliation. It is not automatically reclaimed. This prevents a runner restart from silently reposting an alert after an unknowable prior delivery outcome.

A new claim sets the receipt back to `PENDING`, so a later crash during an explicitly retried delivery is subject to the same fail-closed rule.

## Finalize contract

`finalize_early_warning_distribution(...)` accepts four explicit outcomes:

- `PUBLISHED`
- `RETRYABLE_FAILURE`
- `AMBIGUOUS`
- `SKIPPED`

A finalize call requires the current claim token. Stale or superseded claims fail closed.

`PUBLISHED` stores the publication timestamp and optional external reference.

`RETRYABLE_FAILURE` clears the lease and may be reclaimed later, subject to the hard attempt cap.

`AMBIGUOUS` means the remote service may have accepted the post but Geomacro does not have a trustworthy final result. Automatic retry is blocked and manual reconciliation is required.

`SKIPPED` is terminal for automatic processing.

## Worker wiring

`scripts/marketing/auto-distribute-alert.mjs` now uses `scripts/marketing/distribution-receipt-ledger.mjs` for the future live path.

For every push channel it must:

1. validate the channel is enabled and required credentials exist;
2. deterministically render the bounded public payload;
3. bind that payload and destination context into a SHA-256 payload hash;
4. atomically claim the alert/channel receipt before any external write;
5. skip a receipt that is already published and fail closed on blocked claims;
6. perform the external write only while holding the claim;
7. finalize `PUBLISHED`, `RETRYABLE_FAILURE`, `AMBIGUOUS` or `SKIPPED` with response metadata;
8. return a failing process status when a live delivery cannot be safely completed.

If an external service confirms success but receipt finalization fails, the worker attempts to mark the receipt `AMBIGUOUS`. If even that database write cannot be completed, the unfinalized lease is later caught by migration 942 and becomes manual-only rather than automatically retried.

Mastodon also receives its native `Idempotency-Key`. The durable Geomacro receipt ledger remains the cross-channel source of truth.

## Canonical-source boundary

The live path is reachable only through `scripts/marketing/poll-public-early-warning.mjs`. The poller refuses fixture input in live mode and only accepts the canonical HTTPS path:

`https://geomacro.live/api/early-warning`

The worker requires the poller's internal `--canonical-feed-live` marker in addition to all activation gates. This prevents a standalone local JSON file from becoming a live publishing source.

RSS remains a pull-based public syndication surface and does not require an external push receipt.

## Activation boundary

`config/auto-distribution.json` remains fail-closed:

- `mode = prelaunch-shadow`
- `live_publish_enabled = false`
- `receipt_policy.live_worker_wired = true`
- ambiguous retries = `manual_only`
- stale unfinalized claim retries = `manual_only`

The guarded code path now exists, but the configuration still prevents external push writes.

Even after a future config change, live mode additionally requires the explicit owner acknowledgement named by `receipt_policy.owner_launch_ack_env`. Credentials alone cannot activate publishing.

Before live push can be separately authorized, all of the following still have to be true:

1. migrations 940, 941 and 942 replay cleanly and are applied to the intended production database;
2. protected channel credentials are configured without exposing them to pull-request jobs;
3. current channel API and automation terms are compatible with the intended factual public-intelligence distribution;
4. the canonical public feed is healthy and its safety boundaries are verified on the release candidate;
5. the exact release candidate passes the relevant security, resilience and launch-acceptance checks;
6. explicit owner authorization is given;
7. `live_publish_enabled` is changed in a separate, reviewable activation step.

None of these receipt changes authorize payments, mainnet settlement, commercial auto-marketing, replies, DMs, mass mentions, engagement automation or trading instructions.
