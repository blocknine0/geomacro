# Global Source Gap Matrix

## Current baseline
The project now has strong baseline candidates for all three categories, but this document deliberately distinguishes coverage candidates from proven production adapters.

| Category | Global baseline | Country primary | Telegram | Trade/supply cross-check | Main remaining risk |
|---|---|---|---|---|---|
| GEOPOLITICS | GDELT | Government/official | Yes | Optional | Country-specific official endpoint completeness |
| MACRO | World Bank | Statistics/Central Bank | Yes | UN Comtrade | Country endpoint normalization and freshness |
| CRITICAL_MINERALS | USGS MCS | Minerals authority | Yes | UN Comtrade | Country minerals source normalization and commercial/reuse checks |

## Sources that should not be treated as production-approved yet
- JRC RMIS until reuse terms and a stable operational adapter are proven.
- IEA critical-minerals data until its exact reusable API/data path is proven.
- Commercial news/market APIs when the free tier is non-commercial or materially delayed.
- Any Telegram channel whose institutional identity is not independently verified.

## Additional useful free sources to evaluate
- IMF SDMX
- UN Comtrade free API
- Eurostat
- official national statistics and central-bank APIs
- official maritime/security feeds
- official minerals agencies
- official producer disclosures

## Acceptance principle
The goal is not to collect the largest number of sources. The goal is 195-country coverage with redundant, current, provenance-preserving evidence and a clear distinction between confirmed intelligence and early signals.
