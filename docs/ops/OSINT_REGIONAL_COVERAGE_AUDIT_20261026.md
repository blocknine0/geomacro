# Geomacro OSINT regional source coverage

Date: 26 October 2026

## Changes in this branch

- Add six regional feed candidates documented by their publishers or surfaced as discovery candidates: Australia Department of Industry; South Africa DSTI and SARS; Korea MSIT; Indonesia Petromindo Minerals; Philippine News Agency.
- Permit the private regional candidate registry to classify feeds in any existing category: geopolitics, macro/FX, and critical minerals.
- Add a publisher-country coverage audit reporting country-specific endpoints and healthy source checks separately. Publisher country is inventory metadata, not event location.
- Include compact source-origin coverage counters in the private 15-minute OSINT summary and add an on-demand no-network detailed audit command.
- Preserve duplicate URL checks, bounded HTTPS reads, native-clock rules, private D1 storage, no raw story persistence, and no public, signed, partner, or paid promotion.

## Feed candidates added

| ID | Publisher / region | Category | URL |
|---|---|---|---|
| `private_expansion_au_industry_news` | Australia, Department of Industry | Critical minerals | https://www.industry.gov.au/news.xml |
| `private_expansion_za_dsti_news` | South Africa, DSTI | Critical minerals | https://www.dsti.gov.za/rss.xml |
| `private_expansion_za_sars_news` | South Africa, SARS | Macro/FX and trade | https://www.sars.gov.za/feed/?post_type=latest_news |
| `private_expansion_kr_msit_press` | South Korea, MSIT | Critical minerals / technology policy | https://www.msit.go.kr/user/rss/rss.do?bbsSeqNo=94 |
| `private_expansion_id_petromindo_minerals` | Indonesia, Petromindo | Critical minerals | https://www.petromindo.com/api/v1/rss/news-category/mineral |
| `private_expansion_ph_pna_news` | Philippines, PNA | Geopolitics | https://www.pna.gov.ph/latest.rss |

Every newly added endpoint is `RUNTIME_PROBE_REQUIRED`. `provider_rights_verified`, `commercial_eligible`, `access_verified_in_production`, and `publicly_deliverable` remain false. The Philippine News Agency URL is recorded as a discovery candidate surfaced in a public feed directory, not as a confirmed direct publisher-documented endpoint.

## Source-gap audit

Run `node scripts/ops/audit-private-osint-publisher-coverage.mjs` to print the detailed coverage report. It includes 195 country rows and 585 country-category slots. It distinguishes:

- configured country/category routing;
- publisher-country feeds registered in the inventory;
- source endpoints that actually return a usable feed and native publication clock;
- gaps where the registry has no country-specific feed for a category.

The report deliberately does not treat global or regional publishers as local sources for every country and does not infer event-country from publisher country.

## Validation boundary

Tests use synthetic dated RSS responses to validate parser/category routing and privacy flags. They do not prove the real sites respond in production. The scheduled private collector must still show actual transport, parsing, publisher-native timestamps and protected D1 readback before any endpoint is considered operational. No source is activated for public redistribution, signed products, partner feeds or x402.
