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
- **2026-10-09 observed production gap:** run [#37946988588](https://github.com/blocknine0/geomacro/actions/runs/37946988588) emitted `HTTP_429` for geopolitics and `UPSTREAM_RATE_LIMIT_BACKOFF` for macro and critical minerals, but was incorrectly green. The operational monitor now exits nonzero on any unhealthy or missing category; its `always()` upload still records safe counts. A red monitor means open discovery transport is degraded, *not* that risk is zero. This is diagnostic only and does not recover fresh scored events.
- **Next required architecture:** independent licensed/allowed original-publisher sources per category, diverse provider families, native publish times, event-level corroboration and jurisdiction/commodity mapping, independent D1/B2 evidence, and public score gating. GDELT-only polling may not be advertised as resilient real-time intelligence.
- This does not turn an index hit into a fresh news story. It is a first discovery layer, NOT the currently blocked independent commercial event scorer/issuer and not a 24/7 hard SLA.

## Do not mark launch complete

Still require per-source commercial licensing, independent same-event corroboration, original precise publication timestamps, 195-country actual paid module coverage, signed GRO, D1 live health, Supabase-free steady producer, verified source freshness, website exact-main publish, and founder-authorized initial real x402 transaction. All conditions remain under issue #1827.

## Verified-original pre-classifier qualification guard (2026-10-10)

The industry-style separation is **discovery → source-native prequalification → canonical coding/scoring → independent same-event verification + rights clearance → signed GRO/B2/D1 → paid deliverability**. ACLED codes event actor, action, location, date and precision under reviewed sourcing; GDELT Cloud explicitly separates discovery from event identity, clustering, and reconciled publications. Neither architecture warrants that a heartbeat from a crawler or feed proves a current event for every one of 195+ countries.

`privatePublisherPreAdmission(...,{requireOriginalPublisherProof:true})` now runs at the canonical `scripts/ingest-news.js` original-source private lane **before** Groq model quota is consumed. It requires exact original publisher HTTPS article URL host, a sufficiently specific publisher title, a precise original item/source article publication time **not in the future and <= the existing six-hour private scoring cutoff**, `discoveryProvider=official_native_rss`, `nativePublishedAtVerified=true`, `privateOnly=true`, and the unlicensed/private `rightsVerified=false, commercialEligible=false` assertions. GDELT index timestamps, unverified headlines, non-first-party links, forged hostnames, optimistic claims of commercial rights and retrieval time cannot fill a model slot. Rejections have **one safe code** (`publisher_native_publication_unverified`), never upstream raw titles or URLs in public diagnostics.

This is still an **initial private source-time gate**, not a substitute for independent verification. Every downstream publisher/source claim still needs event-specific geographic/actor/time precision, same-event independent corroboration and dedupe, commercial-derived-use rights authorization, original clock, human-review escalation on ambiguity, licensed versioned canonical severity/confidence, signed GRO, B2 full readback/hash and a genuinely fresh D1 hot record. The available private-stage companion retains `source_authenticity_independently_verified=false, rights_verified=false, independently_corroborated=false, public_eligible=false` until independently established, and the x402 payment gate must continue **no-charge** on missing data. The new gate never transforms that private companion into paid entitlement.

Industry references: https://acleddata.com/knowledge-base/how-does-acled-code-and-review-data-to-ensure-quality/ and https://gdeltcloud.com/methodology . Their full staffing, global language footprint, rights and refresh coverage are **not** claimed by Geomacro.
