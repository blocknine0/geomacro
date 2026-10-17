# First source-qualified structural country digest

This adds a narrowly scoped original-data adapter to the existing canonical
structural country digest, availability checker, response assembler and fixed
0.02-USDC price. It does not create a second intelligence or payment engine.

Supported initial requests: CHN or USA, `critical_minerals`, compact
`structural_baseline`, `published_only`. Qualifying input is the exact existing
MCS 2026 CSV revision already pinned by the USGS ingestion adapter. Its SHA-256
must be `582a0aa231aea53d8a97dc8d1cd3dfa5f885cf3760353e3d029d7f0ae4fbaaf5`.

Rights are checked against the publisher-deposited DataCite record for exact
DOI `10.5066/P1WKQ63T`: active, findable, USGS publisher, 2026 dataset, exact
ScienceBase release and CC0-1.0 rights URI. A new scoped source identifier is
used; this does not approve the legacy `usgs_mcs` registry entry or any other
USGS content. Missing/changed rights, denied HTTP, unexpected bytes, duplicate
rows, mixed units, missing country or absent comparable periods deny admission.

Only derived 2025-versus-2024 production percentage changes are returned.
Original production values and raw CSV rows are never delivered or archived.
Annual reference-period end is explicit, not invented release/news time.
The annual freshness window remains the existing 400-day critical-minerals
contract; recent retrieval never renews the observation period. No GRO, GRI,
risk score, current event or real-time supply measure is generated.

The adapter is opt-in only from explicit structural-baseline critical-minerals
plans. Other products and all old rights entries retain their existing gates.
Success is cached in memory for ten minutes, failures for one minute, and
concurrent reads share one original acquisition. Access denials are not retried
or bypassed; there are at most two already-reviewed release IDs.

The protected main workflow `First qualified country digest (no funds)`
qualifies actual originals, runs the existing canonical availability and
response assembler, and archives only a private derived customer-byte bundle
and its private proof hashes. Every B2 operation uses the existing shared D1
quota governor. Exact gzip restore and a second independent GET must reproduce
the customer-byte SHA. Public Actions artifacts contain sanitized receipt
metadata only, never raw input or unpaid customer bytes.

An offline parser test is not genuine data acceptance. The real workflow must
produce its positive sanitized receipt. A source-qualified archive is still
not an issued payable offer: live merchant verification, immutable quote-vault
integration, settlement, reconciliation, public production serving and explicit
real-money authorization remain separate. Do not close the launch tracker from
this workflow alone.

Official rights references checked 18 October 2026 IST:
- https://www.usgs.gov/data/mineral-commodity-summaries-2026-data-release
- https://api.datacite.org/dois/10.5066/P1WKQ63T
- https://www.usgs.gov/data-management/data-licensing
