# Global Raw Source Mesh

Geomacro's raw acquisition layer is deliberately independent from commercial licensing.

## Coverage contract

The canonical enabled-country registry contains 195 countries. Each country has a governed raw acquisition mesh across:

- GEOPOLITICS
- MACRO
- CRITICAL_MINERALS

The minimum raw mesh is:

- GEOPOLITICS: national government web, country-filtered GDELT fallback, Telegram public-channel discovery
- MACRO: national statistics office, monetary authority, World Bank country API fallback, Telegram macro discovery
- CRITICAL_MINERALS: RMIS country profile, USGS minerals baseline, BGS world-minerals fallback, USGS minerals news, national government minerals/policy discovery, Telegram minerals discovery

This produces at least 13 raw targets per enabled country.

## Raw versus commercial

A source can be publicly reachable and useful for internal discovery before Geomacro has the rights required for commercial redistribution or paid scoring.

Raw acquisition records source URL, retrieval timestamp, response metadata, immutable private snapshot hash, normalized private fragment, source-domain provenance, and per-target health/freshness.

Commercial customer delivery remains independently gated by source rights, adapter, schema, freshness, provenance, independence and runtime certification.

## Realtime operation

The global-country-raw-source-mesh workflow runs every five minutes against the authoritative production Supabase project.

The worker selects due country targets, fetches official web/API/global fallback sources concurrently, stores private raw snapshots, verifies storage by SHA-256 readback, creates chained normalized evidence fragments, directly invokes the canonical live structurer for new fragments, records target health, and fails the runtime coverage audit when recent successful raw acquisition is missing.

The system does not assume every upstream source is always reachable. Redundancy is the coverage mechanism.

## Telegram

Telegram is a lead/discovery channel, not an automatic truth source.

Global discovery searches public Telegram channels by country and category and registers candidates as PENDING, disabled, INTERNAL_RESEARCH_ONLY and UNVERIFIED_OWNERSHIP.

Rediscovery never disables an already reviewed channel.

No Telegram item directly becomes GRI, Risk Gate or paid customer truth without the existing independent-corroboration path.

## Licensed providers

Premium providers remain optional redundancy and latency upgrades. Their registry entries stay disabled until credentials and source-specific commercial terms exist.

This prevents the product from waiting for a paid provider before it can observe current developments.

## 100% meaning

`live_raw_source_coverage_100_status` means the source-target matrix is complete for all 195 enabled countries and all three top-level categories.

`live_raw_source_runtime_100_status` means each country/category has at least one recently successful raw target inside its category-specific freshness window.

Neither status means every upstream source is commercially licensed. Commercial certification is a separate product gate and remains fail-closed.