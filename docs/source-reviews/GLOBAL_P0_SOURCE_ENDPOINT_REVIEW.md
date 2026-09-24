# Global P0 Source Endpoint Review

Date: 2026-09-24
Branch: feat/global-source-p0-expansion
Status: prelaunch, fail-closed

## Certified implementation surface

The P0 expansion now contains ten source adapters covering:

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

All ten have deterministic normalization contracts, SHA-256 provenance hashes, collision checks, timestamp ordering checks and fixture coverage. The three international legal/security HTML sources also have live HTML extraction parsers rather than discovery-only normalizers.

## Live certification model

Live certification is read-only and fail-closed. Each candidate is checked for:

1. successful transport
2. expected content type / structure
3. required authoritative page markers
4. positive extraction count for sources with live HTML parsers
5. successful adapter execution

The live certification now covers all ten P0 sources. It never changes source activation state.

## Source-specific status

### Machine-readable sources

UK Sanctions List uses the official UK machine-readable list endpoint.

EU Consolidated Financial Sanctions uses the official EU consolidated sanctions surface.

World Bank commodity prices use the official monthly commodity dataset endpoint.

UNCTADstat remains registered against the official Data Centre surface; dataset/API-level certification is still separate from page transport.

### Live HTML extraction sources

OPCW uses the official News page. The current official page is populated with dated 2026 news releases. citeturn466545search0

ICJ uses the official Cases page. The adapter is designed for the Court's official HTML case listing and remains read-only until live runtime checks pass.

ICC uses the official News page. The adapter extracts official news links from the published HTML surface and remains read-only until live runtime checks pass.

China MOFCOM uses the official Export Control Information Network HTML surface.

Australia uses the official Critical Minerals List / Strategic Materials List HTML surface.

COCHILCO uses the official Anuario page as a structured discovery surface for the current statistical datasets. It does not claim a pinned XLSX endpoint until that endpoint is safely verified.

## Activation gate

All ten P0 sources remain disabled for ingestion and commercial signals.

Activation requires every applicable gate to pass:

1. endpoint transport
2. schema/runtime extraction
3. rights/licensing review
4. freshness review
5. provenance review
6. source-independence review
7. adapter certification
8. production ingestion verification

No source is enabled merely because its parser or live endpoint test passes.

## CI governance

Global P0 adapter fixtures, adapter certification and live transport/schema certification are now included in pull-request gating through GitHub Actions.

The dedicated Global P0 workflow also supports scheduled re-probing and manual execution.

The broader Source Network Governance workflow runs the P0 checks alongside the existing endpoint-manifest and source-network contract gates.

## API key requirement

No API key is required by the current P0 adapter contracts. Any future credentialed source must document access terms, secret handling and commercial-use constraints before activation.
