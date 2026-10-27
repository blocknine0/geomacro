# Geomacro Free D1: Maximum safe bundles with account-wide admission

**Scope:** #1827 P0-1/P0-5. No paid capacity, Supabase writes, partner/PREDGE mutation, security downgrade, claims of signed/current GROs, or redistribution decision.

## Incident and non-negotiable limits

Protected [deployment run 40410744039](https://github.com/blocknine0/geomacro/actions/runs/40410744039) reported **5,137,446 Cloudflare D1 rows read / 5,000,000 Free rows/day** and **43,122 / 100,000 rows written** on 2026-10-26 UTC; migrations failed with code 7500. Top two sanitized read-pressure fingerprints accounted for ~3.92 million reads, but no original SQL text was logged, so neither fingerprint is attributed to a specific query without additional proof.

Free quota is shared across all D1 databases on the account. Cloudflare GraphQL counters are delayed provider observations, **not atomic reservations**. Cache hit ratio is per POP. A scheduled run is not proof of data delivery. Even with these safeguards, unrelated non-admitted Workers, cache misses across many POPs or provider lag can still exhaust the shared quota.

## Priority and reserve

The common read-only `scripts/ops/plan-d1-bundled-work.mjs` calls `readCloudflareD1AccountQuota`, which reads GraphQL without a D1 SQL query or write.

| Mode | Admission while remaining strictly exceeds | Policy |
| --- | --- | --- |
| Critical | 750,000 D1 reads and 15,000 writes | Private native-date collector and factual ingestion; otherwise truthful HOLD |
| Research | 1,500,000 reads and 30,000 writes | Extra private/unverified OSINT, hourly derived news and catch-up |
| Maintenance | 2,500,000 reads and 50,000 writes | Daily governed B2/source jobs, noncritical archive |

Stale/invalid/error account metrics fail to **HELD**. A held job does not fetch upstream sources, write D1, charge, emit a fabricated empty-news event, or assert successful ingestion. Existing durable records remain untouched; a held collector creates a real coverage gap and does **not** retroactively prove a news event.

## Maximum bounded work without sacrificing readback

1. All Registered Source reusable JSON producer groups up to **40 dated factual items and 48 observed source checks** per **60,000 UTF-8-byte** protected request. Split by actual bytes; throw on single oversize, never truncate or silently drop. Worker performs one bulk `json_each` news UPSERT and one bulk source-check UPSERT; one indexed prefetch and one independent exact indexed D1 readback preserve first-seen state. TTL/cap compaction runs only for genuinely new IDs.
2. Private OSINT groups up to **20 dated news items and 32 health checks** per bounded 60,000-byte payload; independent private 3-domain readback remains mandatory. Health-only or duplicate-only polls avoid repeated expired-ring deletes.
3. Anonymous *public free* `/v1/public/reusable-source-news` gets 45-second per-POP cache for exact no-query/default and three canonical `domain` queries only; in-isolate single-flight coalesces simultaneous misses. Publisher's authenticated internal readback bypasses cache. Arbitrary country, offset, authenticated/private/signed/paid and HTTP 503/429 are never cached.
4. Existing B2 D1 atomic per-operation reservation remains the only B2 shared quota authorization; these D1 GraphQL guards do not replace it.

## Acceptance still required after merge

- Observe exact approved main and deployed D1 Worker SHA, genuine production migration result and bounded authenticated private news write plus **independent D1 readback** after UTC reset.
- Prove several successful scheduled cycles with real source-native timestamps and 3-domain persisted counts; report genuine empty/denied/held lanes separately.
- Observe account-wide provider metrics and Query Insights after the change: compare 24h rows read/write, most costly fingerprints, per-workflow work bundles and cache hit rate. Monitor B2 class-B/class-C actual totals and Actions usage separately. No blanket full global coverage claim.
- **Do not close #1827 solely on green CI.** If rows continue approaching the limit, reduce background reads/admission further or deliberately hold expensive lanes. Never automatically upgrade or bypass provider limits.
