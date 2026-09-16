# Sovereign Fiscal Source Expansion Toward 100 Countries

**Status:** implementation / source-discovery gate  
**Review date:** 2026-09-16

## Goal

Raise Geomacro's measured production Risk Gate country coverage from the current 26-country baseline toward at least 100 sovereigns without lowering existing quality, freshness, peer-universe, source-rights or payment gates.

The number 100 is a target, not an allowlist. A country becomes payable only after the production census proves all required modules are deliverable under the active methodology.

## Why a multi-source stack is required

No single currently promoted sovereign-fiscal series provides enough fresh, definitionally comparable observations to cover 100 sovereigns. The production path therefore uses source-specific metric families and regional supplements rather than pretending unlike debt concepts are interchangeable.

## Newly reviewed candidate paths

### World Bank WDI + International Debt Statistics

The live audit measures six open-data indicators separately:

- central government debt, total (% GDP) — `GC.DOD.TOTL.GD.ZS`
- cash surplus/deficit (% GDP) — `GC.BAL.CASH.GD.ZS`
- revenue excluding grants (% GDP) — `GC.REV.XGRT.GD.ZS`
- expense (% GDP) — `GC.XPN.TOTL.GD.ZS`
- external debt stocks (% GNI) — `DT.DOD.DECT.GN.ZS`
- total debt service (% exports) — `DT.TDS.DECT.EX.ZS`

These are not collapsed into one raw debt series. Fiscal-flow, fiscal-capacity, debt-stock, external-debt and debt-service concepts remain distinct inputs. World Bank dataset terms are generally CC BY 4.0 unless a dataset is specifically labelled otherwise; exact indicator provenance and third-party exceptions remain binding.

### Inter-American Development Bank

Candidate: **Latin America and the Caribbean Standardized Public Debt Database, December 2024**.

- documented coverage: 26 LAC countries
- publisher: Inter-American Development Bank / LAC Debt Group
- licence shown by the dataset: CC BY 4.0
- source data are submitted by participating debt-management offices through a standardized questionnaire
- central-government/public-debt concepts must be mapped field-by-field before any scoring activation

This is a strong candidate for filling Latin American and Caribbean sovereign-debt gaps because it is purpose-built for cross-country debt comparability, but it is not yet a production fallback.

### Asian Development Bank

Candidate: **Basic Statistics 2026, Asia and the Pacific** plus exact ADB Key Indicators/ADO government-finance datasets where needed.

- documented coverage: 47 Asia-Pacific economies in Basic Statistics 2026
- includes government finance, fiscal balance and external debt families
- ADB Data Library terms state data are generally CC BY 3.0 IGO unless otherwise indicated and permit commercial use with attribution
- exact sovereign mapping, indicator definitions and any third-party-content exclusions must be verified before production scoring

### Eurostat

Existing regional candidate: **Quarterly government debt (`gov_10q_ggdebt`)**.

- covers EU Member States plus Iceland and Norway
- general-government Maastricht debt is definitionally coherent within the dataset
- it remains a separate general-government peer universe and is never raw-pooled with central-government or public-sector debt concepts

## Methodology direction

The next sovereign-fiscal methodology must be versioned and source-aware. It may combine **derived risk components** only after each component is normalized inside a definitionally coherent peer universe. Raw observations from central government, general government, public sector and external debt are never pooled as if they were the same measure.

A candidate country can proceed to shadow scoring only when:

1. source rights for the exact dataset/field are recorded;
2. the observation is current within its source-specific cadence;
3. provenance, release/version and source record identity are preserved;
4. at least the existing minimum peer requirement is satisfied inside that exact concept;
5. enough independent fiscal/debt evidence exists for the versioned module contract;
6. confidence and missing-data handling remain fail-closed.

## Production sequence

1. Run the no-write multi-source coverage audit and measure live overlap.
2. Map candidate observations to the authoritative Geomacro sovereign registry.
3. Promote only exact source contracts whose rights and metadata pass review.
4. Implement deterministic adapters with source-specific normalized observations and hashes.
5. Run shadow scoring with no payability change.
6. Compare the new module against the current 26-country production baseline.
7. Ingest promoted datasets and run the full global production census.
8. Accept a country only if all required modules pass; otherwise return `INSUFFICIENT_COVERAGE` and do not charge.

## Payment and claim boundary

This source-expansion work cannot by itself make a country payable. It cannot open Base mainnet, change the x402 price, weaken freshness, lower peer thresholds, reinterpret missing data as zero risk or activate a source with unresolved commercial rights.

Production claims must always use the latest measured census rather than the target number.
