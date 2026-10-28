# GeoMacro D1 one-row public-news materialization — 2026-10-27

Canonical D1 + B2 remain unchanged. This is a **disposable public-only
projection inside the existing D1 database**, not a second authority, a
premium product, a raw upstream dump, or a new paid provider.

## Why
Cloudflare Query Insights `0764ca64…` shows around 428 rows read per
execution of the Website journal `SELECT ... ORDER BY ... LIMIT ... OFFSET`.
Edge POP caching cuts repeated calls but cannot eliminate cross-POP and
verification traffic. Without an active R2 binding, that query dominated
account-wide reads.

## Implementation
- New migration `0033_website_public_materialized_pages.sql` adds one revision
  fence meta row, three fixed `0/250/500` page records and canonical-table
  `INSERT/UPDATE/DELETE` triggers. Each actual source change increments the
  monotonic revision in **the same transaction**, preserving existing
  max-50 source item DB.batch size.
- The existing authenticated empty 72h retention sweep already runs in
  bundled original-source/website publisher workflows. After original TTL
  cleanup, it reads at most 601 canonical rows **once**, fails closed above 600,
  and writes three bounded JSON page objects + one conditional revision
  acceptance in **one D1.batch**. A producer overlapping the sweep cannot
  pass the revision fence and cannot publish stale pages.
- Anonymous public Website immediate/legacy HTML and native page 0/250/500,
  source-neutral machine journal and public bundle may use the materialized
  records **only if** R2 is unavailable/disabled and URL+headers are eligible.
  An unchanged canonical revision can reuse its snapshot across missed
  backstops. Every read reapplies the exact canonical publication-day and
  first-ingest 72h predicates to the complete bounded snapshot **before**
  pagination; the original projector still rejects native-expired news.
  Canonical news changes trigger immediate transactionally fenced invalidation.
  Missing, oversize, corrupt, future-dated, failed-migration or
  revision-mismatched data always falls back to canonical D1. Source-native original dates, rights, 72h retention,
  dedupe and publication qualification are checked again by the original
  response projector.
- Protected authenticated Predge and all `Cache-Control:no-cache` origin
  readback remain direct journal reads, never a synthetic cached acceptance.
  Existing R2/KV opt-in remains unchanged; **no new credentials** are required.

## Capacity and correctness caveats
- Each anonymous page or bundle cache miss reads at most three indexed
  materialized page records plus their revision JOIN in one D1 statement,
  instead of scanning up to 601 canonical journal rows. Filtering the full
  snapshot first preserves page boundaries and `has_more` as first-ingest
  records expire. No new vendor or paid storage binding is required.
- Materialization costs approximately one <=601-row canonical SELECT, three
  page writes, one revision-fence UPDATE per changed or repaired revision.
  Unchanged owner refreshes validate the indexed pages and skip the scan and
  writes, regardless of snapshot age. The existing triggers still add one
  trigger-driven metadata UPDATE per actual canonical row change. It shifts
  resource use from **reads** to some **writes**. Neither provider daily
  quota nor safe savings ratio is guaranteed until measured. Existing
  hourly/minute quota pacing, browser/POP edge caching, B2 reservations and
  fail-closed production admission remain mandatory.
- Canonical sources can publish asynchronously; a mid-ingestion invalidation
  deliberately causes a real D1 fallback until the next authorized empty
  sweep. In particular, a paused or quota-held publisher cannot be described
  as live simply because an older cached snapshot exists.
- Real native 195×3 coverage still depends on source-native dated events,
  publisher endpoint health, country attribution and verification; healthy
  fallback slots are not equivalent to 585 simultaneously ingested events.

## Production acceptance
Require the protected main D1 deploy to apply migration 0033 successfully,
read exact deployed SHA, pass Website ↔ machine D1-origin parity,
run after-merge admitted original-source empty sweep, and compare equal
Cloudflare Query Insights/UTC billing windows before calling quota reduction
verified. A fresh anonymous public immediate-news cache miss should return
current IDs from materialized D1 without an original page SELECT; a parallel
no-cache request must return identical IDs via the canonical journal.
Do not close P0 1827 without exact native-event and quota evidence.

## 2026-10-28 read-budget repair
The earlier 35-minute disposable-snapshot expiry could restart repeated
canonical scans after a delayed backstop even when D1 proved no news changed.
Revision reuse now removes that read amplification without extending any news
validity or renewing any source-success clock. SQLite integration tests compare
all page envelopes, pagination and the full bundle against direct canonical SQL
while 72h rows expire; revision races, corruption and future clocks remain
fail-closed. Predge, no-cache authenticated acceptance, 500/day cap and billing
are unchanged. Provider usage remains account-wide and observational: arbitrary
external traffic/other databases cannot be guaranteed never to exhaust it.
