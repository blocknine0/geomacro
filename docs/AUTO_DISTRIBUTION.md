# Geomacro Public Alert Auto Distribution

Status: CANONICAL FEED INTEGRATED · RECEIPT-WIRED · SHADOW MODE

Geomacro's public alert distributor is a separate lane from the commercial marketing draft queue. Its purpose is to let one verified public Early Warning alert feed multiple free distribution surfaces without rewriting or reclassifying the intelligence per platform.

## Two-lane rule

1. **Verified public Early Warning alerts** may flow into the public distribution pipeline after the canonical public-feed gates pass.
2. **Revenue, customer, marketplace and commercial milestone marketing** stays owner-approved and must never be auto-published through this lane.

## Canonical source

The distributor consumes the bounded public API:

`https://geomacro.live/api/early-warning`

Required public feed schema:

`geomacro.public-early-warning-feed.v1`

The adapter in `scripts/marketing/public-feed-adapter.mjs` validates the public-feed safety boundaries and converts a public feed item into the narrow distribution payload expected by the channel renderer.

The marketing layer does not read raw evidence, source identities, CEWS internals, customer context or internal Risk Objects.

## Free distribution surfaces

Push adapters supported by the renderer:

- Telegram Bot API
- Discord incoming webhook
- Bluesky AT Protocol
- Mastodon status API

Native pull/syndication surface:

- RSS 2.0 via `https://geomacro.live/api/early-warning?format=rss`

LinkedIn remains disabled until the required API approval exists. X remains disabled in the zero-cost core because programmatic posting can require paid API access. Both can still receive owner-approved manual copy later without changing the intelligence engine.

## Current activation state

`config/auto-distribution.json` is deliberately fail-closed:

- `mode = prelaunch-shadow`
- `default_dry_run = true`
- `live_publish_enabled = false`
- `receipt_policy.live_worker_wired = true`

A scheduled GitHub Actions workflow, `.github/workflows/auto-distribution-shadow.yml`, runs every 15 minutes. In scheduled/manual runs it reads the live bounded public feed and renders Telegram, Discord, Bluesky and Mastodon copies without sending them anywhere.

Pull requests use an offline fixture so CI does not depend on the live website.

## Receipt-ledger delivery contract

The guarded future live path now uses the existing service-role-only `early_warning_distribution_receipts` ledger created by migration 937 and hardened by migrations 940, 941 and 942.

Before any push write, the worker:

1. renders the exact bounded channel payload;
2. hashes the payload and destination context;
3. atomically claims the alert/channel receipt;
4. refuses already-published, actively leased, skipped, ambiguous, payload-drifted or exhausted receipts;
5. writes to the external channel only after a successful claim;
6. finalizes the durable receipt with `PUBLISHED`, `RETRYABLE_FAILURE`, `AMBIGUOUS` or `SKIPPED`.

A stale unfinalized claim is never automatically retried. It becomes ambiguous/manual-only because a remote service may have accepted a write before the worker lost its final response. This is the duplicate-post safety boundary for runner crashes and network ambiguity.

## Why live push is still locked

The guarded live code path exists, but `live_publish_enabled` remains `false`, so current scheduled and manual runs cannot make external push writes.

A future live invocation is additionally restricted to the canonical `https://geomacro.live/api/early-warning` source. Live mode refuses fixture input and non-canonical feed paths. The worker also requires:

- the canonical poller's live marker;
- an available service-role Supabase client for receipt writes;
- all selected channel credentials before any receipt is claimed;
- exact explicit owner acknowledgement through `GEOMACRO_EARLY_WARNING_DISTRIBUTION_ACK` with the configured authorization value.

Activation therefore remains a separate, reviewable step after database migration verification, credential provisioning, source-feed health, platform/API terms review, release-candidate security/resilience checks and explicit owner authorization.

## Eligibility policy

The public renderer applies the versioned policy in `config/auto-distribution.json`. A normalized alert must be:

- `content_type = early_warning`;
- `visibility = public`;
- `WARNING` or `CRITICAL`;
- confidence at least `0.70`;
- backed by an official source or at least two independent evidence items;
- timestamped with valid UTC and IANA local-time data.

The canonical `/api/early-warning` endpoint applies stricter upstream gates before the distributor sees the item.

## Canonical public item shape

The distributor consumes the nested public-feed item, not the legacy flat input shape. Example fields:

```json
{
  "schema_version": "early-warning-1.0",
  "alert_key": "stable-alert-key",
  "country": {
    "iso3": "IND",
    "name": "India",
    "local_timezone": "Asia/Kolkata"
  },
  "event": {
    "family": "monetary_policy",
    "title": "...",
    "primary_cause": "..."
  },
  "early_warning": {
    "status": "WARNING",
    "cews_score": 76.4,
    "confidence": 0.86,
    "independent_evidence_count": 3,
    "official_source_present": true,
    "methodology_version": "cews-v0.1.0-provisional",
    "methodology_calibrated": false
  },
  "timestamps": {
    "detected_at_utc": "2026-09-16T08:12:41.000Z",
    "detected_at_local": "2026-09-16T13:42:41+05:30",
    "published_at_utc": "2026-09-16T08:13:00.000Z"
  },
  "boundaries": {
    "structural_pressure_only": true,
    "market_price_prediction": false,
    "trading_instruction": false,
    "public_performance_claims_allowed": false
  }
}
```

## Local dry-run commands

Validate the canonical adapter:

```bash
node scripts/marketing/test-public-feed-adapter.mjs
```

Validate the durable receipt and worker contract:

```bash
node scripts/marketing/test-distribution-receipt-ledger.mjs
```

Render a canonical feed fixture through all free push adapters without network writes:

```bash
node scripts/marketing/poll-public-early-warning.mjs \
  --input=scripts/marketing/fixtures/sample-public-early-warning-feed.json \
  --channels=telegram,discord,bluesky,mastodon
```

Render directly from the live bounded feed in shadow mode:

```bash
node scripts/marketing/poll-public-early-warning.mjs \
  --url=https://geomacro.live/api/early-warning \
  --limit=5
```

Do not use `--live` during prelaunch. The config gate is intentionally disabled.

## Credentials reserved for future live activation

Telegram:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

Discord:
- `DISCORD_WEBHOOK_URL`

Bluesky:
- `BLUESKY_IDENTIFIER`
- `BLUESKY_APP_PASSWORD`
- optional `BLUESKY_SERVICE`

Mastodon:
- `MASTODON_BASE_URL`
- `MASTODON_ACCESS_TOKEN`

Distribution ledger:
- `APP_SUPABASE_URL` or `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` or `APP_SUPABASE_SERVICE_ROLE_KEY`

Owner launch acknowledgement:
- `GEOMACRO_EARLY_WARNING_DISTRIBUTION_ACK`

Credentials and acknowledgement alone do not activate publishing. `live_publish_enabled` must still be separately changed after the launch gates pass.

## Explicitly out of scope

- automatic replies to strangers;
- unsolicited DMs;
- mass mentions;
- follow/unfollow automation;
- engagement manipulation;
- fabricated urgency or unsupported performance claims;
- automatic commercial/customer/revenue announcements;
- automatic trading instructions;
- payment or mainnet activation.

The purpose is factual distribution of already-public Geomacro intelligence, not spam, engagement manipulation or a bypass around the commercial launch process.
