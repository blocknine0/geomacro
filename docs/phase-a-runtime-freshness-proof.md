# Phase A runtime freshness production proof

The acceptance target is dynamic: `enabled_country_registry_count * 3`.

The production repair run must prove all of the following in the same run:

- direct PostgreSQL connectivity to the authoritative Supabase project without REST egress dependency;
- observed success from the exact GDELT, World Bank, and USGS fallback endpoints;
- B2 evidence upload and SHA-256 readback equality;
- eligible evidence-graph certification for all three fallback source contracts;
- one canonical fallback target per enabled country/area and domain;
- `production_ready_rows == expected_matrix_rows`;
- zero unavailable, invalid-ready, invalid-fallback, duplicate, or unexplained non-ready rows;
- payment and settlement remain disabled by this workflow.

On 2026-10-02 the production matrix independently verified 250 enabled registry rows x 3 domains = 750 rows, with 750 production-ready rows and zero unavailable rows after the repair path completed.
