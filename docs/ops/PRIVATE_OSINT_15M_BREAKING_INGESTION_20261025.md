# Geomacro: private OSINT 15-minute breaking-event observation recovery

25 October 2026 · Owner requested permanent worldwide real-time/15m observation
and independently verified publication in three domains across 195 countries.
This change **improves a real bounded ingestion mechanism**; it does NOT
certify that all breaking events are discovered, independently verified or
delivered in 15 minutes.

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

## Acceptance and rejection

A nominal 15-minute source scan does not prove 15-minute breaking
ingestion. A true per-event private acceptance receipt requires:

- a publisher's actual original news event has a native published_at;
- pinned first-party page exact bytes and native clock independently
  reread and hashed; stable issuer identity;
- the same claim independently supported by a distinct genuine original
  publisher (not syndicated copies/aliases), with counterevidence and
  retraction checks;
- article-specific rights, truth-review authority, and exact D1/B2
  immutable private readback with first observation no later than
  original published_at + 15 minutes;
- production issuer readback, any required signatures, continuous
  monitoring and separately evidenced country/category coverage.

If any part is missing, mark the event `DISCOVERED_UNVERIFIED`,
`LATE_DISCOVERY`, `PUBLISHER_UNAVAILABLE`,
`CORROBORATION_PENDING` or `RIGHTS_PENDING` as appropriate; never
assert independent verified news or bill for it.

Official GitHub documentation explicitly warns that scheduled workflows
may be delayed or dropped:
https://docs.github.com/en/actions/how-tos/troubleshoot-workflows
A hard deadline would require externally bounded redundant clock/queue
execution, adequate source capacity/permissions, and real incident
measurement. Even with perfect infrastructure, there cannot be a
guarantee of discovering every world's unpublished event, obtaining two
independent original confirmations or establishing rights in 15m.

## Relevant checks

- `node --test scripts/lib/registered-news-15m-cadence.test.mjs`
- `node --test scripts/lib/registered-reusable-news-source-collector.test.mjs`
- `node --test scripts/lib/reusable-source-news-d1.test.mjs`
- Live main: `.github/workflows/all-source-reusable-news-json.yml`;
  inspect `geomacro.source-news-json-production-run.v1` and 15m counters.
- Retention: factual candidate JSON remains 25h; existing separate signed
  website/pilot journals keep their independent retention rules.

**Explicit launch status**: 15-minute independent verification worldwide
remains NOT CERTIFIED until it is measured for actual events across sources,
not inferred from a green GitHub workflow or a 195-country registry.
