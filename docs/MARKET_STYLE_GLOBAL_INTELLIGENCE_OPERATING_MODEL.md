# Geomacro: open signals are not verified commercial intelligence

Master acceptance: GitHub issue #1827. This is an original Geomacro operating model informed by public vendor documentation, not an imitation of private code or licensed data.

## Public competitor benchmarks

- Dataminr publishes multi-source signals, automated corroboration and evolving intelligence briefs: https://www.dataminr.com/products/first-alert/
- Seerist describes global source fusion, event provenance, severity scoring and verification: https://www.seerist.com/platform/monitor
- ACLED describes curated sources, who/what/where/when coding and multiple review layers: https://acleddata.com/knowledge-base/how-does-acled-code-and-review-data-to-ensure-quality/
- GDELT publishes 15-minute global news-index cycles, distinct from the original publishers' article publication timestamps: https://gdeltproject.org/data.html
- FRED publishes economic release calendars and revision-specific APIs: https://fred.stlouisfed.org/docs/api/fred/
- USGS mineral commodity reference baseline is published annually: https://www.usgs.gov/centers/national-minerals-information-center/mineral-commodity-summaries

## Distinct evidence levels: never collapse them

1. OPEN_DISCOVERY_SIGNAL: read-only bounded GDELT DOC queries from three fixed topics. Discovery seendate is an INDEX timestamp, not an event date. Separate outlet domains do not corroborate the same event. No source text, URL, user data, risk score, customer response or payment.
2. ORIGINAL_PUBLISHER_PRIVATE: existing allowlisted original publisher RSS or precise original article datePublished. A feed updated clock, retrieval, GDELT seen time and page modification are NOT evidence of original publication. Without source rights these candidates remain private.
3. VERIFIED_SAME_EVENT: canonical classifier + direct corroboration from independent source families, source rights, original timestamp, relevant subject/geography and calibrated event severity. Two unrelated articles cannot advance.
4. SIGNED_CANONICAL: derived, immutable and verifiable risk objects. Hot small references are served from D1, verified compressed private provenance from B2. Do not bypass archive/readback or sign synthetic data.
5. PAYABLE: only actual requested country/corridor + module + freshness, licensing, signed GRO, x402 settlement and double-charge controls can unlock paid delivery. Missing coverage fails before charge. Per merged #1872, external paid reads must never trigger Supabase writes.

## Different update clocks per domain

- Geopolitical breaking events are irregular. Poll fast, never invent a new conflict because no original qualifying event was published in a 24-hour window.
- Macro/FX has release-calendar observations and possibly separate live FX quotes. Never relabel old CPI/central-bank releases as new solely because the API was queried again.
- Critical Minerals has annual reserve/production baselines AND breaking mine disruptions, policies, sanctions and supply-chain changes. Display their distinct original event dates.

## Bounded free discovery deployment (this PR)

- A three-domain GDELT DOC observation monitor (3 fixed public queries, max 75 articles each, 2-hour index-time window, strict 512KiB response and 12-second timeout, no redirect).
- A GitHub Actions cron at minutes 17 and 47, best-effort every 30 minutes. The environment contains no Supabase, D1, B2 or x402 credentials.
- Only numeric per-category counts and provider transport states are retained in a 2-day artifact. Source outage is DEGRADED, empty healthy feed is NO_RECENT_OPEN_DISCOVERY, multiple outlet domains are DISCOVERY_ONLY and cannot become a paid event.
- This does not turn an index hit into a fresh news story. It is a first discovery layer, NOT the currently blocked independent commercial event scorer/issuer and not a 24/7 hard SLA.

## Do not mark launch complete

Still require per-source commercial licensing, independent same-event corroboration, original precise publication timestamps, 195-country actual paid module coverage, signed GRO, D1 live health, Supabase-free steady producer, verified source freshness, website exact-main publish, and founder-authorized initial real x402 transaction. All conditions remain under issue #1827.
