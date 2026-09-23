# BGS World Mineral Statistics v1

## Role

British Geological Survey World Mineral Statistics is a secondary authoritative mineral-production/trade evidence layer. BGS states that its archive covers more than 70 mineral commodities and country-level annual production, with data compiled as far as possible from primary official sources. The current OGC API exposes the archive programmatically.

## Runtime

- Base: `https://ogcapi.bgs.ac.uk`
- Collection: `world-mineral-statistics`
- API format: OGC API Features / JSON
- Adapter: `adapters/bgs-world-minerals.mjs`
- Probe: `scripts/probe-bgs-minerals.mjs`

The API documentation currently describes archive coverage through 2022. Therefore BGS is a historical/secondary corroboration layer unless a newer licensed dataset is explicitly onboarded.

## Evidence handling

The adapter preserves the statistic type and emits one of:

- `PRODUCTION`
- `TRADE_IMPORT`
- `TRADE_EXPORT`
- `UNKNOWN`

BGS API responses can represent unavailable/zero values differently from the yearbook. The adapter therefore does not reinterpret NULL/0 into fabricated production values.

## Licensing

BGS states that its mineral statistics are subject to terms and conditions. Production use requires a separate commercial/re-dissemination review before the source is promoted to a production-authoritative commercial signal.

## Certification rule

A successful parser self-test is not a runtime PASS. A remote probe must be executed and its health, freshness, field completeness, and licensing status recorded before this source can contribute to the final 100% certification.
