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

The existing B2 public-serving path remains authoritative. The existing Durable Object commerce ledger remains authoritative for payment replay/idempotency. D1 fills the remaining role currently held by Supabase hot/control tables.

## What D1 MUST NOT contain

D1 is not an archive. The following remain in B2:

- raw source payloads;
- full evidence payloads;
- full signed GRO JSON bodies;
- historical observation bodies;
- archive fragments/bundles;
- large logs;
- duplicate durable copies of B2 payloads.

D1 may contain hashes, B2 object keys, compact counters/statuses, timestamps and small metadata needed to operate the system.

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

## D1 v1 datasets

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

### `migration_cursor`
Parity/checksum evidence for each migrated dataset.

## Commerce state

Do not move the existing commerce ledger into D1. It already uses a SQLite-backed Durable Object and implements transactional claim/prepare/complete/replay protection. Keeping it separate reduces D1 contention and isolates payment-critical state from intelligence-control state.

## Cost-control rules

- B2 is the only bulk durable store.
- D1 queries must be indexed and bounded.
- No unbounded history scans from customer requests.
- Public reads should prefer B2 continuity packages/cache instead of D1 row fan-out.
- Scheduled jobs checkpoint once per bounded batch, not once per row when unnecessary.
- Keep commerce coordination in Durable Objects.
- Do not introduce an always-on VM or always-on Postgres database before workload/revenue requires it.
- Upgrade the existing Cloudflare plan before adding a second database provider solely for quota.

## Revenue-stage upgrade

The intended first paid infrastructure step is an in-place Cloudflare Workers plan upgrade. D1, Workers and Durable Objects stay in the same architecture. B2 stays as object storage unless a later measured workload proves a different store is economically better.

No provider migration should be required simply because Geomacro starts earning revenue.
