# Global Source Coverage Contract

Status: internal engineering contract. This document defines the complete coverage graph and its fail-closed handoff into later source certification. It is not a statement that every source is currently certified or every subject is currently payable.

## Canonical country/area layer

The country track is generated from `public.live_country_registry`, not a hard-coded payment allowlist. Every enabled canonical ISO/area record is expanded across all 16 required Risk Gate v2 modules.

When the canonical registry gains a new enabled country/area, a database trigger creates its 16 module target rows automatically.

## Required 16 intelligence modules

1. `geopolitical_security`
2. `geoeconomic_trade`
3. `political_governance`
4. `sovereign_fiscal`
5. `macro_monetary`
6. `currency_capital_mobility`
7. `banking_financial_system`
8. `payments_treasury`
9. `supply_chain_logistics`
10. `energy_commodities`
11. `regulatory_legal`
12. `infrastructure_cyber_technology`
13. `climate_environment_hazard`
14. `societal_labor_health`
15. `information_influence`
16. `emerging_long_tail`

Each module has a primary source path, fallback path, minimum two independent paths requirement and a freshness ceiling. Exact source rights and endpoint behavior remain governed by the certification queue.

## Required 24 regional zones

The regional track is a monitoring overlay. Zones may overlap for analytical purposes; they are not a claim that every country belongs to only one operational region.

1. North America
2. Central America
3. Caribbean
4. South America
5. Northern Europe
6. Western Europe
7. Southern Europe
8. Eastern Europe
9. Balkans
10. Russia & Belarus
11. Caucasus
12. Central Asia
13. Middle East
14. North Africa
15. West Africa
16. Central Africa
17. East Africa & Horn
18. Southern Africa
19. South Asia
20. Southeast Asia
21. East Asia
22. Australia & New Zealand
23. Pacific Islands
24. Arctic & Antarctic

Every zone is expanded across all 16 modules and has a regional-primary plus regional-fallback source path.

## Strategic corridor catalogue

The current contract contains 35 strategic corridor/chokepoint monitoring entities covering maritime chokepoints, intermodal/trade land routes, energy routes and subsea digital-connectivity routes.

Every corridor is expanded across all 16 modules. In addition to the module primary/fallback paths, each corridor has a route-primary and route-fallback path. Route-specific data remains `NOT_YET_CERTIFIED` until the exact route source contract is proven.

## Expanded global shock taxonomy

The current governed shock layer contains 36 families spanning:

- armed conflict and ceasefire change;
- sanctions, embargoes and export controls;
- tariffs and trade restrictions;
- elections, coups and civil unrest;
- monetary, inflation, FX and sovereign-fiscal shocks;
- banking and payments disruption;
- energy, electricity, food, fertilizer and critical-mineral disruption;
- shipping, chokepoint, logistics, border and transit disruption;
- natural hazards, climate, water and heat stress;
- public health, migration and workforce shocks;
- cyber, telecom, subsea cable and GNSS disruption;
- regulatory/legal and investment-screening shocks;
- information influence/disinformation;
- insurance withdrawal and war-risk repricing;
- expropriation/nationalization;
- technology/semiconductor export controls;
- capital controls/convertibility;
- rare-material long-tail supply shocks.

Every required shock family is mapped to at least one of the 16 modules and has primary/fallback detection paths.

## Certification queue

`public.live_source_certification_queue` is the controlled handoff table.

Every required country/module source path, every regional module path, every corridor module/route path and every shock/module path is represented in the queue.

All rows begin with:

- `certification_state = QUEUED`
- `fail_closed = true`
- `endpoint_check = PENDING`
- `rights_check = PENDING`
- `schema_check = PENDING`
- `freshness_check = PENDING`
- `independence_check = PENDING`

This phase intentionally does not advance those states.

## Completeness invariant

`public.live_global_coverage_design_status` is the single internal structural gate.

`design_complete = true` requires:

- exactly 16 required modules;
- exactly 24 regional zones;
- exactly 35 strategic corridors;
- exactly 36 required shock families;
- zero unmapped required shocks;
- country × 16 row count equals the enabled canonical country/area universe × 16;
- region × 16 row count equals 24 × 16;
- corridor × 16 row count equals 35 × 16;
- certification queue row count equals every required primary/fallback/route path represented;
- no queue row has been advanced out of its initial fail-closed state.

This is a **coverage-design completeness** signal only.

`certification_gate_open` and `testing_gate_open` remain hard-coded false in this contract and must be opened only by a later, separately reviewed phase.

## Operator command

Run:

`node scripts/audit-global-coverage-contract.mjs`

The audit exits non-zero on any structural coverage gap. It does not certify a source or enable any commercial signal.
