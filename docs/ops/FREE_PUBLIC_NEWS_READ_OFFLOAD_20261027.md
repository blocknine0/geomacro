# Zero-new-provider D1/B2 read-offload: public derived news

## Canonical stores unchanged

- Cloudflare D1 remains the authoritative, readback-verified 72h derived journal
  and restricted private queue/checkpoint store. Backblaze B2 remains the
  authoritative immutable evidence/archive storage. Neither is deleted,
  replaced, reclassified, or double-written by this change.
- Public Website Intelligence exact base / 250 / 500 pages, public
  source-neutral machine `derived-structural-72h` all + three exact domain
  projections, the original public source JSON and 3-domain continuity use
  existing Worker Cache API for 45 seconds per POP plus single-flight per
  isolate. No KV, R2, Turso, Telegram or other new accounts are required.
- All public cache keys are allowlisted canonical URLs only; cache excludes
  auth, cookie, API key, range, explicit no-cache, private, partner Predge,
  signed or paid routes. Non-200 responses never cache. Cache outages read the
  real D1 origin and propagate real failures, **never** invent news.
- `generated_at`, `checked_at`, publisher-native timestamps and qualification
  status retain their actual meanings; cache TTL is not a source-freshness SLA.
  Caching may add up to 45s of per-POP public visibility lag.
- Protected production readback uses authorization or `Cache-Control: no-cache`
  so it continues to validate actual D1 readback, not a cached success.

## Quota economics and rollout

This patch can eliminate repeat **read queries** for hot anonymous endpoints
within a POP/TTL, including the previously uncached ~250-750-row machine feed
and later news pages. Per-POP misses, high-cardinality client geography, D1
ingestion scans, producer SQL, other Workers, and authenticated readers still
consume the same shared free D1 quota. Provider free quota is **not guaranteed**
by this patch. The existing paced account-wide critical/research/maintenance
D1 guard and atomic B2 operation reservation remain required.

After protected main merges, inspect `Deploy D1 Control Plane` (deployment
must actually finish, not merely run offline tests). Compare pre/post Cloudflare
Query Insights top costly query fingerprints and account-wide D1 rows read per
UTC day. Test twice in the same POP using public anonymous requests to
`/v1/public/derived-structural-72h`, then separately test with a no-cache
header to force genuine D1 readback; all return the same public qualified IDs
within the expected source-clock and cache window. Assess 503 quota holds
rather than misclassifying them as genuine empty feed.

## Optional second-stage services (not installed)

R2 or Turso are potential offload components **only** if their accounts,
credentials, explicit budget caps, read/write limits, deployment ordering,
replay and migration parity are accepted and verified. For greater benefit,
versioned public source-neutral snapshots can be materialized *after D1
verification*, then served from a static CDN/object store without per-request
D1. KV is suitable only for public short-lived hot snapshots, **not** for
durable event ordering or atomic queue acknowledgements. B2 original records
and D1 canonical truth cannot silently migrate.

No new provider integrations, R2 namespace, extra billable service or live
deployment are claimed by this patch.
