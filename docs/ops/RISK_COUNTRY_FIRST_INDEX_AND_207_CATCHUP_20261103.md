# 195-country Risk Gate: country-first original source lookup and daily 207 receipt

## What failed before

`unified-risk-gate.mjs:d1Observed` selected the newest **40 category-global** rows and only afterwards evaluated the headline's country. A genuine China, India or Bangladesh release outside that 40-row global page was invisible, even when stored in canonical D1. Independently, Supabase sync was capped at 6 immutable snapshots per 15 minutes; this caused actual D1 generations and remotely verified daily rows to diverge for hours. Many ingested news items are not independent signed GROs, so their absence from verified numerical scoring remains a separate question.

## Permanent implementation

- Migration `0111_phase2h_risk_country_materialization.sql` adds an **additive nullable** `risk_country_iso3` column to `phase2h_private_raw_news`. Existing `raw_json`, original source SHA, record ID, original clock, private retention and B2 object hashes are byte-unchanged. `ZZZ` explicitly means a real original had no unambiguous eligible 195-country headline; it is **not** a country and cannot count toward 195.
- The existing private canonical ingest derives `risk_country_iso3` from the same reviewed `phase2hHeadlineCountryCandidate(original.original_title)`, not publisher URL, owner or guessed geography; no extra fetch or source. The Indexed risk lookup applies **ISO3 + category + native original timestamp** before the 40-row *per-country* limit. Every result is revalidated using raw record ID/SHA and the 195-country headline resolver; only internal metadata observation, not event verification or rights approval.
- Existing old NULL rows are populated in <=40-row set-based D1 batches from the 72-hour recent materialization window, every two minutes on the **existing** Worker cron. The partial SQLite index prevents full historical scans; exact row/ISO3 readback is mandatory. A corrupt read or write fails visibly. New raw ingestion supplies the index directly, so catchup is only for legacy data.
- The existing unified-Supabase sync now moves **at most 12 actual snapshots every 5 minutes**, with the original D1-to-Supabase exact row SHA readback before D1 `supabase_synced_at` acknowledgment. No fabricated, unsourced, or fake-status row can enter the daily sync. This is bounded to Cloudflare/Supabase Free usage.
- Retry scanning is allowed until 18:15 UTC with the already-existing maximum **3 attempts** per canonical target, leaving 15 minutes before the 18:30 strict 207/207 daily census. The owner-only `/v1/internal/risk-gate/unified-census` reports real local D1 generated count, remote synced count, missing snapshots, backlog, exhausted retry targets and outstanding legacy country-index rows without private source metadata.
- Core signed GRO/three-category numerical score, commercial entitlements, PREDGE, website API, original source rights and paid route security remain untouched. A source observation is still `OBSERVED_UNVERIFIED`; an unverified category score stays `NULL`.

## Mandatory production acceptance (no artificial green)

1. Offline real SQLite migration/lookup/backfill test verifies that 70 more-recent unrelated global original records do not displace the genuine older country record. Backfill exact source-ID readback and corrupt source fail-closed tests also run.
2. PR Product CI, CodeQL, raw canonical ingestion tests, and the protected D1 deployment offline suite must succeed.
3. Main production deploy applies D1 0111 remotely, proves both SQLite indexes via read-only metadata, deploys the production control plane, passes actual Taiwan/China/Bab-el-Mandeb SHA D1-Supabase canaries, then prints the owner-only current-day D1-vs-Supabase/backfill census (never original article data). Do **not** confuse a canary 3/3 with canonical 207/207.
4. `unified-risk-daily-production-census.yml` at 18:30 UTC remains **strict**: 195 country plus 12 corridor unique snapshots and **207 fresh exact Supabase SHA readbacks**. Incomplete must fail red.
5. Subsequent daily immutable snapshots incorporate any verified original indexed before their generation. Previously issued signed daily HMAC snapshots are not rewritten to retroactively add later raw news. True continuous per-event paid scoring remains subject to separate signed GRO verification and rights.

No payment activation or new news source is part of this change.
