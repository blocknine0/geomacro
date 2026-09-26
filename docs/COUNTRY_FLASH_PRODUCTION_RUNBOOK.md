# Country Flash Intelligence Production Runbook

This runbook operates Geomacro's low-latency country-level breaking-intelligence layer without changing the core rule that fast source leads do not directly mutate GRI or Risk Gate outputs.

## Production boundary

- Fast machine-feed items are leads, not truth.
- Every new item starts `UNVERIFIED` unless a separately governed source contract proves otherwise.
- Independent evidence can move an item to `CORROBORATING` and then `VERIFIED`.
- A single source cannot self-verify.
- Raw publisher/source bodies are not a customer-facing product.
- Public Telegram channel scraping, harvesting, indexing and aggregation are disabled in production.
- Telegram-origin intelligence may enter only through an explicitly publisher-authorized push/bot/webhook submission path with active, scoped, revocable authorization.

## 1. Required deployment secrets

Authoritative country-flash deployment uses the production Supabase secrets documented by `.github/workflows/deploy-country-flash-supabase.yml`.

The dedicated isolated signal project uses these GitHub production secrets:

- `TELEGRAM_SIGNAL_SUPABASE_ACCESS_TOKEN`
- `TELEGRAM_SIGNAL_SUPABASE_PROJECT_ID`
- `TELEGRAM_SIGNAL_SUPABASE_DB_PASSWORD`
- `TELEGRAM_SIGNAL_FLASH_INGEST_TOKEN`

The expected isolated project ref is:

```text
qogpagklwbfdmrgnrhzi
```

Never expose service-role keys, DB passwords or flash-ingest tokens in browser/frontend code, issues, PRs, logs or screenshots.

## 2. Isolated signal Supabase deployment

Workflow:

```text
.github/workflows/deploy-telegram-signal-supabase.yml
```

Always run `mode=plan` before `mode=apply` after migration changes.

The isolated project historically contains authoritative migration-history versions through `951`. Geomacro therefore uses a collision-free isolated migration track:

```text
980_telegram_signal_ingest_isolation.sql
981_telegram_signal_compact_storage.sql
982_realtime_flash_event_lifecycle.sql
983_event_family_version_ledger.sql
984_telegram_authorized_publisher_only.sql
985_breaking_feed_registry_parity.sql
```

The workflow creates a temporary migration workdir containing only:

- authoritative migration files `<=951` for history reconciliation; and
- isolated signal migrations `980+`.

Authoritative migrations `952+` must never be eligible for application to the isolated signal database. Do not use destructive migration-history repair shortcuts to bypass this boundary.

### Plan

Run:

```text
mode=plan
```

Expected behavior:

1. validate isolated project target/secrets;
2. prepare the temporary migration workdir;
3. link the isolated project;
4. run `supabase db push --dry-run`;
5. show only isolated pending migrations;
6. make no database/function changes.

### Apply

Only after the plan is clean, run:

```text
mode=apply
```

The workflow applies isolated migrations, configures `FLASH_INGEST_TOKEN` and `SIGNAL_DB_MODE=true`, deploys:

- `live-flash-ingest`
- `live-flash-corroborate`
- `live-flash-archive`

and runs non-synthetic smoke checks.

## 3. Anti-pause keepalive

The isolated workflow runs an authenticated keepalive three times per day:

```text
17 1,9,17 * * *
```

It calls the isolated corroboration endpoint and fails loudly on a paused/unhealthy response. This generates legitimate authenticated activity and reduces inactivity-pause risk.

Provider-level no-pause guarantees depend on the Supabase organization/plan; code cannot override a provider-enforced Free-plan pause policy.

## 4. Breaking-data worker

Container build workflow:

```text
.github/workflows/country-flash-worker-image.yml
```

On `main`, the image is published as:

```text
ghcr.io/blocknine0/geomacro-country-flash:<git-sha>
ghcr.io/blocknine0/geomacro-country-flash:latest
```

Prefer the immutable Git SHA tag for production deployments.

The supervisor runs:

- governed RSS/ATOM intake;
- NWS active-alert poller;
- corroboration loop;
- archive loop.

## 5. Public Telegram is off

Production configuration must keep:

```text
TELEGRAM_ENABLED=false
TELEGRAM_CHANNELS=
```

Do not configure `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` or `TELEGRAM_SESSION` for production collection. The production entrypoint forces public MTProto off even if inherited environment variables are present, the scheduled RSS cycle forces it off again, and global Telegram discovery is a policy no-op.

The legacy `telegram_mtproto_flash` source is blocked in the isolated source registry.

## 6. Publisher-authorized Telegram path

Telegram may be added only when the channel/publisher explicitly authorizes Geomacro use for a defined scope.

