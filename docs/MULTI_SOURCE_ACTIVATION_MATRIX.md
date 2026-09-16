# Geomacro Multi-Source Activation Matrix

**Status:** production-governance working document  
**Review date:** 2026-09-16

Geomacro must not depend on one provider for global Risk Gate coverage. A source is useful only when its exact dataset contract, commercial rights, data definition, freshness, country coverage and operational adapter are all explicit.

This document separates **rights-approved candidate** from **operationally active Risk Gate input**. A source can be commercially reusable and still remain disabled until the adapter and methodology are proven.

## Activation rule

A source can become a paid Risk Gate input only after:

1. exact dataset / API contract is identified;
2. official commercial-use terms are recorded;
3. attribution and third-party-content limits are recorded;
4. adapter produces deterministic normalized observations;
5. source definition is compatible with the target Risk Gate metric;
6. freshness and sovereign-country coverage are measured in production;
7. unit and contract tests pass;
8. production ingest and a country census prove the new coverage;
9. source and methodology versions remain traceable in downstream hashes.

No source is activated merely because it is public, free, popular or machine-readable.

## Current decisions

| Source | Intended role | Rights decision | Operational decision | Key boundary |
|---|---|---|---|---|
| World Bank WDI | Global macro, banking, external buffers and existing debt evidence | VERIFIED for pinned WDI source 2 | Active | Current central-government debt has insufficient fresh peers for the sovereign-fiscal census |
| World Bank WGI | Political stability / governance | VERIFIED for World Bank-published WGI output | Active | Vatican/Holy See remains an explicit source gap; no inheritance to proprietary underlying inputs |
| UCDP | Conflict / geopolitical security | VERIFIED for governed current dataset paths already documented | Active | Release manifest required; missing source evidence fails closed |
| World Bank QPSD | Quarterly public-sector debt, general-government and central-government debt | Exact QPSD Data Catalog marks dataset Public and CC BY 4.0 | Candidate; official bulk CSV audit active | General-government and central-government concepts stay separate source-specific peer universes; no cross-concept pooling |
| World Bank IDS | External public/publicly guaranteed debt and debt-service vulnerability in low- and middle-income economies | Exact IDS Data Catalog marks dataset Public and CC BY 4.0 | Candidate; discovery adapter next | External public debt is not a substitute for total/general-government gross debt; use for external/sovereign vulnerability modules |
| World Bank QEDS SDDS/GDDS | Quarterly external debt by sector, maturity, instrument and currency | Exact QEDS catalog marks dataset Public and CC BY 4.0 | Candidate; coverage audit next | Strong for `external_fx` / external-liquidity risk; must not be relabelled as general-government fiscal debt |
| ADB Basic Statistics 2026 | Asia-Pacific fiscal balance, external debt, reserves and government-finance supplement across 47 economies | Dataset page is Public and CC BY 3.0 IGO; commercial adaptation allowed with attribution | Candidate; exact-column audit next | Regional supplement only; preserve ADB source definitions and attribution |
| OECD Public Finance | Fresh general-government/public-sector debt | Commercially reusable subject to exact dataset metadata and third-party restrictions | Candidate; dry-run first | D1-D4 general-government debt is not the same concept as WDI central-government debt |
| Eurostat Government Finance | Regional fiscal/macro supplement | Commercial reuse generally authorised with attribution | Candidate | Restrict to Eurostat-owned/eligible rows and permitted geographies; obey dataset-specific exceptions |
| ADB ADO 2026 | Developing-Asia macro supplement | Exact CC BY 3.0 IGO datasets allow commercial adaptation with attribution | Candidate | Only datasets explicitly carrying the open licence may inherit the contract |
| EIA International Energy | Global energy supply/production/price evidence | U.S. government data reusable under EIA public-domain policy | Candidate | API requires a key; third-party protected material excluded; no energy Risk Gate methodology yet |
| USGS Earthquake Hazards | Near-real-time natural-hazard evidence | USGS-produced data reusable; source credit requested | Candidate | Requires hazard schema + methodology before Risk Gate activation |
| USGS Mineral Commodity Summaries | Critical minerals | VERIFIED under existing Geomacro register | Operational ingest hardened | Does not by itself promote `energy_commodities` |
| IMF Data | Potential global fiscal/macro supplement | PERMISSION REQUIRED for potential commercial reuse under current IMF terms | Disabled | Do not use in paid Risk Gate until permission is recorded |
| UNCTAD A World of Debt | Broad public-debt benchmark covering about 188 countries | Benchmark-only pending exact redistribution/underlying-source review; dashboard derives material from IMF/WB | Disabled for paid scoring | Useful for gap discovery and validation only; do not inherit IMF-derived values into paid output without rights clearance |
| BIS Statistics | Banking / cross-border finance candidate | REVIEW REQUIRED for paid-product use | Disabled | Commercial-product condition must be deliberately cleared |
| V-Dem v16 | Governance supplement | CC BY-SA 4.0 but share-alike requires product/licensing review | Disabled | Do not introduce share-alike obligations into proprietary commercial output accidentally |
| UN Comtrade | Trade-flow evidence | PERMISSION REQUIRED for commercial exploitation / automated redistribution | Disabled | Prior written permission required before paid production use |
| IEA Critical Minerals | Critical-mineral supplement | Existing old registry status is not enough | Disabled pending re-review | Exact dataset/version and operational adapter evidence required |
| JRC RMIS | Supply-chain / critical-mineral supplement | Existing old registry status is not enough | Disabled pending re-review | Exact item-level terms and operational adapter evidence required |

