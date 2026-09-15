# Production global coverage and hot-topic readiness

Status: mandatory pre-mainnet commercial launch workstream.

## Launch invariant

Geomacro must not advertise, challenge for payment, settle, or charge for a country, corridor, topic, or product unless the governed production pipeline can currently deliver the required response at the required quality threshold. Insufficient, stale, commercially ineligible, or unverifiable coverage is `not_available` and is never payable.

## Country production minimum

A sovereign country can enter the paid catalog only when the production census confirms the required bundle is deliverable:

- sovereign/fiscal risk
- macro/monetary risk
- FX/external vulnerability
- sanctions/restrictions context
- conflict/geopolitical exposure
- trade/corridor exposure where applicable
- confidence and missing-data disclosure
- freshness and observation timestamps
- source/provenance and commercial eligibility
- methodology/schema version and calculation/data hashes
- signed Risk Object verification and Risk Gate completion

Coverage is data-driven. No USA/CHN or G20 production allowlist defines the catalog, and thresholds must not be lowered to inflate the supported-country count.

## Structural source priority

### Tier A: activate/backfill first after dataset-contract validation

1. World Bank World Development Indicators and eligible World Bank-produced open datasets. WDI is public, CC BY 4.0, has broad global coverage and long historical depth. Use dataset-level metadata and preserve third-party exceptions.
2. World Governance Indicators where the exact World Bank-produced dataset contract remains commercially eligible.
3. UCDP conflict datasets. Current datasets are CC BY 4.0. For API ingestion, use a version-pinned token and respect quotas; downloads remain a valid bulk-backfill path.
4. U.S. Treasury OFAC sanctions programs and sanctions-list data for sanctions/restrictions context. Store program/list version, retrieval time and identifiers; never infer that every sanctions program is a blanket country prohibition.
5. Commercially eligible UNHCR, USGS, EIA, ADB, OECD and Eurostat datasets already cleared by the source-governance register, with exact dataset-level terms preserved.

### Permission/review gated

IMF, BIS, FAO, UN Comtrade and any third-party or mixed-license dataset remain fail-closed for paid-product use until the exact dataset/use boundary is deliberately cleared. Availability on the web is not commercial clearance.

## Hot-topic layer

Hot topics are a dynamic evidence layer on top of structural country/corridor data. A topic is publishable only when it has governed evidence, affected-subject mapping, freshness, confidence and a reproducible impact path.

Required topic families:

- armed conflict, escalation, ceasefire breakdown and spillover
- sanctions, export controls and material restrictions
- tariffs, trade disputes and corridor restrictions
- elections, coups, political instability and major civil unrest
- central-bank, inflation, FX and sovereign/debt shocks
- energy/oil/gas disruptions and critical-mineral restrictions
- maritime chokepoints, shipping and supply-chain disruption
- food/agriculture shocks where commercially cleared data exists
- major natural hazards with material macro/supply-chain impact

A hot topic is not merely a news headline. It must resolve to one or more ISO3 countries/corridors, evidence timestamps, severity/impact, confidence, source provenance and the affected Risk Gate/Risk Object context. If that mapping cannot be supported, it stays observational/non-payable.

## Initial September 2026 validation cases

Use current high-impact events as validation fixtures, not as permanent hard-coded topics. Current public evidence includes renewed Iran-related hostilities and sanctions pressure, plus severe Red Sea/Bab al-Mandab disruption risk. These are useful multi-country/corridor tests for energy, shipping, sanctions, conflict and macro spillover. Fixtures must store source/retrieval timestamps and expire rather than becoming permanent truth.

## Database ingestion contract

Every structural observation and hot-topic evidence record must carry, directly or through immutable references:

- subject ISO3/corridor/topic identifier
- metric/event definition and methodology version
- value/severity plus unit where applicable
- observation/event time and retrieval time
- source provider, dataset/feed, version and canonical provenance reference
- commercial-eligibility decision and terms/version reference
- freshness class / expiry
- quality/confidence status
- normalized-record hash and source/evidence hash where available

Never overwrite historical observations merely because a newer release arrives. Version/backfill corrections must remain auditable.

## Payment boundary

The paid flow must be:

`request -> no-charge deliverability check -> exact product/price challenge -> payment verification -> final deliverability re-check + response preparation -> settlement -> delivery + audit trail`

If the first check fails, do not issue a payable challenge. If the final check fails, do not settle. Settlement evidence must bind request ID, product/version, subject/topic, exact amount, network/asset/recipient, transaction hash, delivered object/version and reconciliation status. Replay/idempotency must never produce a second charge.

## Acceptance gates before Base mainnet activation

- measured maximum-country production census completed
- every paid-catalog country passes the complete required bundle
- hot-topic pipeline passes current-event fixtures and stale-event expiry tests
- no-charge behavior proven for unsupported/insufficient/stale subjects and topics
- World Bank/WGI/UCDP/OFAC and other activated source adapters/backfills have provenance and license tests
- x402 paid E2E proves exact price, delivery, replay protection and zero duplicate charge
- agent spend/rate/usage controls and settlement reconciliation pass
- exact launch commit passes Product CI, security/CodeQL, data-quality and paid-delivery acceptance
- owner-controlled production wallet/CDP configuration is available
- explicit real-USDC activation authorization is provided last

Base mainnet remains locked until all gates are green.
