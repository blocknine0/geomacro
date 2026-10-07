# Geomacro permanent near-zero runtime

Status: migration target approved for implementation on 2026-10-03.

## Goal

Geomacro must run commercially without depending on a recurring database bill before revenue exists, while avoiding another provider migration when revenue starts.

The target is:

- fixed monthly infrastructure cost: `0 USD` while the Cloudflare/B2 free allowances are sufficient;
- first paid step: normally the same Cloudflare account upgraded to Workers Paid, not a database/provider migration;
- bulk data never placed in D1;
- public customer serving never depends on Supabase;
- every destructive retirement step remains fail-closed and happens only after verified parity.

## Permanent data plane

```text
Customers / agents / partners
        |
        v
Cloudflare Workers
        |
        +--> existing Durable Object commerce ledger
        |      x402 replay protection, idempotency, spend/rate state
        |
        +--> D1 hot control plane
        |      source/readiness state
        |      country-domain readiness matrix
        |      GRO index only
        |      pipeline checkpoints
        |      compact operational control metadata
        |
        +--> Backblaze B2 durable intelligence plane
               raw/history/evidence
               signed GRO bodies
               verified archives/fragments
               public continuity packages
```

Backblaze B2 remains durable truth. After a successful B2 write plus full readback/hash/exact-restore verification, the publisher may copy a bounded derived public projection into D1 for hot serving. The D1 row carries the B2 key/hash, its own payload hash, proof contract, actual source-as-of time and a fixed source-native expiry; edge readers recheck the hash and expiry and fail closed when invalid or stale. D1 does not become a second truth. The existing Durable Object commerce ledger remains authoritative for payment replay/idempotency.

## What D1 MUST NOT contain

D1 is not an archive. The following remain in B2:

- raw source payloads;
- full evidence payloads;
- full signed GRO JSON bodies;
- historical observation bodies;
- archive fragments/bundles;
- large logs;
- duplicate durable copies of B2 payloads.

The only serving-copy exception is a bounded, already-public derived projection (Intelligence, Global Risk or Risk Indices) whose exact payload hash is tied to a successfully readback-verified B2 object. It expires at its source-native deadline and is not used as archival truth. D1 may also contain hashes, B2 object keys, compact counters/statuses, timestamps and small metadata needed to operate the system.

## Why this can stay cheap

As of 2026-10-03, Cloudflare D1 uses scale-to-zero billing: there is no hourly database compute charge. Workers Free includes D1 with daily read/write allowances and 5 GB total D1 storage. Workers Paid currently has a 5 USD/month minimum account charge and includes very large monthly D1 read/write allocations before usage overages.

Official references:

- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/durable-objects/platform/pricing/

Backblaze B2 currently keeps the first 10 GB of storage free and remains the durable bulk-data layer:

- https://www.backblaze.com/cloud-storage/pricing

Pricing can change. Operational acceptance must use current provider pricing/limits, not hard-coded business assumptions.

## Migration safety contract

1. Do not delete or disable the current Supabase project during migration.
2. Public serving remains B2-authoritative throughout migration.
3. Create D1 and apply the committed schema.
4. Backfill only the bounded hot/control datasets.
5. Compare source counts, row/key checksums and critical readiness invariants.
6. Enable shadow writes to D1 while legacy Supabase writes still exist where unavoidable.
7. Verify D1 reads without using them for customer decisions.
8. Move control-plane readers/writers to D1 in bounded groups.
9. Keep Supabase in cold/read-only standby until all required production gates pass.
10. Retire Supabase traffic only after no required runtime or recovery path depends on it.
11. Never delete `storage.objects` through SQL.
12. Never delete an unverified B2/Supabase payload during migration.

## D1 control-plane datasets

### `source_state`
Compact current certification/rights/endpoint/schema/freshness/provenance/independence/runtime/fallback state for a source.

### `country_domain_state`
The current country x domain readiness matrix. No evidence bodies are stored here.