## 100-country sovereign-fiscal recovery plan

The production country census currently fails many countries on `sovereign_fiscal` because the existing WDI metric `central_government_debt_pct_gdp` has too few current/aging peers for the fixed minimum peer universe.

Do **not** solve that by lowering the peer threshold, treating missing as zero, widening freshness arbitrarily, or pooling incompatible government-sector concepts.

Execution order:

1. **World Bank QPSD bulk proof first.** Measure fresh general-government and central-government `% of GDP` coverage from the official bulk CSV contract. The World Bank DataBank currently exposes roughly one hundred reporting economies, so this is the highest-probability route to the >=100 target if the actual fresh source-specific union survives the production census.
2. Map QPSD ISO3 coverage against `live_country_registry` and keep general-government and central-government peer universes distinct.
3. Build deterministic QPSD observations with exact series code, period, retrieval timestamp, bulk-file hash, source concept and CC BY attribution metadata.
4. Run source-specific shadow scoring with the existing fixed peer minimum. A country may use one approved QPSD concept only through an explicit versioned hierarchy; values from different government-sector concepts are never averaged or pooled.
5. Use OECD, Eurostat and ADB Basic Statistics/ADO only as governed regional supplements where the exact definition is compatible with a versioned module methodology.
6. Add World Bank IDS and QEDS to `external_fx` / external-sovereign vulnerability coverage rather than misusing them as total fiscal debt.
7. Rerun the full 194-sovereign production census after every promotion and publish exact accepted/fail-closed counts plus blocker reasons.

A newer number is not automatically a comparable number, and a larger country count is not accepted unless the source contract and methodology remain auditable.

## Module expansion map

### `sovereign_fiscal`

Priority: World Bank QPSD source-specific general/central-government hierarchy, then OECD Public Finance, Eurostat and exact ADB open datasets where definitions are compatible. IMF only after commercial permission.

### `fx_external_risk` / `currency_capital_mobility`

Priority: World Bank QEDS SDDS/GDDS for quarterly external-debt structure and World Bank IDS for annual public/publicly guaranteed external debt and debt-service vulnerability. ADB Basic Statistics can supplement Asia-Pacific reserves, external debt and balance-of-payments context. Missing coverage remains explicit.

### `energy_commodities`

Priority: EIA international energy plus the already-hardened USGS MCS critical-minerals feed. A versioned module methodology is still required before promotion.

### `climate_environment_hazard`

Priority: USGS Earthquake Hazards as a high-integrity real-time hazard source. Other hazard families should be added only through exact-source review rather than a generic NOAA/Copernicus blanket approval.

### `geoeconomic_trade` / `supply_chain_logistics`

UN Comtrade cannot currently be treated as a commercial production source without prior written permission. Eurostat may support a regional subset. JRC RMIS must be re-reviewed at the exact asset level. Do not claim global trade/logistics support until source rights and adapters close.

### `banking_financial_system`

World Bank inputs remain the current production base. BIS can be evaluated as a supplement only after the paid-product reuse boundary is resolved.

### `political_governance`

WGI remains the production base. V-Dem can be evaluated only after the CC BY-SA derivative-output implications are deliberately resolved.

## Commercial output rule

Customer output is Geomacro-derived intelligence, not a raw third-party data resale surface. Even when a source permits redistribution, raw payload exposure is disabled by default unless there is a specific product reason and an explicit rights decision.

Every paid output must remain traceable to source IDs, observations, timestamps, methodology version and calculation hashes while respecting each source's attribution and redistribution boundary.
