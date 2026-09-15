# Production global coverage and hot-topic readiness

Status: mandatory pre-mainnet commercial launch workstream.

## Launch invariant

Geomacro must not advertise, challenge for payment, settle, or charge for a country, corridor, topic, or product unless the governed production pipeline can currently deliver the required response at the required quality threshold. Insufficient, stale, commercially ineligible, or unverifiable coverage is `not_available` and is never payable.

## Country production minimum

A sovereign country can enter the paid catalog only when the production census confirms the required bundle is deliverable for the requested product. Depending on the active product/methodology, this can include sovereign/fiscal risk, macro/monetary risk, FX/external vulnerability, sanctions/restrictions context, conflict/geopolitical exposure, trade/corridor exposure, confidence/missing-data disclosure, freshness, source/provenance, commercial eligibility, version/hash metadata, signed Risk Object verification and Risk Gate completion.

Coverage is data-driven. No USA/CHN or G20 production allowlist defines the catalog, and thresholds must not be lowered to inflate the supported-country count.

## Structural source priority

### Activate/backfill first after exact contract validation

1. World Bank World Development Indicators and eligible World Bank-produced open datasets.
2. World Governance Indicators where the exact World Bank-published dataset contract remains commercially eligible.
3. UCDP promoted conflict datasets with exact release/version provenance.
4. Exact promoted sanctions/restrictions adapters after source-policy review.
5. Commercially eligible UNHCR, USGS, EIA, ADB, OECD and Eurostat datasets already cleared by the source-governance register, only within each exact dataset's allowed delivery boundary.
6. GDELT event metadata where governed ingestion and redistribution rules are satisfied; underlying publisher article text is not redistributed.

### Permission/review gated

IMF, BIS, FAO/FAOSTAT, UN Comtrade, V-Dem, unpromoted sanctions adapters, and any third-party or mixed-license dataset remain fail-closed for paid-product use until the exact dataset/use boundary is deliberately cleared. Availability on the web is not commercial clearance.

## Hot-topic layer

Hot topics are a dynamic evidence layer on top of structural country/corridor data. A topic is publishable only when it has governed evidence, affected-subject mapping, freshness, confidence and a reproducible impact path.

Required topic families include:

- armed conflict, escalation, ceasefire breakdown and spillover;
- sanctions, export controls and material restrictions;
- tariffs, trade disputes and corridor restrictions;
- elections, coups, political instability and major civil unrest;
- central-bank, inflation, FX and sovereign/debt shocks;
- energy/oil/gas disruptions and critical-mineral restrictions;
- maritime chokepoints, shipping and supply-chain disruption;
- food/agriculture shocks where commercially cleared data exists;
- major natural hazards with material macro/supply-chain impact.

A hot topic is not merely a news headline. It must resolve to one or more ISO3 countries/corridors, evidence timestamps, severity/impact, confidence, source provenance and the affected Risk Gate/Risk Object context. If that mapping cannot be supported, it stays observational/non-payable.

Current-event examples may be used as expiring validation fixtures, but they must never become permanent hard-coded truth.

## Database ingestion contract

Every structural observation and hot-topic evidence record must carry, directly or through immutable references:

- subject ISO3/corridor/topic identifier;
- metric/event definition and methodology version;
- value/severity plus unit where applicable;
- observation/event time and retrieval time;
- source provider, dataset/feed, version and canonical provenance reference;
- commercial-eligibility decision and terms/version reference;
- freshness class/expiry;
- quality/confidence status;
- normalized-record hash and source/evidence hash where available.

Never overwrite historical observations merely because a newer release arrives. Version/backfill corrections must remain auditable.

## Payment boundary

The paid flow must be:

`request -> no-charge deliverability check -> exact product/price challenge -> payment verification -> final deliverability re-check -> response preparation + durable persistence -> settlement -> delivery + audit trail`

If the first check fails, do not issue a payable challenge. If the final check or preparation fails, do not settle. Settlement evidence must bind request ID, product/version, exact amount, network/asset/recipient, transaction hash/reference, delivered-product hash and reconciliation status. Replay/idempotency must never produce a second charge.

## Acceptance gates before Base mainnet activation

- measured maximum-country production census completed;
- every paid-catalog subject passes its complete required bundle;
- hot-topic pipeline passes current-event fixtures and stale-event expiry tests;
- no-charge behavior proven for unsupported/insufficient/stale subjects and topics;
- activated source adapters/backfills have provenance and source-rights tests;
- adaptive x402 paid E2E proves exact price, query binding, delivery, replay protection and zero duplicate charge;
- agent spend/rate/usage controls and settlement reconciliation pass;
- exact launch commit passes Product CI, security/CodeQL, data-quality and paid-delivery acceptance;
- owner-controlled production wallet/CDP configuration is available;
- explicit real-USDC activation authorization is provided last.

Base mainnet remains locked until all gates are green.