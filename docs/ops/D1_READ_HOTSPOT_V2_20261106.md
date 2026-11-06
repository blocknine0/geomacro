# GeoMacro D1 read hotspot v2 — deploy and measure

**Scope:** three-category Hot 50 public-derived journal, protected private-OSINT keyset
reads, and optional previously verified signed-GRO lookup. PREDGE authenticated
decisions, ledger, idempotency, authorization, signed risk scores, reviewer
certificates and original canonical evidence are NOT publicly cached.

## Before deployment

On 2026-10-26 (UTC), Free-account D1 read consumption was 5,137,446 and
write consumption 43,122. The 2026-10-27 rolling Query Insights sample named
2,925,330 website journal reads and 1,629,996 private OSINT journal reads.
These figures come from **different time windows**: do not claim they add up
to 88% of the October 26 day, or extrapolate them as current usage.

Existing 0029 and 0032 already implemented category keyset pagination and
bounded/cardinality-based ring eviction. Existing 0033 introduced revision
fences and materialized public pages. v2 REUSES those; it does not add a new
parallel canonical data source or ingest private OSINT into a public cache.

## Deliverables

- `migrations/0203_d1_read_hotspot_optimization.sql`: single-row CQRS table,
  country/category/time keyset index, source-check covering metadata index, and
  bounded journal refresh order index.
- `src/cache-middleware.mjs`: explicit Cache API soft/hard expiry and manual
  stale-while-revalidate; strict anonymous route allowlist; optional tags,
  no caching of 401/429/503, Set-Cookie, authenticated requests or ledger.
- `src/hot50-materialized-news.mjs`: ten-minute cron refresh via existing
  0033 revision-fenced pages; quiet ticks reuse their current revision;
  changed journal triggers bounded refresh; public read uses one PK lookup:
  `SELECT payload,updated_at FROM materialized_cache WHERE key=? LIMIT 1`.
- `src/website-derived-intelligence.mjs`: when enabled, eligible public
  website pages and public full bundle project from the one-row snapshot,
  rechecking original native publication/72h filtering; missing/stale snapshot
  returns 503 rather than silently rescanning all rows on every cache miss.
- `src/private-osint-bundle.mjs`: explicit `INDEXED BY` for country and
  category ordered keyset reads; old category index retained until migration
  and runtime activation. Private projected JSON is NOT put in an index.
- `src/signed-gro-read-cache.mjs`: opt-in <=5-second isolate memory + optional
  private Workers KV backed previously verified GRO rows; Ed25519, trust pin,
  expiry and commercial eligibility reverified on every hit. Request ledger,
  progressive facts, flash override, reviewer certification, and execution
  authorization remain authoritative D1 reads. KV is **eventually consistent**,
  never a source of truth or a way to bypass account quotas.

## Activation order

1. Preserve the authoritative database, current Worker SHA, and audit receipts.
   Use a matching known-working Wrangler runtime configuration with
   `DB` binding, `migrations_dir=migrations`, and account credentials.
   Do not commit or print tokens, signed object bodies, or private SQL data.
2. **Local D1**: `cd workers/control-plane`; run
   `npx wrangler d1 migrations apply geomacro-control-plane --local`.
   Run `node --test ../../scripts/tests/d1-read-hotspot-v2.test.mjs`.
3. **Remote migration only when quota/admission permits:**
   `npx wrangler d1 migrations apply geomacro-control-plane --remote`.
   Use a fresh DB backup; verify that both private-OSINT indexes exist before
   setting `GEOMACRO_D1_READ_HOTSPOT_V2=1`.
4. Deploy the exact reviewed main commit through the existing protected
   `Deploy D1 Control Plane` workflow. A green GitHub CI without a matching
   production Worker SHA is not a successful deployment. Keep the feature flag
   at `0` until the schema and revision-fenced publisher ACK are observed.
