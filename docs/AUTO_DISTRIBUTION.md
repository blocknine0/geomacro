# Geomacro Auto Distribution

Status: PRELAUNCH FOUNDATION

Geomacro's auto-distribution layer turns an already verified public Early Warning alert into channel-specific public posts. It does not discover facts, change risk scores, create trading instructions or publish premium/customer data.

## Goal

A solo founder should not need to manually rewrite the same verified alert for every channel. One canonical alert can be rendered and distributed to free channels while preserving the original country-local timestamp and UTC timestamp.

## Zero-cost core channels

- Telegram Bot API
- Discord incoming webhook
- Bluesky AT Protocol
- Mastodon status API

LinkedIn is disabled until the required Community Management API access is approved. X is disabled in the zero-cost core because current self-serve API posting is metered.

## Public eligibility gate

By default an alert can be distributed only when all of the following are true:

- status is `WARNING` or `CRITICAL`;
- confidence is at least 0.70;
- the signal has an official source or at least two independent evidence items;
- the alert contains required country, cause and timestamp fields.

The policy is versioned in `config/auto-distribution.json`.

## Safety and commercial boundaries

The public renderer deliberately emits a teaser, not the full paid intelligence object. Fields listed in `never_publish_fields` must never be emitted by this layer. The copy states that the alert is structured risk intelligence, not a buy/sell signal.

Publishing is dry-run by default. Live publishing requires `--live` and the credentials for the relevant channels.

## Required alert fields

```json
{
  "alert_id": "unique-stable-id",
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

The Early Warning engine remains responsible for assigning the correct IANA timezone and local timestamp before this distributor receives the object.

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

Then:

```bash
node scripts/marketing/auto-distribute-alert.mjs \
  --input=/path/to/verified-alert.json \
  --live
```

## Next integration step

When the Early Warning alert ledger is implemented, distribution should be triggered only after a canonical public alert is committed. Delivery receipts and remote post IDs should then be written to a durable distribution ledger so the same alert cannot be posted twice after retries or worker restarts.

Automatic replies, unsolicited DMs, mass mentions, follow/unfollow automation and engagement manipulation are out of scope. Distribution should remain factual, source-backed and rate-limited.
