# Critical Minerals Evidence Layer v1

## Evidence model

The minerals engine keeps these claims separate:

- PRODUCTION: country commodity production.
- WORLD_PRODUCTION_BASELINE: global/current commodity baseline.
- FACILITY: named facility and capacity.
- TRADE_EXPORT: reporter exports.
- TRADE_IMPORT: reporter imports.
- TRADE_BALANCE: exports minus imports for the exact query scope.
- DISRUPTION: event or operational disruption.
- POLICY: government policy or regulatory event.
- EARLY_SIGNAL: unconfirmed signal.

A trade flow is never converted into production.

## Current authoritative baselines

USGS 2024 Minerals Yearbook provides country production/facility data for 2020-2024 and covers more than 150 countries. The 2026 Mineral Commodity Summaries provides world production statistics for more than 90 nonfuel mineral commodities.

## Country coverage rule

The global mesh still requires 195 countries. USGS coverage is evidence coverage, not a guarantee that every country has a reported value. Missing, zero, and withheld must remain distinguishable.

## Reconciliation

Reconciliation joins only on country + commodity + period + compatible evidence scope. Results preserve conflicts and scope gaps rather than averaging incompatible measures.

## HS rule

HS2022 codes are maintained as a governed taxonomy. Ambiguous shared headings are flagged and cannot be used for mineral-specific claims until reviewed. Historical periods must declare their HS edition and use an explicit concordance before cross-edition comparison.

## Next runtime requirements

1. Discover and pin actual USGS MCS 2026 machine-readable asset URLs.
2. Probe the MCS parser against real files.
3. Populate 195-country coverage cells with evidence availability, not fabricated values.
4. Add BGS and national mineral authority adapters.
5. Add Telegram disruption and policy evidence.
6. Run conflict and freshness certification.
