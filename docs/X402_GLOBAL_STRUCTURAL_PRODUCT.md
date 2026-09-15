# Geomacro x402 Global Structural Risk Intelligence

Status: production product contract in preparation. Base mainnet remains locked.

## Purpose

The Coinbase x402 surface is both a paid machine-to-machine product and a compact demonstration of what Geomacro can deliver. It must not present Geomacro as a two-country demo.

A paid request may address any syntactically valid ISO 3166-1 alpha-3 country, or a directional pair of different ISO3 countries. Delivery remains evidence-governed and fail-closed: accepting a country code never means Geomacro claims complete data for that country.

## Paid response capability

For a subject that passes the governed commercial evidence pipeline, the response can combine:

- signed and commercially verified Geomacro Risk Object
- Risk Gate policy decision context, always with `execution_authorized=false`
- structural country or endpoint-composed corridor evidence
- structural dimensions, metrics, units and latest observations
- source identifiers and source URLs where governed for delivery
- observation/publication/retrieval timing
- normalized evidence hashes and methodology status
- structural coverage rows by country, source, dimension and coverage year
- global GRI context and audit/proof hashes when available
- explicit missing/unavailable state instead of fabricated zero-risk data

Structural evidence remains evidence context and is not silently treated as an input to GRI v1.2.

## Coverage policy

Geomacro should expose the maximum defensible country universe present in the governed structural warehouse. Coverage is data-driven, not a hard-coded marketing list.

Rules:

1. Any valid ISO3 subject can be requested on the paid x402 surface.
2. Data is returned only when the governed Risk Object/Risk Gate and structural serving layers can support the requested subject.
3. Missing data is represented as missing/unavailable; it is never converted to zero risk.
4. Country coverage, dimensions, source counts, observation counts and freshness must remain inspectable from serving metadata.
5. Corridors are directional. Endpoint-composed evidence must be labeled as such and must not be described as route modeling when route modeling is not available.
6. The API must not claim universal or complete global coverage unless measured warehouse coverage proves it.

## Commercial boundary

The approved initial Coinbase x402 production price is `0.02 USDC` per paid call. This price is intended for a bounded current intelligence/pre-flight response, not a bulk export of the historical warehouse.

Bulk global data, long historical series, continuous feeds, high-volume access, custom reports and institutional integrations remain separate commercial products/SKUs.

## Capability positioning

The paid response should demonstrate that Geomacro can turn governed global structural, geopolitical and macro evidence into machine-readable, auditable risk intelligence for human and autonomous-system decisions.

x402 is the discovery/payment rail. Geomacro's product is the intelligence, evidence, transparency and decision context delivered behind it.
