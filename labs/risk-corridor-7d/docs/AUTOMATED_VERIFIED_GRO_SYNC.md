# Automated verified GRO → isolated 7-day Supabase buffer

## Source and scope

Source: existing GeoMacro signed **country GRO** in private Backblaze B2 at `geomacro-evidence/v1/live/country-gro/{ISO3}/latest.json.gz`, authenticated with a **new, bucket/prefix-restricted READ-ONLY** application key. This is **not** a replacement for the original GeoMacro ingestion/verification pipeline. A separate source-provenance project tag, fixed B2 endpoint and bucket and the current GeoMacro GRO-1.1 contract are checked. The original publisher articles and GRO evidence bodies NEVER go into new Supabase.

Verification occurs BEFORE Supabase writes: require matching country/issuer, signed canonical SHA-256 payload, Ed25519 signature with pinned public trust registry and matching fingerprint/status, current expiry and VERIFIED commercial rights/status, meaningful independent sources, and a signed attribution driver carrying positive evidence count. If no signed GRO/rights/driver exists, **write zero rows**. An unknown mineral country does not become a fake news item.

This creates a **derived GRO-driver risk signal**, not a genuine new news article, event-level intelligence or independently modeled bilateral route score. Only these signed attribution drivers produce category signals: conflict/sanctions/political instability/trade policy/shipping → Geopolitics; monetary policy/inflation/labor/FX/macro stress → Macro/FX; critical minerals/rare-earth supply → Critical Minerals. Stored `event_sha256` is a deterministic GRO driver observation fingerprint (NOT a publisher event ID), `original_at` is GRO generation time (NOT publisher original article time). `intensity` is the signed GRO driver contribution, NOT category-specific calibrated risk index. Do not re-label or market these as independently verified events.

## Deployment safety

Source-controlled Worker: `geomacro-rc-staging`, `labs/risk-corridor-7d/wrangler.jsonc`, D1 binding **only** `RC_STAGING_D1` → `geomacro-risk-corridor-staging` (`9f9c3a23-d299-4af1-9c4f-db9cc4bcb2f9`). This is a separate staging Worker, NOT GeoMacro's production control-plane Worker. All code commits are isolated to `feature/isolated-supabase-risk-corridor-7d`.

`RC_SYNC_ENABLED=0` is the default, so a newly deployed Worker does **nothing** on its 15-minute cron until the owner explicitly enables staging sync. Public HTTP API only serves read-only `/_health`, and every other route fails 503; **no paid Risk Gate**, direct user ingest, PREDGE, payment, settlement or execution route is active.

Run the isolated D1 migration `sql/005_d1_sync_runs_console_safe.sql` **only on the NEW staging D1**. That creates `gm_rc_sync_runs` and its index, storing scheduled slot, counts and code-only failure state. It is distinct from the already installed five customer/ledger staging tables. This database does NOT hold raw GRO/news articles.

## One-time protected configuration

In the `geomacro-rc-staging` Worker **only**, add the following as **Secret** bindings in Cloudflare dashboard or authenticated Wrangler secret CLI. Never paste actual keys into this issue, chat, GitHub, files, or screenshots:

- `RC_SUPABASE_SERVICE_KEY`: use a NEW secret API key (`sb_secret_...`) belonging ONLY to new Supabase `ymjuwuvbialsevfawvvq`, for service-only PostgREST insert. Find it under this project's Settings > API Keys (create a dedicated one for this Worker where supported). `RC_SUPABASE_URL` is already pinned in config to `https://ymjuwuvbialsevfawvvq.supabase.co`. Supabase new secret keys are opaque, NOT JWTs: the client sends them in `apikey` header only, never in `Authorization: Bearer`.
- `RC_B2_READ_KEY_ID`: newly generated **read-only** B2 application key ID. Restrict key to `geomacro-private-archive` and at most `geomacro-evidence/v1/live/country-gro/` prefix. Do not reuse B2 write/admin keys.
- `RC_B2_READ_APPLICATION_KEY`: the matching newly generated **read-only** B2 application key SECRET. Store only in the protected staging Worker Secrets, never in source.
- No GeoMacro main `GEOMACRO_COMMERCE_LEDGER_TOKEN`, no production D1 write credential, no PREDGE tokens.

A separate protected staging deployment is required (authorized account with permission to deploy **only** this Worker). Use Wrangler with `labs/risk-corridor-7d/wrangler.jsonc` from the repository and verify `/_health` on that Worker; do not target any other Worker. A successful source-code commit, schedule or schema table check does NOT imply deployed/connected syncing.

Once D1 migration, source key scope, fingerprint verification and no-funds runtime checks pass, the owner may separately enable staging sync via **plain env var** `RC_SYNC_ENABLED=1` on this Worker only (and deploy/verify). The Worker already has cron trigger `*/15 * * * *` in its isolated Wrangler config.

## Cadence, limits, and self-healing

- 195 sovereign/observer ISO3 countries from GeoMacro canonical 195 registry; 20 countries per 15-minute slot, 10 slots per sweep = **150 minutes per nominal sweep**. NOT each country every 15 minutes, and NOT 585 guaranteed updated cells.
- One D1 atomic slot claim per 15-minute window prevents duplicate scheduled executions from duplicating a run. Supabase has deterministic unique row keys and upsert.
- On missing GRO (404), expired/signed-unqualified GRO or absent category driver: no fake data; counts increase as `no_proof`.
- On transient network/write failures: counts and failure state are recorded in D1, and country will be re-attempted on its next 150-minute sweep. Failures are not classified as proof-free; no money charges or verification bypass.
- B2 2 MB compressed / 4 MB decompressed bounds, 6-second read timeout, 5-second pinned registry timeout and 12-second Supabase write timeout. No giant raw payloads stored.
- New Supabase hourly `pg_cron` removes rows older than 7 days, with read-side cutoff in the buffer client. Free-tier service pauses may delay physical deletion. Manual purge callable and cron active were previously owner-confirmed; **scheduled execution history and actual expired-row deletion still pending**.
- If the pinned trust registry changes/revokes/rotates keys, reads fail closed until the explicitly approved trust pin is updated. Do NOT turn off pinning to restore volume.

## Required acceptance before enabling

- [ ] Owner applies `sql/005_d1_sync_runs_console_safe.sql` in NEW staging D1 and checks table readback.
- [ ] Owner supplies restricted B2 read-only application key to staging Worker Secrets.
- [ ] Owner supplies new Supabase private key to staging Worker Secrets (not via ChatGPT).
- [ ] Staging-only Worker package deployed from feature branch; `/_health` confirms D1; no main deploy.
- [ ] Validate B2 404, expired GRO, corrupt signature, revoked/mismatched public registry and Supabase outage with zero payable output; no writes from fake data.
- [ ] Run no-funds staging sync after explicit enablement and read back genuine derived rows from new Supabase.
- [ ] Verify D1 sync slot states, duplicate avoidance, error recoverability, 7-day expiry function and successful real scheduled pg_cron invocation.
- [ ] Owner approves wider staging adoption only after source/rights correctness; separate production rollout, pricing and partner change decisions later.

Issue tracker: https://github.com/blocknine0/geomacro/issues/3339
