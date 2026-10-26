# Geomacro 195 × 3 observed news — actual journal scope

Last updated: 20 October 2026. No payment, raw article export, Supabase or extra third-party API.

> **Current read-path supersession (26 October 2026):** the ordinary public structural and 195×3 API reads have moved off the D1 journal and now consume `latest.json` from the permanent static archive. The response therefore covers only up to 250 currently eligible records in that rolling static feed, not every retained D1 row. The earlier 600-row D1 pagination/6-minute client-poll description below is historical implementation context, not the current public-read contract. D1 remains an ingestion/checkpoint/internal audit lane and is not queried for these public GETs.


## Source of truth
195 ISO3 countries are the 193 UN member states plus Holy See (VAT) and State of Palestine (PSE). Geomacro's existing separate 250-geographical-entity inventory is not the 195-country baseline.

The canonical Intelligence website and machine research news derive from ONE existing free, original-dated, source-neutral Cloudflare D1 72-hour journal. A release is delayed by 15 minutes, or conservatively longer if the native original has only a date. Its 600-record capacity is shared across all three categories. New records are not fabricated if no official publisher issues a new qualifying source-native release.

## Newly supported GET views
- https://geomacro.live/api/v1/intelligence/query?view=structural-72h&country=IND
- https://geomacro.live/api/v1/intelligence/query?view=structural-72h&country=IND&domain=macro
- https://geomacro.live/api/v1/intelligence/query?view=country-coverage-195x3
- https://geomacro.live/api/v1/intelligence/query?view=country-coverage-195x3&country=IND
- https://geomacro.live/api/v1/intelligence/query?view=country-coverage-195x3&country=IND&domain=rare_earth

Country scope uses only an EXACT match from the original release's already-derived country/alias label, never inferred from publisher location, translated guess, or regional mention. Unrecognized/ambiguous regions stay unassigned. A matched country is still ONLY an observation hint, never independently verified country-subject evidence.

The full 195×3 view has exactly 585 entries with status DERIVED_OFFICIAL_COUNTRY_MENTION_OBSERVED_UNVERIFIED, or NO_MATCHING_COUNTRY_MENTION_IN_BOUNDED_JOURNAL. The second status is NOT a claim that the country experienced no news. Every entry discloses observed 72-hour record count, real original release clock when present, and explicit false flags for certified country relevance, independent event verification, source rights and x402 eligibility. All entries are UNSCORED, NONPAYABLE and source-neutral. Country-limited views return bounded counts using the same exact journal and no new source fetch.

## Founder-approved website change in follow-up PR
Founder separately requested the 195-country Intelligence website scope. The dedicated website PR changes ONLY the protected Intelligence desk component and the approved website-lock baseline. It now displays a 195-country ISO3 dropdown including PSE and VAT; selecting a country filters exact derived original-title geography mentions in all three existing topic tabs. This is a **country-labelled observed release filter**, never all news or all events in that country. Unknown/empty cells explicitly disclose the source coverage limit. Previously the website read only the first 250 of the D1 journal's at-most-600 rows. The browser now verifies all up to three pages (0, 250 and 500) using existing fail-closed pagination. Its journal refresh is every 6 minutes, while current first-party live-source refresh stays every 2 minutes, preserving the previous maximum mean GET volume for the journal even at full capacity. A partial fallback is visibly incomplete.

No source collector, D1 schema, raw-article license, paid offer or global-risk presentation was modified by the website-only PR. New website code requires actual Lovable Publish on exact current main SHA; CI and code merge alone are not live verification.

## What this does not prove
This change adds **195-country search/matrix observability**, not 195×3 verified LIVE original publisher feeds. Existing official-source collectors are finite and capped; they cannot promise every published article for 195 states in all domains, cannot force offline publishers to publish, and cannot waive source-native clock, copyright or commercial-use restrictions. 600-row global retention is not an unbounded worldwide news archive. An unobserved cell is UNKNOWN, never no-risk/no-news.

Real expansion requires per-country active official original sources, actual article identity & publication time, consistent country/topic assignment, cross-language validation, publisher rate-limit/backoff and permission review. GDELT indexes are discovery hints, not original publication or commercial licence proof. No blind 585-source high-frequency poll or paid quota dependency may be added.

## Downstream machine and earning
Website, free news GET and canonical paid query reuse the SAME D1 observations. Paid API can use country/category derived drafts as private research hints only; eligibility remains source-rights/current-data/qualified-evidence/structured-output-hash/settlement-gated. It cannot charge based on a source-neutral news mention. All existing eight capabilities, 14 locked prices, and First Earnings 0.02 USDC structural country digest price stay unchanged. GRI/GRO/Risk Indices legacy signed recovery remains open.

## Evidence required for real launch
After CI and merge, test the newly deployed API exact version; a separate approved website-unlock PR and Lovable Publish remain necessary for full browser pagination. GET every country view on production and verify 585 entries, no raw article, and no false live completeness. Re-run Production Website Health and First Earnings No-Funds; do not claim commercial success before actual paid receipt. Independent source health/rights and source-native news counts decide what is genuinely available.
