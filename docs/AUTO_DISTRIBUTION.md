# Geomacro Public Alert Auto Distribution

Status: PRELAUNCH FOUNDATION

Geomacro's public alert distributor is a separate lane from the existing commercial marketing draft queue.

## Two-lane rule

1. **Verified public early-warning alerts** may be automatically distributed when strict public eligibility gates pass.
2. **Revenue, customer, marketplace and commercial milestone marketing** continues to use the existing owner-approved draft queue. This distributor must never be used to bypass that approval requirement.

## Goal

A solo founder should not need to manually rewrite the same verified public alert for every channel. One canonical Early Warning alert can be rendered into channel-specific public posts while preserving country-local time, UTC time, cause, confidence and bounded market relevance.

## Zero-cost core channels

- Telegram Bot API
- Discord incoming webhook
- Bluesky AT Protocol
- Mastodon status API

LinkedIn is disabled until the required Community Management API access is approved. X is disabled in the zero-cost core because current self-serve API posting is metered.

## Eligibility gate

By default an alert can be distributed only when all of the following are true:

- `content_type` is `early_warning`;
- `visibility` is `public`;
- status is `WARNING` or `CRITICAL`;
- confidence is at least 0.70;
- the signal has an official source or at least two independent evidence items;
- required country, cause and timestamp fields are present.

The policy is versioned in `config/auto-distribution.json`.

## Safety and commercial boundaries

The public renderer emits a bounded teaser, not the full paid intelligence object. Fields listed in `never_publish_fields` must never be emitted. The copy states that the alert is structured risk intelligence rather than a buy/sell signal.

Publishing is dry-run by default. Live publishing requires `--live` and credentials for the relevant channels.

A durable distribution ledger must be connected before production auto-publishing so retries and worker restarts cannot create duplicate public posts. The canonical Early Warning ledger remains the source of truth for alert identity and timestamps.

## Required alert shape

```json
{
  "alert_id": "unique-stable-id",
  "content_type": "early_warning",
  "visibility": "public",
  "country": "India",
  "country_iso3": "IND",
  "status": "WARNING",
  "confidence": 0.86,
  "event_title": "...",
  "primary_cause": "...",
  "transmission_channels": ["rates", "currency"],
  "market_relevance": {"equities": "high", "crypto": "moderate", "fx": "very_high"},
  "independent_evidence_count": 3,
  "official_source_present": true,
  "detected_at_utc": "2026-09-16T08:12:41Z",
  "country_timezone": "Asia/Kolkata",
  "detected_at_local": "2026-09-16T13:42:41+05:30",
  "public_url": "https://geomacro.live/..."
}
```

The Early Warning engine is responsible for assigning the correct IANA timezone and local timestamp before the object reaches this distributor.

## Dry run

```bash
node scripts/marketing/auto-distribute-alert.mjs \
  --input=scripts/marketing/fixtures/sample-alert.json
```

Optional channel filter:

```bash
node scripts/marketing/auto-distribute-alert.mjs \
  --input=scripts/marketing/fixtures/sample-alert.json \
  --channels=telegram,bluesky
```

## Live environment variables

Telegram:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

Discord:
- `DISCORD_WEBHOOK_URL`

Bluesky:
- `BLUESKY_IDENTIFIER`
- `BLUESKY_APP_PASSWORD`
- optional `BLUESKY_SERVICE`, defaults to `https://bsky.social`

Mastodon:
- `MASTODON_BASE_URL`
- `MASTODON_ACCESS_TOKEN`

Live invocation:

```bash
node scripts/marketing/auto-distribute-alert.mjs \
  --input=/path/to/verified-public-alert.json \
  --live
```

## Explicitly out of scope

- automatic replies to strangers;
- unsolicited DMs;
- mass mentions;
- follow/unfollow automation;
- engagement manipulation;
- fabricated urgency or unsupported performance claims;
- auto-publishing revenue/customer/commercial milestone drafts.

The system is intended to distribute factual, source-backed Geomacro intelligence, not to operate as a spam bot.