### `risk_object_index`
Signed GRO discovery/index metadata only. Full GRO remains in B2. The index stores hashes and archive location so the durable object can be fetched and re-verified.

### `pipeline_checkpoint`
Small freshness/ingestion/archive cursors and timestamps.

### `control_state`
Versioned small operational configuration/state only.

### `public_b2_hot_snapshot`
One replaceable bounded public projection per Intelligence, Global Risk and Risk Indices. The writer requires the matching B2 object key, compressed-object SHA, full readback and exact gzip-restore proof, plus an exact SHA of the serving JSON. Reads enforce the source timestamp and expiry (6 hours for the GDELT-backed Intelligence snapshot; 90 minutes for Global Risk and Risk Indices). An absent, tampered or expired projection is unavailable; it never authorizes fallback to Supabase or synthetic data.

### `migration_cursor`
Parity/checksum evidence for each migrated dataset.

## Commerce state

Do not move the existing commerce ledger into D1. It already uses a SQLite-backed Durable Object and implements transactional claim/prepare/complete/replay protection. Keeping it separate reduces D1 contention and isolates payment-critical state from intelligence-control state.

## Cost-control rules

- B2 is the only bulk durable store; D1 hot projections remain bounded and replaceable.
- D1 queries must be indexed and bounded.
- No unbounded history scans from customer requests.
- Public reads should prefer B2 continuity packages/cache instead of D1 row fan-out.
- Scheduled jobs checkpoint once per bounded batch, not once per row when unnecessary.
- Keep commerce coordination in Durable Objects.
- Do not introduce an always-on VM or always-on Postgres database before workload/revenue requires it.
- Upgrade the existing Cloudflare plan before adding a second database provider solely for quota.

## Locked zero-cost operating profile — 2026-10-07

The owner approved the zero-cost operating architecture for the controlled commercial launch. This section is normative until replaced by a later reviewed plan.

The production goal is not to consume provider free ceilings. Geomacro must stay well below them and degrade nonessential work before customer-facing serving or integrity work is affected.

### B2 transaction policy

The active non-paying B2 account demonstrated that Class-B transaction count, rather than bandwidth, is the immediate bottleneck. A sample day reached 2,895 Class-B transactions while transferring only about 73 MB. Therefore:

- every B2 client has a conservative hard request budget even when a workflow forgets to provide one;
- explicit workflow budgets remain smaller than the provider ceiling and are not permission to consume the whole daily account allowance;
- native authenticated read fallback consumes the same local budget as S3 reads;
- once a credential proves that S3 reads return AccessDenied and native authenticated download succeeds, that client must reuse the native read path instead of repeating the failed S3 read for every object;
- concurrent reads of the same object are single-flight;
- hard provider caps remain fail-closed and are cached for the process;
- immutable archival data should be bundled and content-addressed so one verified readback covers many members;
- D1 stores compact hashes, pointers and verification state only; it never stores full raw/evidence/GRO payloads;
- destructive cleanup still requires independently verified bytes and hashes. Quota reduction must never weaken deletion safety.

The default per-process B2 request budget is intentionally conservative. Workflows that need a larger bounded batch must set an explicit reviewed budget. The design target for normal steady-state B2 reads is below 100 per day and preferably below 25 per day; the provider hard ceiling is not an operating target.

### Hot-object evolution

The launch architecture must not require a new paid account or billing action. If the existing Cloudflare account can later provision R2 inside the zero-spend policy, an R2 hot-object/cache adapter may be added behind the same object-store interface and proven in shadow mode first. Until that acceptance passes, B2 remains the durable object authority and production must stay within the bounded-read design above.

No R2 activation, paid plan activation, partner allowance spend, x402 settlement, or user-fund movement is authorized by this operating plan.

## Revenue-stage upgrade

The intended first paid infrastructure step is an in-place Cloudflare Workers plan upgrade. D1, Workers and Durable Objects stay in the same architecture. B2 stays as object storage unless a later measured workload proves a different store is economically better.

No provider migration should be required simply because Geomacro starts earning revenue.
