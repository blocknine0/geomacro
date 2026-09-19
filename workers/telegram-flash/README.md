# Geomacro Breaking Flash Worker

This service is Geomacro's low-latency lead-intelligence layer for country-level geopolitical, macroeconomic and critical-minerals events.

The design deliberately separates **speed** from **truth**:

1. Telegram and selected machine feeds are ingested immediately as leads.
2. Every new item starts as `UNVERIFIED`.
3. Country attribution is attached through Geomacro's canonical ISO3 country registry.
4. A near-real-time corroboration loop compares the lead with independent Telegram channels, RSS/official feeds and existing GDELT-backed `live_structured_events`.
5. Matching evidence is stored in `live_flash_corroborations`.
6. A deterministic verification score promotes the item to `CORROBORATING` or `VERIFIED` only when independent evidence thresholds are met.
7. A canonical event-family layer deduplicates the same real-world event across sources.
8. An edited source record is versioned; material fact/headline changes are marked as updates.
9. Event-family versions increment only on material developments, while additional source reports remain corroboration.
10. Fast-wire ingestion itself never grants GRI/Risk Gate scoring eligibility.

This means a low-trust or unofficial source can still be extremely useful for early detection. Its trust level changes the verification weight, not whether Geomacro can ingest the lead internally.

## Architecture

```text
Telegram MTProto -------------------------------\
                                                  \
Al Jazeera RSS -----------------------------------+--> live-flash-ingest
Federal Reserve official RSS ---------------------+         |
ForexLive RSS ------------------------------------+         | country attribution
USGS Minerals News RSS ---------------------------/         v
                                                    live_flash_events
Existing Geomacro GDELT pipeline -------------------------> |
                                                            v
                                              live-flash-corroborate
                                                            |
                                           +----------------+----------------+
                                           |                                 |
                                  flash-to-flash match              structured-event match
                                           |                                 |
                                           +----------------+----------------+
                                                            v
                                                verification evidence graph
                                                            |
                                    UNVERIFIED -> CORROBORATING -> VERIFIED
                                                            |
                                                            v
                                             canonical event-family layer
                                                            |
                                       same event -> one family / new material fact -> vN
                                                            |
                                                            v
                                               structured intelligence path
                                                            |
                                                      GRO / Risk Gate
```

## Telegram manual-review allowlist

No Telegram channel is active by default.

Historical starter rows may exist in `live_telegram_channel_registry`, but migration `946_telegram_manual_review_gate.sql` resets them to `manual_review_status=PENDING` and `enabled=false`.

A channel can be ingested only when both conditions are true:

- the server-side registry row is manually reviewed and marked `APPROVED`;
- the same public username is deliberately present in the worker's `TELEGRAM_CHANNELS` deployment configuration.

Environment configuration alone cannot authorize a Telegram source. The ingest function checks the database gate again and rejects unapproved channels.

Every Telegram item is forced to `UNVERIFIED` at ingestion. A high source-reliability prior never bypasses independent corroboration.

Do not expose raw Telegram text or media as customer-facing publisher content unless rights are separately cleared. Telegram remains internal lead intelligence.

## Active free-first machine feeds

The long-lived worker has these default feed adapters:

### Geopolitics

- Al Jazeera RSS
- Existing Geomacro GDELT live ingestion and structured-event pipeline
- Telegram lead channels

### Macro

- Federal Reserve Board press-release RSS
- ForexLive RSS
- Telegram macro lead channels

### Critical minerals

- USGS Minerals News RSS
- Existing Geomacro USGS/minerals source layer

MINING.com RSS is not part of the active default hot path after production smoke testing returned persistent HTTP 403 responses. It remains a possible future source only if reliable permitted machine access becomes available.

The source registry also contains controlled candidates for Reuters, AP, Trading Economics, FinancialJuice web, Forex Factory, World News API, NewsAPI.ai/Event Registry, MetalMiner and Argus. A candidate registration does not mean scraping or commercial reuse is enabled.

## Corroboration rules

The current deterministic verifier uses four evidence dimensions:

1. **Time proximity**
   - fast flash-to-flash matching: up to 60 minutes
   - flash-to-structured-event matching: up to 90 minutes

