# GeoMacro Storage Directory and O(1) Operational Read Model

## Inventory (repository expectations, **NOT** physical provider census)

| Logical store | Provider | Symbolic location | Role |
|---|---|---|---|
| Canonical control metadata | Cloudflare D1 | `DB` → `geomacro-control-plane` | Native-source metadata, checkpoints, provenance, indexes |
| Durable originals | Backblaze B2 | `B2_SPOOL_BUCKET` (configured `geomacro-private-archive`) | Authoritative immutable encrypted archive |
| Private fallback | Cloudflare R2 | `P0B_PRIVATE_FALLBACK_R2` | Temporary encrypted custody awaiting B2 proof |
| Public derived news | Cloudflare R2 | `PUBLIC_NEWS_R2` | Disposable source-neutral public projection |
| Risk Gate supplemental | Supabase Postgres | `RISK_GATE_SUPABASE_URL` | Separate private seven-day rollup, **not** signed verdict |
| Commercial ledger | Cloudflare Durable Object | Ledger binding (provider verification pending) | Payments/idempotency, **NEVER cached** |
| Ingestion transport | Cloudflare Queues | `INGEST_QUEUE` | Queue only, not database |
| Source polling transport | Cloudflare Queues | `SOURCE_POLL_QUEUE` | Queue only, not database |

This is a code-derived logical map. It cannot discover every D1 database in the Cloudflare account or assert which optional buckets exist. Cloudflare D1 `d1 list --json`, Worker version resources, B2 bucket listing, R2 inventories and actual Supabase project records must provide separate provider-backed inventory receipts.

## Read path

- Staged `geomacro_storage_locator_v1`: one PK lookup maps a logical dataset to a symbolic verified provider binding. Seed rows are `EXPECTED_NOT_VERIFIED` until independently confirmed.
- Staged `geomacro_operational_read_model_v1`: one PK lookup for small operational summaries. An already verified producer atomically publishes a snapshot after a canonical revision event. Consumer supplies a trusted 64-hex revision; missing, expired, mismatched or unverified data returns null, **never a synthetic PASS**. The caller may skip nonessential UI health, but protected gates do not replace their canonical proof with a cache.
- Existing `materialized_cache` from 0204 handles **public** Hot50 CQRS; existing `p0b_committed_day_totals` from 0211 handles the repeated committed count with write-side triggers. These are the immediate 3.38M rolling-read hotspot fixes once live Worker and migrations are physically verified.
- Cache does not prove provider B2 GET/hash, queue ACK, original rights, GRO signatures, reviewer certificates, revocation, customer/partner authorization or financial receipts.

## Deployment sequence (no funds)

1. **First:** existing protected migration 0204/0211 must pass its genuine UTC-day 140k read/write policy, 80k reserve, backup, bounded original-row probes, actual remote D1 apply and 8-object schema receipt.
2. **Then:** reviewed `docs/ops/staged-migrations/0212_storage_directory_read_model.sql` can be moved into the actual Wrangler migrations directory as a distinct approved next migration, under a **separate reviewed PR and protected provider budget check**. This file is deliberately outside the migrations directory; adding it now would block the critical 0204/0211 allowlist.
3. Require genuine provider locator discovery; attach provider verification timestamps. Do not mark symbolic rows provider-verified just because a binding string exists.
4. Wire a particular **non-financial, non-signed, non-rights** routine health consumer to `readOperationalModel` only after its authentic producer passes source-revision and currentness tests. Never add a cron that periodically rewrites an unchanged snapshot. Do not substitute unverified cached values for certified Risk Gate proof.
5. Compare equal-window Cloudflare Query Insights fingerprints and UTC-day account-wide D1 rows after an exact-main protected Worker canary; the new directory itself cannot eliminate scans until callsites switch and live deployment is proven.

**No Cloudflare provider operation or production D1 migration is performed by staging these files.**
