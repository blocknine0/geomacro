# Risk Gate maximum country coverage

Status: production expansion contract, fail closed.

## Objective

Geomacro Risk Gate country coverage is data-driven, not a hard-coded country allowlist. The target denominator is every enabled sovereign ISO3 country in `live_country_registry`. A country is commercially available only when the complete governed evidence chain required by the active methodology is deliverable at request time.

Maximum coverage never means fabricated coverage, lowered evidence thresholds, silently extended freshness windows, or inheritance of commercial rights from an organisation name to an unreviewed dataset.

## Country eligibility invariant

A country may be advertised, offered for payment, or returned as commercially supported only when all of these conditions pass:

1. ISO3 resolves to an enabled sovereign country in the production country registry.
2. Every module required by the active Risk Gate country action profile is present.
3. Every required module meets its existing freshness, peer-universe, coverage and confidence rules.
4. Every contributing observation has an allowed commercial eligibility state for its exact adapter/dataset contract.
5. A compatible signed Risk Object exists and its signature verifies.
6. The Risk Gate evaluation completes with `execution_authorized=false` and no missing required modules.
7. Customer serialization obeys each source's raw-redistribution/derived-only boundary and retains required provenance and attribution.

If any condition fails, the country is fail-closed/non-payable. Paid rails must not request or settle payment for that request.

## Current production country census

The global country census is the source of truth for measured country-review readiness. It evaluates every enabled sovereign country against the currently required country modules:

- `geopolitical_security`
- `political_governance`
- `sovereign_fiscal`
- `macro_monetary`

Latest verified census, 2026-09-16:

- enabled sovereign denominator: **194**;
- accepted: **114**;
- fail-closed: **80**;
- accepted sovereign-fiscal methodology split: **57 World Bank QPSD + 57 governed World Bank PPG**;
- accepted results with `execution_authorized=false`: **114 / 114**.

The protected `>=100` promotion gate passed in `QPSD Production Promotion Census` run `35088622534` on commit `8533d352e1661953e0ce12a51c6f72b00c4b13a4`. The evidence artifact `qpsd-production-promotion-census` has digest `sha256:74d4effcaac191b915bb87dbe73d0fae0ac294b1e4ea571454bfaefb66ee453a`.

World Bank QPSD remained active after the successful promotion check. Governed World Bank PPG remains the next compatible fiscal fallback where QPSD does not provide the accepted source-specific state. Countries with missing or unverified required modules remain fail-closed.

This measured result is **country-review coverage for the current four-module methodology**. It is not an all-country guarantee, not a production SLA, not independent certification, not proof that every product is payable for every accepted country, and not authorization for Geomacro to execute a transaction.

The census must continue to report the exact accepted count, fail-closed count, percentage and per-country reasons. Do not replace this measured denominator with a marketing country count.

## Source-governance boundary

Exact dataset/adapter contracts control paid eligibility. Current repository governance includes reviewed/promoted paths for World Bank WDI, World Bank WGI, selected UCDP datasets, UNHCR Refugee Population Statistics, exact Eurostat government-finance data, selected USGS data, GDELT event metadata and other individually reviewed sources.

Sources or adapters still marked permission-required, review-required, derived-only for the requested delivery mode, or otherwise unverified stay excluded from that paid delivery path. Public/free/API-accessible does not imply commercial eligibility.

## Payment boundary

For Coinbase x402, GOAT, credits, subscriptions and every future paid rail, use the same invariant:

`request -> no-charge deliverability/eligibility check -> payment challenge only if deliverable -> payment verification -> final deliverability re-check -> response preparation + durable persistence -> settlement -> delivery`

If the pre-check, final re-check or preparation fails, settlement is not allowed. A payment rail must never turn an unsupported country into a supported country.

The 2026-09-16 country census did not activate x402, Base mainnet, real-money settlement or autonomous execution. Those launch gates remain separate and fail closed.

## Expansion procedure

To increase the accepted-country count:

1. run `scripts/global-risk-gate-country-census.ts` against production data and preserve the report;
2. group fail-closed countries by missing/unverified module and source reason;
3. improve coverage only with definition-compatible, commercially cleared sources;
4. never lower peer/freshness/confidence thresholds merely to increase the count;
5. ingest/backfill normalized observations with source/version/provenance hashes;
6. generate/refresh compatible signed Risk Objects;
7. rerun the full census and Risk Gate tests;
8. publish only the newly measured accepted set/count;
9. paid availability/discovery must be generated from the same eligibility result, not a manually maintained country list.

## Marketing boundary

Geomacro may publish the exact measured supported-country count from the latest production census with its denominator, methodology boundary and verification date. The current evidence-backed claim is **114 of 194 enabled sovereign countries accepted for four-module Risk Gate country review on 2026-09-16, with the remaining 80 fail-closed**.

Geomacro must not say `all countries`, `fully production ready`, `independently audited`, or imply automatic execution authority unless separate current evidence specifically supports those claims.
