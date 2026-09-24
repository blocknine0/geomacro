# Global P0 Source Endpoint Review

Date: 2026-09-24
Branch: feat/global-source-p0-expansion
Status: prelaunch, fail-closed

## Current certification evidence

The P0 adapter fixture suite now covers seven source normalizers:

- UK Sanctions List
- EU Consolidated Financial Sanctions
- World Bank Commodity Markets / Pink Sheet
- UNCTADstat
- China MOFCOM trade/export controls
- Australian Critical Minerals
- COCHILCO minerals statistics

The certification fixture checks:

- required normalized observation fields
- HTTPS source URL shape
- SHA-256 raw hash format
- deterministic source record IDs
- deterministic hashes
- publication/observation time ordering
- source-record collision detection
- category assignment

## Runtime gate

Fixture success does not certify a live source. Activation still requires:

1. endpoint transport pass
2. machine-readable schema pass against the live endpoint
3. rights/licensing review
4. freshness pass
5. provenance review
6. independence review
7. adapter runtime pass
8. production ingestion pass

All seven P0 sources remain disabled for ingestion and commercial signals until every gate is satisfied.

The endpoint probe runs in GitHub Actions because the local model execution environment cannot be treated as external source-health evidence.

## API key requirement

No API key is required by the current seven adapter contracts. They use public government/international-organization data surfaces. If a future source requires credentials, it must be added only after documenting the free/paid access model and secret-handling requirements.

## Upstream notes

UNCTADstat currently exposes frequently updated trade, macro, commodity-price and critical-minerals datasets through its Data Centre. The current Data Centre includes a monthly UNCTAD Commodity Price Index and a critical-minerals bilateral-trade dataset. citeturn0search0

The UK Sanctions List is the UK's current authoritative sanctions designation source and provides XML, CSV and other machine-readable formats. The official page was last updated 21 September 2026. citeturn0search1
