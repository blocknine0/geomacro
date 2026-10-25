# Geomacro: private OSINT 15-minute breaking-event observation recovery

25 October 2026 · Owner's final scope: PRIVATE worldwide OSINT
breaking-news **discovery and durable ingestion** within a 15-minute target
across 195 ISO3 country routes and three categories. **Independent
verification within 15 minutes is explicitly omitted.** The source-native
feed and authenticated D1 readback are sufficient to admit an UNVERIFIED
research observation. This remains a best-effort ingestion target, not a
guarantee that every breaking event is published or reaches registered feeds.

## Directly verified before change

- `main` collector registry: 43 pinned RSS/Atom/official GOV.UK JSON endpoints.
- Previous schedule: 15-minute GitHub cron, 8 entries/category per run, and
  15-minute rotating slot. Many sources were not polled within each 15m window.
- Feeds were sequential, each potentially 7s timeout. The source candidate
  artifact and authenticated D1 write/readback worked in GitHub Actions run
  #40175164448: 24 non-commercial factual JSON rows accepted, 25h retention,
  raw source never persisted, original-page and independent-event verified
  fields remained false.
- Every country's routing exists, but source registry is not one original
  publisher/category for each of the 195 nations. Independent original
  publication and second issuer's **same event** have not been established.

## Changes in this release

1. **Nominal five-minute discovery source slots**: the registered-source
   selector advances every five minutes instead of fifteen. With 8 pinned
   endpoints/category/slot, a category with at most 24 registered endpoints
   receives a nominal complete source revisit across three on-time slots.
   The collector emits the exact registry-derived *nominal* revisit minutes,
   which can exceed fifteen when source counts exceed its finite capacity.
   None of this is a proof of publisher publication latency.
2. **Bounded source network concurrency**: at most six simultaneous
   read-only fixed-HTTPS feed GETs, each with the existing byte limits,
   redirect protections and seven-second timeout. Process in stable
   source order and discard raw bodies after ephemeral classification.
3. **Reuse the existing five-minute Fastlane**: a successful trusted
   canonical-main `Five-Minute Original News Fastlane` scheduled/manual
   completion wakes the official source readback/publisher. Retain the
   existing 15-minute independent recovery cron and D1-deploy wakeup.
   No extra GitHub 288-run/day cron, no paid service, no Telegram scraping
   or Supabase.
4. **Durable 15-minute first-observation receipt**: D1 preserves
   `reusable_news_items.first_seen_at` on upsert. The private authenticated
   writer reads that timestamp back and reports separate:
   `first_observed_within_15m_count`,
   `first_observed_later_than_15m_count`, and
   `previously_observed_count`. Observations are measured from the
   original publisher's native publication clock, not GitHub job start or
   feed retrieval time. A late-source item is not rewritten to on-time.
   Aggregates appear in protected Github workflow logs without source
   titles, URLs, or signed original bytes.
5. **Fail-closed rights/evidence**: every machine-extracted item remains
   explicitly UNVERIFIED and noncommercial, source bodies remain private
   and ephemeral, paid signing and payment gates remain independent.
   This PR does not alter the signed public Intelligence/GRI/Risk
   Indices, Predge pipeline or paid x402 prices.

## Private 15-minute discovery acceptance (no independent verification gate)

The sole 15-minute objective is: **publisher-native RSS/Atom/approved JSON
publication clock → first authenticated private D1 ingestion timestamp**.

A private research observation is admitted when:
- a registered, pinned source responds with a safely parsed relevant item
  in one of the three categories, within the existing 25-hour source window;
- the item has a native published_at timestamp, stable duplicate identity
  and, when unambiguous, a country ISO3 label;
- sanitized factual tags are durably persisted in the protected private
  D1 store and the insert is read back with its immutable first_seen_at;
- the actual publication-to-first-D1-ingestion delay is measured. Label
  on-time if no more than 15 minutes, otherwise late. Neither label asserts
  event truth or independently verified publication.

**Removed from this ingestion acceptance:** original article page/body
re-read, second independent publisher, same-event corroboration, counterevidence,
separate rights attestations, GRO signatures and GRI/certificates. These
are **not prerequisites to private discovery or D1 research storage**.
Their separate existing public/paid/signed eligibility controls remain
unchanged. All stored news remains UNVERIFIED, private and non-chargeable.

A source that has not published, responds 403/429, or has no usable
native item clock cannot yield a falsely on-time news item. Scheduled
GitHub Actions can be delayed or dropped; observed on-time receipts,
not the cron expression, measure whether the objective was achieved.

Official GitHub documentation:
https://docs.github.com/en/actions/how-tos/troubleshoot-workflows

## Relevant checks

- `node --test scripts/lib/registered-news-15m-cadence.test.mjs`
- `node --test scripts/lib/registered-reusable-news-source-collector.test.mjs`
- `node --test scripts/lib/reusable-source-news-d1.test.mjs`
- Live main: `.github/workflows/all-source-reusable-news-json.yml`;
  inspect `geomacro.source-news-json-production-run.v1` and 15m counters.
- Retention: factual candidate JSON remains 25h; existing separate signed
  website/pilot journals keep their independent retention rules.

**Explicit launch status**: the independent-verification-within-15m
requirement is **REMOVED**. Private 15-minute discovery/ingestion is evaluated
only from native source clock to first durable D1 write. This is not a
guarantee of every breaking event in 195 countries, and does not authorize
publication or sales.