5. Enable `GEOMACRO_D1_READ_HOTSPOT_V2=1` in the **actual Worker
   configuration**; first allow the 10-minute producer to publish and prove the
   single-row snapshot. Optionally set `GEOMACRO_D1_READ_METRICS_SAMPLE=1` to
   log the real D1 `meta.rows_read` and `meta.rows_written` for each public
   PK lookup, without payloads or private query arguments. Confirm HTTP 200
   for every three-domain public category and canonical journal parity.
   For public routes, no-cache/Authorization headers bypass shared edge response
   caching but may still read the one-row public projection; the separately
   owner-authenticated INTERNAL readback remains genuinely canonical D1.
6. The optional `GEOMACRO_PREDGE_SIGNED_GRO_READ_CACHE=1` and private KV
   binding `SIGNED_GRO_CACHE_KV` must be separately authorized: the former
   accepts a <=5s revocation-observation window, while KV remains
   eventually consistent. Do not enable if instant risk revocation is
   required, or if the KV usage budget is unapproved.
7. Compare equal-length Cloudflare UTC account-wide windows, database-specific
   Query Insights and exact live `meta.rows_read`/writes/read latency. Require
   repeated 24h readings **below 200,000 rows read account-wide** before
   claiming the goal achieved. The limit cannot be guaranteed by code when
   other Workers, POP misses, unrelated queries and provider metrics remain
   outside the same governor.

## CLI checks (real Cloudflare account, not synthetic data)

```bash
cd workers/control-plane
# All D1 databases in the account (rolling 1d, NOT a UTC calendar-day quota)
npx wrangler d1 insights --time-period=1d --sort-type=sum --sort-by=reads --limit=100 --json

# Control-plane top read queries (experimental CLI)
npx wrangler d1 insights geomacro-control-plane --time-period=1d --sort-by=reads --sort-type=sum --limit=50 --json

# Confirm query planner chooses the PK, not a full SCAN
npx wrangler d1 execute geomacro-control-plane --remote --command="EXPLAIN QUERY PLAN SELECT payload,updated_at FROM materialized_cache WHERE key='public_derived_news_hot50' LIMIT 1;"

# Verify index for category and ISO3 keyset
npx wrangler d1 execute geomacro-control-plane --remote --command="EXPLAIN QUERY PLAN SELECT item_id,native_feed_published_at FROM private_osint_news_25h INDEXED BY idx_private_osint_country_category_clock_v2 WHERE country_iso3='IND' AND category='macro' AND native_feed_published_at>='2026-11-05T00:00:00.000Z' ORDER BY native_feed_published_at DESC,item_id DESC LIMIT 101;"

# Generic (all-country) category keyset: existing index
npx wrangler d1 execute geomacro-control-plane --remote --command="EXPLAIN QUERY PLAN SELECT item_id,native_feed_published_at FROM private_osint_news_25h INDEXED BY idx_private_osint_category_clock WHERE category='geopolitics' AND native_feed_published_at>='2026-11-05T00:00:00.000Z' ORDER BY native_feed_published_at DESC,item_id DESC LIMIT 101;"

# Strict billed rows-read proof requires a real Worker result.meta.rows_read
# or provider GraphQL; EXPLAIN alone CANNOT guarantee exactly one billed read.
```

The expected plans are `SEARCH materialized_cache USING INDEX ...`
(or `USING PRIMARY KEY`), and `SEARCH private_osint_news_25h USING
[covering] INDEX ...`, not `SCAN private_osint_news_25h` / `USE TEMP
B-TREE FOR ORDER BY`. A selected `projection_json` forces a separate
payload table-row lookup; large JSON should NOT be included in a covering
index solely to claim a covering scan. The 101-row page is not a 1-row read.

## Rollback and controls

Set `GEOMACRO_D1_READ_HOTSPOT_V2=0` and redeploy previous behavior.
Leave additive indexes and disposable materialized row intact until reviewed
cleanup. Do NOT disable signer verification, Predge usage or quota ledgers,
readback receipts, 3-hour signed object expiry, or fall back to fabricated
Risk Indices. A 503 from a cold materialization must be visible, not returned
as an empty/healthy source feed.

Provider details: Cloudflare Cache API does **not** automatically honor
stale-while-revalidate on `put/match`; Cache API is POP-local. Workers KV is
eventually consistent. D1 counts **scanned** rows including index reads, not
only the returned rows. Verify with current official documentation and
production counters before reducing shared quotas.
