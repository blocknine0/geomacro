# National Statistics and Central-Bank Primary Onboarding

This layer is configuration-driven. It must not pretend that one endpoint format works for all 195 countries.

## Source classes

- NATIONAL_STATISTICS: national statistical office, census/statistics authority, official macro dataset.
- CENTRAL_BANK: monetary authority, official rates, reserves, monetary aggregates, balance-of-payments or financial stability datasets.
- REGIONAL_OFFICIAL: ECB, Eurostat or another supranational official source when it is the legitimate statistical authority for the geography.
- INTERNATIONAL_FALLBACK: World Bank, IMF and other international sources used when a country-primary endpoint is unavailable.

## Adapter contract

Every country-primary source must provide:

1. Stable source ID and institution identity.
2. Country ISO3.
3. Exact dataset/series identifier.
4. Machine-readable transport.
5. URL/query or SDMX key.
6. Observation timestamp/period.
7. Unit and frequency where available.
8. Official provenance URL.
9. Commercial/reuse status.
10. Freshness expectation.
11. Rate-limit/retry behavior.
12. Runtime health result.

## Important rule

An official website does not mean the source is machine-readable or production-ready. DISCOVERY_REQUIRED entries must remain outside governed ingestion until the exact dataset route is pinned and runtime-tested.

## Initial runtime candidate

U.S. BLS public JSON is wired into the adapter probe as the first country-primary runtime slice. This is only an adapter/runtime proof, not a claim that the full U.S. macro source mesh is complete.

## Expansion

The onboarding registry should grow country-by-country using the same contract. Where a country-primary source is absent, Geomacro should retain the international fallback rather than fabricate a local source.
