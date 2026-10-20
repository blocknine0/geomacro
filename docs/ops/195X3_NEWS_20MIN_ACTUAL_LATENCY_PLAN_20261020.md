# Geomacro 195 countries × 3 domains — measured 20-minute news objective

As of 2026-10-20. This is an operational target, not a statement of 195×3 real-time coverage or a guaranteed newswire SLA.

## Actual live boundaries
- Supported request coordinates: exactly 195 countries × geopolitics/macro/rare_earth. Routing != active independent sources.
- The free Intelligence journal: existing original-dated publisher observations; 15-minute minimum public delay; exact publication native clock; up to 600 retained derived rows globally across 72h. Current D1 rows are NOT an exhaustive global source archive.
- Historical/periodic macro/critical mineral figures have monthly/annual reference periods. They must never be relabeled as “published a few minutes ago.”
- The existing hourly broad official collector and 30-minute private source pulse stay enabled. They are deliberately NOT rebranded a universal 20-minute ingestion service.

## Five-minute pilot fastlane (new)
- Existing first-party original publisher parsers: exactly UN News (geopolitical), Federal Reserve Press (macro), Natural Resources Canada releases (minerals). This does not imply these publishers report on all 195 countries or own commercial rights to every article.
- New GitHub schedule UTC minutes 03, 08, 13, …, 58 plus owner-triggered manual run, best effort. No owner laptop, Supabase, card, B2, wallet or paid source required. GitHub may delay/drop scheduled runs.
- At most 20 source-neutral derived observations per category per run, same existing authenticated D1 journal, no extra table, same time-guard, publisher credits, no raw articles, real API as already deployed.
- Before source polling, independently read every bounded D1 public page and skip IDs already retained: no duplicate five-minute writes or repeated false deadline misses. After actual D1 acknowledgment, verify those new IDs by another complete journal read. This is an observational before/after sample, NOT proof that the fastlane is the only writer or exact database first_seen_at. Report `objective_minutes:20` and actual exact-native-timestamp rows that made/missed 20 minutes at D1 readback. Day-precision releases are excluded from exact-minute targets.
- Dedicated test CI verifies one pinned original feed per category, actual native-publication delay, no x402 signer, no paid data, no Supabase/B2. Never count merely reached sources or hypothetical news as delivery.

## Remaining true 195×3 universal news requirements
1. **Source acquisition:** An actually available, native-dated first-party feed/index for EVERY country+topic where an original publisher exists; local-language government, central banks, statistics bodies, mines/mineral/export authorities, UN/regional, and relevant corridor issuers. Use 195-country canonical ISO3 and aliases. An offline source inventory URL isn't an active feed. Country feed monitoring should be triggered by its publishing calendar and/or a new-index candidate; NOT 585 pages every 5 minutes.
2. **Discovery:** A free broad index like GDELT (15-minute updates) as a *candidate* discovery method for non-English/regional news. GDELT cannot supply the original-page publication clock, copyright permission or independent official facts. By the time a 15-minute discovery record arrives, the Geomacro 15-minute public embargo leaves only 5 minutes to locate, verify, classify and write — not a reliable guarantee. Prefer original-source webhooks/Atom real-time streams where available for tight clocks.
3. **Verification:** For each item, locate exact publisher article, verified native `datePublished`/original feed timestamp, immutable article identity, topic match, exact country/corridor relevance, translation that preserves negation and caveats, retraction/update corrections and source use/attribution. Do not infer a news event from source HTTP 200, a news-index refresh, a feed header or a generic annual dataset.
4. **Storage and capacity:** 600 derived rows/72 hours for all countries is not sufficient to promise “every single article” worldwide. A safe increase requires a separate versioned D1 cursor API, deterministic country+category pagination, storage/quota limits, retention, backpressure, journal viewer paging and real-scale tests. Don't simply remove the 600-row cap because existing reader/rights/privacy contracts are hardcoded to three 250-row pages.
5. **Delivery:** Website Intelligence, Ask and all canonical structured APIs must reuse same deduplicated Geomacro-authored derived observation. Public observed finding is not a commercial entitlement. No upstream title/URL/html, raw text or unauthorized source identity to customers.
6. **SLO and fallback:** Track native original publication -> source index observed -> exact original verified -> D1 ACK -> public readback. Mark each >=20 minute miss transparently. If upstream feed latency/429, GitHub schedule slip, day-only timestamp, B2/D1 rate cap, or attribution rights block, show delayed/unavailable and replay on next lawful opportunity, never synthetic current story.
7. **Commercial rights and income:** Paid structured product remains separate from free derived news. Capability pricing and x402 fail-closed qualification unchanged. No arbitrary unsigned 195-country global risk score or USDC charge.

## Launch milestones
- Stage 1: actual 5-minute fastlane CI and production readback, with under/over 20-minute counters for *only three source lanes*, and existing wider hourly original portfolio.
- Stage 2: per-country actual original source registration, legal/read-only reachability + last-native-news timestamps, plus adaptive source-specific cadence, language support and GDELT-as-lead integration. Track verified active source percentages per 585 cells, not just country-directory entries.
- Stage 3: scalable 72-hour cursor-based journal (beyond 600) **with measured D1 Free quota** and same Geomacro Intelligence/client view, 195-country filters and strict raw/rights policy.
- Stage 4: source-trigger/webhook or low-latency cloud orchestration and real uptime/freshness SLO measured at user-facing endpoint. Only then evaluate a contractual sub-20-minute offering; a free global all-news guarantee may remain impossible.

No claim of completion before specific real publisher releases pass actual under-20-minute readback. A time with no qualifying source release is not a successful news latency delivery sample.
