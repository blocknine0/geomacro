# Geomacro OSINT regional source coverage and 195×3 gap matrix

Date: 26 October 2026

## Coverage dimensions

Geomacro now reports three different measures that must not be merged into one percentage:

- **Local publisher coverage:** a source is registered with a publisher-country code matching the country in question.
- **Regional fallback:** a source has no publisher-country claim but is registered to the same continent.
- **Global fallback:** a publisher-neutral source is marked global. Feeds for a named publisher country are not incorrectly counted as global fallback merely because their config is grouped as `global`.

The private 195-country × 3-category source matrix reports configured, checked, healthy, denied, malformed, unsupported and unavailable sources separately for each tier. `OBSERVED` and `EMPTY_OR_OUTSIDE_WINDOW` mean transport/feed parsing succeeded for that tick; neither proves a fresh event, event truth, local original publication, reuse rights or paid eligibility.

## Current source-inventory baseline

The last deterministic inventory reconciliation included 369 accepted endpoints, seven India PIB official-feed candidates, seven Macro/Minerals candidates and the regional candidate registry. The registry gives every country/category at least a publisher-neutral global fallback route; this is not proof that every registered endpoint is healthy.

The prior pre-expansion inventory had publisher-country-specific source metadata for 63 of 195 countries. **132 countries had no country-specific publisher source recorded.** This gap stays explicit rather than being hidden by global fallback. The local count should increase as official country feeds are added and must be recalculated by CI rather than hard-coded in the runtime report.

## Local and regional feeds added or clarified

| ID | Publisher / region | Category | Feed URL | Provenance |
|---|---|---|---|---|
| `private_expansion_au_industry_news` | Australia, Department of Industry | Critical minerals | https://www.industry.gov.au/news.xml | [Official RSS list](https://www.industry.gov.au/contact-us/rss-feeds) |
| `private_expansion_za_dsti_news` | South Africa, DSTI | Critical minerals | https://www.dsti.gov.za/rss.xml | [Official RSS list](https://www.dsti.gov.za/subscribe) |
| `private_expansion_za_sars_news` | South Africa, SARS | Macro / trade | https://www.sars.gov.za/feed/?post_type=latest_news | [Official RSS page](https://www.sars.gov.za/about/rss-feeds/) |
| `private_expansion_kr_msit_press` | South Korea, MSIT | Critical minerals / technology policy | https://www.msit.go.kr/user/rss/rss.do?bbsSeqNo=94 | [Official RSS guide](https://www.msit.go.kr/contents/cont.do?mId=173&mPid=147&sCode=user) |
| `private_expansion_ind_tax_press` | India, Income Tax Department | Macro / fiscal policy | https://wm.incometaxindia.gov.in/press-release-rss-feed/-/asset_publisher/bxhj/rss | [Official tax feeds](https://www.incometaxindia.gov.in/tax-feeds) |
| `private_expansion_bw_bankofbotswana_news` | Botswana, central bank | Macro / geopolitics | https://www.bankofbotswana.bw/rss/latest_news | [Official RSS feeds](https://www.bankofbotswana.bw/content/rss-feeds) |
| `private_expansion_th_mdes_news` | Thailand, Ministry of Digital Economy and Society | Macro / geopolitics | https://mdes.go.th/news/rss/3 | [Official RSS list](https://mdes.go.th/rss) |
| `private_expansion_bw_bankofbotswana_news` | Botswana, central bank | Macro / geopolitics | https://www.bankofbotswana.bw/rss/latest_news | [Official RSS feeds](https://www.bankofbotswana.bw/content/rss-feeds) |
| `private_expansion_th_mdes_news` | Thailand, Ministry of Digital Economy and Society | Macro / geopolitics | https://mdes.go.th/news/rss/3 | [Official RSS list](https://mdes.go.th/rss) |
| `private_expansion_ph_pna_news` | Philippines, PNA | Geopolitics | https://www.pna.gov.ph/latest.rss | [Third-party feed directory](https://inklinenews.com/feeds/philippines/) |
| `private_expansion_afdb_development_news` | Africa, African Development Bank | All three categories, regional candidate | https://www.afdb.org/en/news-and-events/rss | [Official RSS feeds](https://www.afdb.org/en/rss-feeds) |
| `private_expansion_adb_asia_pacific` | Asia-Pacific, Asian Development Bank | Macro / critical minerals, regional fallback | https://www.adb.org/rss.xml | [Official RSS](https://www.adb.org/rss) |
| `private_expansion_spc_pacific_news` | Pacific Community | All three categories, regional fallback | https://www.spc.int/rss.xml | [Official newsroom](https://www.spc.int/updates/news) |
| `private_expansion_afdb_development_news` | Africa, African Development Bank | All three categories, regional candidate | https://www.afdb.org/en/news-and-events/rss | [Official RSS feeds](https://www.afdb.org/en/rss-feeds) |
| `private_expansion_adb_asia_pacific` | Asia-Pacific, Asian Development Bank | Macro / critical minerals, regional fallback | https://www.adb.org/rss.xml | [Official RSS](https://www.adb.org/rss) |
| `private_expansion_spc_pacific_news` | Pacific Community | All three categories, regional fallback | https://www.spc.int/rss.xml | [Official newsroom](https://www.spc.int/updates/news) |

These additions are all still `RUNTIME_PROBE_REQUIRED`. They do not become operational sources merely because the official page documents an RSS link. The Philippine News Agency entry remains a third-party-discovered candidate, not an officially documented feed URL.

Petromindo was deliberately excluded: the site terms prohibit using its content to construct a database and the proposed mineral RSS URL returned a 404. Do not add it back without explicit permission.

## Audits and CI

Run `node scripts/ops/audit-private-osint-publisher-coverage.mjs` for a full offline 195×3 report. The output includes:

The same report now includes a **58-corridor source matrix** from the canonical corridor crosswalk. It separates canonical monitor-reference metadata, discovery-only overlay references, private OSINT feed candidates, and source health from the current private collector tick. A corridor with declared monitor refs but no polled corridor-associated feed is labelled `REFERENCE_ONLY_NOT_LIVE`; the report never equates a route being named in the registry with live flow/disruption intelligence.

- publisher-country source inventory;
- local, same-continent regional and global-fallback counts for each country/category cell;
- source check counts and status classes for the current tick when emitted by the production collector;
- registered local gaps separately from any available fallback route.

The per-tick private OSINT collector emits the compact `country_category_source_coverage` summary; the offline audit includes detailed cells. The source matrix and the website's separate public-Finds 72-hour coverage endpoint do not replace each other.

## Validation and limits

The tests use synthetic dated RSS responses to validate routing, health-state priority, duplicate protection and noncommercial flags. CI passing proves the code contract, not that every real feed currently responds or that all 585 cells received a story.

Production health is established only when the trusted main-branch collector actually reads each feed, validates a native publication clock, persists the private metadata and reads the write back from protected D1. GitHub `pull_request` production collector jobs intentionally skip. No source here is activated for public redistribution, signed products, partner feeds or x402.