2. **Country overlap**
   - explicit ISO3 hints are preferred when a source provides them
   - otherwise the canonical Geomacro country registry is used for deterministic text attribution

3. **Text/event similarity**
   - normalized token overlap with stopword removal
   - a stronger text match can still correlate an event when country tagging is absent

4. **Independent source diversity**
   - different RSS providers count independently
   - different Telegram channels count as different lead families
   - the existing GDELT structured event path counts as a separate corroboration family

A single source never verifies itself.

`VERIFIED` requires independent corroboration plus either:

- a sufficiently strong match to a structured event that itself has at least two independent sources, or
- at least three distinct fast-source families with a sufficiently strong event match,

and the deterministic verification score must clear the verification threshold.

`CORROBORATING` means independent matching evidence exists but the full verification threshold has not yet been reached.

## Database migrations

Apply the authoritative production migrations from `supabase/migrations`. The isolated Telegram signal project uses a separate Supabase workdir at `supabase/isolated-signal` and its own numeric migration track:

- `950_telegram_signal_ingest_isolation.sql`
- `951_telegram_signal_compact_storage.sql`
- `952_realtime_flash_event_lifecycle.sql`
- `953_event_family_version_ledger.sql`

## Supabase functions

Deploy:

- `supabase/functions/live-flash-ingest`
- `supabase/functions/live-flash-corroborate`

Both protected endpoints use the same strong server-side secret:

```text
FLASH_INGEST_TOKEN
```

The worker sends it through the `x-geomacro-flash-token` header.

Never expose this token in frontend/browser code.

## Telegram authentication

This worker uses Telegram MTProto through Telethon, not the Bot API, because a bot cannot simply read arbitrary public channels by name.

Create Telegram API credentials for the operator account and set locally:

```bash
export TELEGRAM_API_ID='...'
export TELEGRAM_API_HASH='...'
```

Generate a StringSession locally:

```bash
python -m pip install -r requirements.txt
python generate_session.py
```

Telegram will run the normal account login/verification flow. Store the resulting value only in the deployment secret:

```text
TELEGRAM_SESSION
```

Treat `TELEGRAM_SESSION` like a password. Anyone who obtains it may be able to operate the authenticated Telegram session.

## Worker environment

See `.env.example`.

Required core variables:

```text
GEOMACRO_FLASH_INGEST_URL
GEOMACRO_FLASH_CORROBORATE_URL
GEOMACRO_FLASH_INGEST_TOKEN
```

Required when Telegram is enabled:

```text
TELEGRAM_API_ID
TELEGRAM_API_HASH
TELEGRAM_SESSION
TELEGRAM_CHANNELS
```

Default timing:

```text
Telegram: event-driven / immediate
RSS polling: ~45 seconds plus small jitter
Corroboration: ~15 seconds plus small jitter
```

RSS can run without Telegram by setting:

```text
TELEGRAM_ENABLED=false
```

## Run locally

From this directory:

```bash
python -m pip install -r requirements.txt
python supervisor.py
```

## Run with Docker

```bash
docker build -t geomacro-breaking-flash .
docker run --rm --env-file .env geomacro-breaking-flash
```

For production, use a long-lived container/service with restart-on-failure and a real secret manager. Do not use GitHub cron as the primary sub-minute listener because Telegram requires a persistent MTProto session and scheduled workflows are not a real-time transport.

## Storage and rights boundary

Fast source content is an internal evidence layer, not the customer product.

- Keep provenance and source URLs.
- Avoid copying full publisher articles into Geomacro.
- RSS adapters store title/link/time and small feed metadata, not article bodies.
- Telegram text is stored internally for event matching and audit evidence; do not redistribute it as publisher content unless rights are cleared.
- Commercial output should remain Geomacro-derived country risk intelligence, attribution, confidence, Risk Objects and Risk Gate decisions.

## Operational target

The pipeline is designed for:

```text
lead arrival -> intake: seconds
RSS discovery -> intake: usually under one poll interval
new flash -> first corroboration pass: roughly 15 seconds
```

The actual time from a real-world event to source publication is controlled by the external source and cannot be guaranteed by Geomacro. The architecture minimizes Geomacro-side latency after a source publishes an item.