The server-side registry must record at minimum:

- `publisher_authorized=true`
- non-empty `authorization_scope`
- non-empty internal `authorization_reference`
- `authorization_granted_at`
- optional expiration/revocation controls

`COMMERCIAL_OK` is not permitted unless those authorization conditions hold.

Raw Telegram content is never redistributed to customers. Authorized submissions remain evidence/lead material and must pass corroboration, provenance, source-rights and product-boundary checks before contributing to derived intelligence.

## 7. Real-time breaking source lanes

### Geopolitics
- GDELT V2 / GAL
- UN documents, Security Council and UN Geneva feeds
- Council of the EU releases
- governed sanctions/security/maritime source mesh
- media feeds only as internal discovery/corroboration where rights remain restricted

### Macro
- Federal Reserve releases
- ECB releases / market-information feeds
- BIS releases / central-banker speeches
- World Bank, IMF, Eurostat, EIA and other governed structured sources

### Critical minerals
- USGS Minerals / MCS
- Natural Resources Canada
- additional governed national and international critical-mineral sources

### Physical hazards and disruption
- USGS Earthquake Hazards
- NASA FIRMS
- ReliefWeb / GDACS under their rights boundaries
- NWS active alerts

## 8. NWS active-alert path

`workers/telegram-flash/nws_alerts_loop.py` polls:

```text
https://api.weather.gov/alerts/active.atom
```

Default cadence:

```text
60 seconds
```

It posts only normalized lead metadata:

- stable source record id
- headline
- timestamp
- source URL
- reliability metadata

It explicitly sends:

```text
body = null
raw_payload = null
verification_status = UNVERIFIED
```

NWS leads then use the same independent corroboration path as other flash events.

## 9. Worker runtime configuration

Core values:

```text
GEOMACRO_FLASH_INGEST_URL=https://qogpagklwbfdmrgnrhzi.supabase.co/functions/v1/live-flash-ingest
GEOMACRO_FLASH_CORROBORATE_URL=https://qogpagklwbfdmrgnrhzi.supabase.co/functions/v1/live-flash-corroborate
GEOMACRO_FLASH_INGEST_TOKEN=<secret>
FLASH_CORROBORATION_INTERVAL_SECONDS=15

TELEGRAM_ENABLED=false
TELEGRAM_CHANNELS=

BREAKING_RSS_ENABLED=true
BREAKING_RSS_POLL_SECONDS=45
BREAKING_RSS_BOOTSTRAP_MAX_ITEMS=25
NWS_ACTIVE_ALERTS_ATOM_URL=https://api.weather.gov/alerts/active.atom
NWS_ALERTS_POLL_SECONDS=60
BREAKING_FEED_USER_AGENT=Geomacro/1.0 (+https://geomacro.live; contact=contact@geomacro.live)
```

The worker does not need an authoritative Supabase service-role key.

## 10. Production activation sequence

1. Merge only after all CI/security/source-certification checks are green.
2. Run isolated Supabase deployment in `plan` mode.
3. Verify only isolated `980+` migrations are pending; authoritative `952+` must not appear.
4. Run `apply` only after a clean plan.
5. Confirm all three isolated functions deploy and smoke checks pass.
6. Confirm the worker image is published from the same main commit.
7. Deploy the immutable worker image to the long-lived runtime.
8. Confirm RSS/ATOM/NWS records enter as `UNVERIFIED` leads.
9. Confirm corroboration transitions require independent evidence.
10. Confirm no public Telegram MTProto traffic is present.
11. Confirm customer-facing outputs contain derived structured intelligence only.

## 11. Host requirements

Use a long-lived service with:

- restart-on-failure/reboot;
- encrypted secret injection;
- outbound HTTPS access;
- persistent secret-redacted logs;
- health/restart monitoring.

Public Telegram MTProto connectivity is not a production requirement.

## 12. Healthy runtime indicators

- RSS/ATOM items generally appear within configured polling intervals;
- NWS alerts are checked roughly every 60 seconds;
- corroboration runs around every 15 seconds plus runtime jitter;
- events remain `UNVERIFIED` until evidence satisfies the verifier;
- no fast lead directly authorizes GRI/Risk Gate execution;
- no raw article/Telegram payload is customer-facing.

External source publication latency cannot be guaranteed; Geomacro only controls platform-side detection and processing latency after publication.

## 13. Rollback

If production behavior is wrong:

1. stop the worker to stop new ingestion;
2. preserve redacted logs and affected event IDs;
3. redeploy the previous known-good function revision if needed;
4. deploy the previous immutable worker image SHA if needed;
5. prefer reviewed forward-fix migrations over blind database rollback after writes;
6. keep fail-closed verification and commercial-rights gates enabled throughout recovery.
