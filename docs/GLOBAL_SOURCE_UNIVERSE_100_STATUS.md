# Global Source Universe 100% Inventory Status

## Scope

This document records the internal source-inventory completion milestone requested for Geomacro global intelligence.

This milestone means that the planned coverage universe has an explicit source inventory. It does **not** mean every endpoint, dataset licence, schema, freshness path, commercial reuse right, collector or runtime decision path has been certified.

## Completed inventory dimensions

| Dimension | Inventory |
|---|---:|
| Canonical enabled country/area backbone | Runtime registry driven |
| National government/official portal directory | 195 |
| National statistics office directory | 194 |
| National/shared monetary authority directory | 195 |
| Broad regional zones | 24 |
| Operational subzones | 39 |
| Strategic corridors/chokepoints | 35 |
| Broad global shock families | 36 |
| Granular operational shock conditions | 110 |
| Specialist global source additions in this phase | 20 + category-specific mineral sources |
| Broad region module paths | 24 × 16 |
| Corridor module paths | 35 × 16 |
| Granular shock source paths | 110 × 3 |
| Subzone source paths | 39 × 3 |

## Country source layers

Every country in the 195-country baseline has a government/official portal discovery record and a monetary-authority discovery record.

The statistical-office directory contains 194 records because the external statistical-office census does not expose a dedicated national statistical office for the Vatican City baseline. Euro-area, regional currency-union and dollarized jurisdictions are represented through their applicable monetary-system authority or a fail-closed fallback.

## Regional and corridor layers

The original 24-zone and 35-corridor contracts remain intact. The additional 39 subzones provide finer operational geography without replacing the canonical 24-zone layer.

Corridor inventory now has route-specific operator/authority candidates for maritime chokepoints, land/intermodal corridors, energy routes and subsea connectivity.

## Shock layers

The original 36 broad shock families remain the primary governed taxonomy.

A separate granular inventory contains 110 operational conditions, including distinct security, maritime, aviation, energy, infrastructure, cyber, financial, payments, health, migration, food, climate, critical-mineral and regulatory disruption conditions.

Granular conditions deliberately do not bypass the broad taxonomy or existing Risk Gate methodology. They provide a richer discovery/source layer for later governed classification.

## Specialist source families

The source registry now includes dedicated candidates for oil transparency, desert locusts, animal disease, nuclear/radiological events, meteorological data, humanitarian data, food security, European electricity systems, OPEC, Internet outages, BGP routing, maritime safety/security, aviation operations, emergency Earth observation, space weather and volcanic hazards.

## Fail-closed boundary

All newly discovered country, monetary, regional, subzone, corridor and specialist sources remain discovery/certification candidates.

No new source is promoted to commercial intelligence merely because it is registered.

Endpoint, rights, schema, freshness, provenance and independent-source-family certification remain separate gates.

Production testing remains closed until the source-inventory phase is deliberately handed off to certification.

## Master operator view

Use: public.live_global_source_inventory_100_status

The expected state for this inventory milestone is:

- source_inventory_100_complete = true
- endpoint_certification_complete = false
- rights_certification_complete = false
- runtime_testing_complete = false

This distinction is intentional and required for production safety.


## Critical Minerals category

The Critical Minerals source inventory is now explicit at every requested layer: 195 country profiles with USGS and BGS baselines; dedicated national mineral/geoscience sources where catalogued; 24 regional mineral paths; 35 corridor mineral paths; and 43 dedicated critical-minerals shock conditions with three source paths each. The current IEA Critical Minerals Dataset 2026 is registered separately from the legacy review-gated IEA source.
