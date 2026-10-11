# Step 1 — Three-family official-source operational and rights audit (11 October 2026)

**Status: PARTIAL — transport redundancy observed, NOT end-to-end source certification.**
Tracking: [#1827](https://github.com/blocknine0/geomacro/issues/1827).
Exact production evidence: [scheduled run #38116350259](https://github.com/blocknine0/geomacro/actions/runs/38116350259),
05:55:19 UTC. Source registry and parser:
[`probe-expanded-official-source-mesh.mjs`](../scripts/ops/probe-expanded-official-source-mesh.mjs).
**This is a sampled 13-publisher observation, not a 195-country original article audit.**

## Real independent production transport — 13 fixed issuer/publisher lanes

The source details below are sanitized GitHub-run numeric/source-ID evidence, not
claims based on a fixture or public website. "24h" means publisher release
items only. Rows with 0 may simply have no new release or no usable native
date; no globally empty event window is implied.

| Family | Official origin / source ID | Actual HTTP / parser on 2026-10-11 | Native dated / 24h items | Issuer geographic scope and function |
|---|---|---|---|---|
| Geopolitics | European Commission sanctions `eu_sanctions_guidance_official_rss_review` | **200 / valid** | 19 / 0 | EU-origin sanctions-policy changes; extraterritorial target countries require article evidence |
| Geopolitics | United Nations News `un_news_security_original_rss_review` | **200 / valid** | 0 / 0 | UN global-news issuer, not proof of coverage of every country |
| Geopolitics | UK FCDO `uk_fcdo_original_foreign_policy_atom_review` | **200 / valid** | 0 / 0 | UK foreign-policy issuer; affected-country mapping must come from each original article |
| Macro/FX | ECB statistics press `ecb_statistical_press_official_rss_review` | **200 / valid** | 15 / 0 | Euro area / ECB monetary-statistics jurisdiction |
| Macro/FX | Eurostat update RSS `eurostat_stats_update_official_rss_review` | **200 / valid** | 80 / 80 | EU statistical release catalogue; 80 data updates **do not equal macro events** |
| Macro/FX | Statistics Canada Daily `statcan_prices_original_atom_review` | **200 / valid** | 0 / 0 | Canadian prices, indexed subject feed; not world inflation |
| Macro/FX | U.S. Federal Reserve `fed_monetary_original_press_rss_review` | **200 / valid** | 0 / 0 | U.S. Federal Reserve policy and press notices |
| Critical minerals | EITI `eiti_implementing_country_official_api_review` | **403 / denied** | unknown | Implementing-country *structural* extractive metadata; NOT current mineral news; do not retry around authorization |
| Critical minerals | EU featured news `eu_official_featured_news_minerals_private_rss_review` | **200 / valid** | 30 / 1 | EU feature aggregator, not independent original reporter |
| Critical minerals | NRCan Simply Science `nrcan_simply_science_official_rss_review` | **transport unavailable** | unknown | Canadian research news; alternate NRCan governmental press feed is a DIFFERENT feed |
| Critical minerals | Natural Resources Canada government news `nrcan_government_news_original_atom_review` | **200 / valid** | 0 / 0 | Canadian mineral policy/news, first-party government notices |
| Critical minerals | USGS mineral program RSS `usgs_minerals_original_news_rss_review` | **transport unavailable** | unknown | U.S. mineral news; USGS official web page is not a tested replacement RSS |
| Critical minerals | Australian industry minister `australia_industry_minister_original_rss_review` | **200 / valid** | 10 / 0 | Australian industry minister releases; mineral relevance is per article |

**Observed: 10/13 publisher feeds operational, 3 degraded** in the specified
GitHub environment/window. Two distinct original-publisher feeds *had healthy
transports* in each family (UN + UK FCDO; StatCan + Federal Reserve; NRCan
+ Australian industry). **0 contemporaneous original topic-qualified items**
were accepted in the 24-hour category counters in that run. This is neither
same-event corroboration nor verified country-level event coverage.

The separate 30-minute [successful pulse #38115811674](https://github.com/blocknine0/geomacro/actions/runs/38115811674)
proved scheduled multi-family readback in another time window; it does not
override 13-feed failures or confer commercial rights.

## Issuer-specific permitted use / rights — reviewed policy, NOT article approval

| Issuer | Official permission / conditions | Step 1 decision |
|---|---|---|
| UN News | [UN copyright](https://www.un.org/en/about-us/copyright/): news reuse requires appropriate credit and notifying the UN; general materials have restrictions | **HOLD publisher article reuse until notice/permission requirements verified**; private link/fact discovery only |
| Statistics Canada | [StatCan terms](https://www.statcan.gc.ca/en/terms-conditions) and [open licence FAQ](https://www.statcan.gc.ca/en/terms-conditions/open-licence-faq): commercial reuse with acknowledgement; third-party exceptions | General publisher-level licence documented; specific derived output remains unapproved pending item-level review |
| NRCan | [Canada Open Government Licence](https://open.canada.ca/en/open-government-licence-canada/) permits commercial use with attribution; [NRCan lists original Atom feed](https://natural-resources.canada.ca/corporate/rss-feeds) | General governmental licence documented, third-party exclusions/item-level approval required |
| U.S. Federal Reserve | [Board disclaimer](https://www.federalreserve.gov/disclaimer.htm): Board-produced information generally public domain; cite Board, third-party media excluded | General publisher rights documented; keep commercial gate false until source-specific evidence |
| USGS | [Copyright and credits](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits): USGS-authored material public domain with credit; third-party work excluded | General rights documented; **live feed presently unreachable in sampled runner** |
| Eurostat | [Copyright/reuse notice](https://ec.europa.eu/eurostat/help/copyright-notice): reuse often commercial with attribution, explicit exceptions and third-party restrictions | Dataset-specific only; catalogue refresh not a priced risk event |
| UK FCDO / GOV.UK | [Open Government Licence](https://www.nationalarchives.gov.uk/terms-and-conditions/copyright/) usually governs Crown information, excluding third-party material and marks | Licence must be checked on the actual news page; no automatic approval |
| EITI | [EITI open data policy](https://eiti.org/guidance-notes/open-data-policies-and-disclosures) requires country-specific open formats/licences | **403 fail-closed**; not 195-country feed and not an original current article |
| EU sanctions/news, ECB, Australian minister | No complete per-publisher, per-article redistribution approval recorded in this audit | **HOLD**; subscription/discovery does not mean commercial rights granted |

Rights to use facts or independently written derived analytics are distinct
from rights to redistribute the exact article text, news headlines, images,
bulk datasets or branded materials. Geomacro publicly serves **none** of
those original source materials. Everything remains private provenance
discovery until source and output-use approval.

## Enforced verification / next acceptance gates

1. Scheduled worker retrieves **only explicitly pinned HTTPS original issuer feeds** with timeout, body cap, MIME/XML shape checks, no redirect-following or access-control bypass.
2. An original article qualifies *for private candidate discovery only* if its URL is on the exact first-party host and path and has a real item `pubDate`/`published` or bounded verified original article `datePublished`. Neither Atom `updated`, index clock nor collector clock can substitute.
3. Independent issuer availability is computed from the **actual sanitized runtime receipt**, not presence of source IDs in a config. The companion audit writes `step1-issuer-readiness.json`, keeps all 403, 429, invalid and unavailable source IDs explicitly failed, and refuses fewer than two healthy independent issuers per category.
4. The **country relevance for each actual article** must be resolved from body/entity evidence; home-office nationality is not sufficient. Even when a transport has 0 current articles, it can only pass transport—not per-article country relevance.
5. EITI's denied API must **not** be accessed through retries/proxies/token evasion. NRCan government press releases and Australian ministerial feed are independent operational mineral discovery sources but do not replace EITI's implementing-country structural data. USGS editorial page may be browsed independently, but must not be called a successful RSS until its RSS transport passes.
6. Country/issuer/topic relevance, third-party exceptions, two independent same-event confirmation, signed GRO, D1/B2 restore and paid x402 acceptance **remain unchecked**. No permission is inferred and no paid object is unlocked.

A future green transport audit *alone* must not mark Step 1 "fully
complete"; require sampled actual first-party article link + original timestamp
+ country mapping + approved article-level reuse disposition from more than one
independent original publisher in **each** family. The runtime audit
intentionally reports `step1_end_to_end_accepted: false`.
