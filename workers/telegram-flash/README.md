# Geomacro Breaking Flash Worker

This service is Geomacro's low-latency lead-intelligence layer for geopolitical, macroeconomic, critical-minerals and physical-hazard events.

The production design separates **speed**, **rights**, and **truth**:

1. rights-governed machine feeds are ingested as fast leads;
2. every new lead starts as `UNVERIFIED` unless a separate governed contract says otherwise;
3. raw publisher/source bodies are not customer-facing;
4. independent corroboration is required before verification;
5. fast ingestion never grants GRI/Risk Gate eligibility by itself;
6. paid output remains Geomacro-derived structured intelligence only.

## Production source architecture

```text
Official / governed RSS + ATOM ------------------\
USGS / GDELT / ReliefWeb / other source mesh -----+--> live-flash-ingest
NWS active alerts (60-second poll) ---------------/         |
                                                            v
                                                    live_flash_events
                                                            |
                                                            v
                                              live-flash-corroborate
                                                            |
                                              evidence + event families
                                                            |
                                     UNVERIFIED -> CORROBORATING -> VERIFIED
                                                            |
                                                            v
                                               structured intelligence
                                                            |
                                                      GRO / Risk Gate
```

## Telegram production boundary

Public Telegram channel scraping, harvesting, indexing and aggregation are **disabled in production**.

- `production_entrypoint.py` forces `TELEGRAM_ENABLED=false`.
- `global_discovery.py` is a policy no-op and never executes public-channel search.
- the legacy `telegram_mtproto_flash` source is blocked by the isolated signal migration;
- Telegram-origin intelligence may enter only through the separately governed `telegram_authorized_publisher_feed` push/bot/webhook path;
- each authorized publisher/channel must have explicit, active, revocable authorization recorded for the exact content scope;
- raw Telegram content is never delivered to customers.

Do not configure `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` or `TELEGRAM_SESSION` for production use.

## Active breaking-data lanes

The worker and wider Geomacro source mesh use a combination of:

### Geopolitics
- GDELT V2 / structured-event pipeline
- UN documents, Security Council and UN Geneva feeds
- Council of the EU releases
- rights-governed media feeds for internal discovery/corroboration only
- maritime/security and sanctions source mesh managed by the main source registry

### Macro
- Federal Reserve releases
- ECB releases and market-information feeds
- BIS releases and central-banker speeches
- ForexLive as internal discovery/corroboration only
- World Bank / IMF / Eurostat / EIA and other governed structured sources outside this container

### Critical minerals
- USGS Minerals releases and MCS data
- Natural Resources Canada releases
- wider Geomacro critical-minerals source universe and official national sources

### Physical hazards / breaking disruption
- USGS Earthquake Hazards global feeds
- NASA FIRMS near-real-time fire detections
- GDACS / ReliefWeb under their source-rights boundaries
- NWS active-alert ATOM feed for U.S. watches, warnings and advisories

## NWS active-alert lane

`nws_alerts_loop.py` polls:

```text
https://api.weather.gov/alerts/active.atom
```

Default cadence:

```text
60 seconds
```

The poller sends only normalized lead metadata to `live-flash-ingest`:

- stable source record id
- headline
- timestamp
- source URL
- source reliability metadata

It explicitly sends `body=null` and `raw_payload=null`. NWS alerts therefore participate in the same independent corroboration path as other leads.

## Source registry and rights

The isolated signal database has its own `live_external_sources` registry. A source must exist there and have `enabled_for_ingestion=true`; otherwise `live-flash-ingest` returns `403 source_not_allowed`.

Media and aggregator feeds are internal lead/corroboration sources only unless a separate rights review promotes them. Registry presence never grants commercial delivery rights.

## Isolated Supabase migrations

The isolated signal project has historical remote migration versions through `951`. To avoid version collision, Geomacro's signal-only migrations use the collision-free track:

- `980_telegram_signal_ingest_isolation.sql`
- `981_telegram_signal_compact_storage.sql`
- `982_realtime_flash_event_lifecycle.sql`
- `983_event_family_version_ledger.sql`
- `984_telegram_authorized_publisher_only.sql`
- `985_breaking_feed_registry_parity.sql`

The deployment workflow builds a temporary migration workdir containing only:

- authoritative migration files `<=951` for remote-history reconciliation; and
- isolated signal migrations `980+`.

Authoritative migrations `952+` are never eligible for application to the isolated signal project. The workflow never uses destructive `supabase migration repair` shortcuts.

## Supabase functions

The isolated project deploys:

- `live-flash-ingest`
- `live-flash-corroborate`
- `live-flash-archive`

Protected endpoints use:

```text
FLASH_INGEST_TOKEN
```

Never expose that token in browser/frontend code.

## Runtime

Required core variables are documented in `.env.example`.

Default timing:

```text
RSS/ATOM discovery: ~45-60 seconds
NWS active alerts: 60 seconds
corroboration: ~15 seconds
archive cycle: ~120 seconds
```

Run locally:

```bash
python -m pip install -r requirements.txt
python supervisor.py
```

Run with Docker:

```bash
docker build -t geomacro-breaking-flash .
docker run --rm --env-file .env geomacro-breaking-flash
```

Use a long-lived service with restart-on-failure and a real secret manager for production.

## Storage and delivery boundary

- raw article bodies are not stored by the signal-mode ingest path;
- raw payloads are not stored by the signal-mode ingest path;
- provenance, hashes and source URLs are retained for audit/corroboration;
- compressed private evidence is isolated from customer delivery;
- customer-facing output remains derived structured intelligence, confidence, provenance metadata, Risk Objects and Risk Gate state;
- `execution_authorized=false` remains an independent product safety boundary.

## Operational target

Geomacro minimizes platform-side latency after a source publishes an event. External publication latency cannot be guaranteed.

Target internal behavior:

```text
machine-feed publication -> intake: within one poll interval
new flash -> first corroboration pass: roughly 15 seconds
```
