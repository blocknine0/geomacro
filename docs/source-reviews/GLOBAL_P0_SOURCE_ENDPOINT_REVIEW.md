# Global P0 Source Endpoint Review

Date: 2026-09-24
Branch: feat/global-source-p0-expansion
Status: prelaunch, fail-closed

## Current certification evidence

The P0 adapter fixture suite now covers ten source normalizers:

- UK Sanctions List
- EU Consolidated Financial Sanctions
- OPCW official news
- International Court of Justice cases
- International Criminal Court news
- World Bank Commodity Markets / Pink Sheet
- UNCTADstat
- China MOFCOM trade/export controls
- Australian Critical Minerals
- COCHILCO minerals statistics

The fixture certification checks:

- required normalized observation fields
- HTTPS source URL shape
- SHA-256 raw hash format
- deterministic source record IDs
- deterministic hashes
- publication/observation time ordering
- source-record collision detection
- category assignment

## OPCW / ICJ / ICC live-source status

The official discovery surfaces are confirmed current, but a stable public machine-readable endpoint was not identified for these three sources during this certification pass.

OPCW publishes current official news on its Media Centre. The current page contains dated official news items, including September 2026 releases. citeturn0search1turn0search3

The ICJ official cases/documents are available through the Court website and its official document infrastructure. Search evidence also exposes official case-related documents on the Court's api.icj-cij.org document host, but that is not sufficient by itself to certify a stable case-list API. citeturn1search0turn0search4

The ICC official news surface remains the authoritative discovery surface for this adapter. No stable machine endpoint was promoted from discovery-only evidence in this pass.

Accordingly, these three adapters are marked IMPLEMENTED_FIXTURE_CERTIFIED, but remain disabled and are not treated as live schema-certified sources.

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

All ten P0 sources remain disabled for ingestion and commercial signals until every gate is satisfied.

The endpoint probe runs in GitHub Actions because the local model execution environment cannot be treated as external source-health evidence.

## API key requirement

No API key is required by the current adapter contracts. They use public government/international-organization data surfaces. If a future source requires credentials, it must be added only after documenting the free/paid access model and secret-handling requirements.

## Upstream notes

UNCTADstat exposes frequently updated trade, macro, commodity-price and critical-minerals datasets through its Data Centre.

The UK Sanctions List is the UK's current authoritative sanctions designation source and provides XML, CSV and other machine-readable formats.
