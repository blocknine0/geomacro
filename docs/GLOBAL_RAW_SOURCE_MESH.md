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

Each country/category also has a priority-1 coverage anchor maintained by the worker. When a national directory row is absent, the worker creates a governed global fallback target and mesh-filler rows as needed to restore the minimum target matrix. The coverage anchors are selected before normal due-source work, so one unreachable national site cannot make the entire country/category runtime coverage stale.

## Telegram

Telegram is a lead/discovery channel, not an automatic truth source.

Global discovery searches public Telegram channels by country and category and registers candidates as PENDING, disabled, INTERNAL_RESEARCH_ONLY and UNVERIFIED_OWNERSHIP.

Rediscovery never disables an already reviewed channel.

No Telegram item directly becomes GRI, Risk Gate or paid customer truth without the existing independent-corroboration path.

## Licensed providers

Premium providers remain optional redundancy and latency upgrades. Their registry entries stay disabled until credentials and source-specific commercial terms exist.

This prevents the product from waiting for a paid provider before it can observe current developments.

## Self-healing coverage

The country mesh is not dependent on every national directory entry being present or reachable. The worker validates that the authoritative production registry contains exactly 195 enabled canonical countries, ensures a priority-1 fallback anchor exists for GEOPOLITICS, MACRO and CRITICAL_MINERALS for every country, and fills missing target rows up to the governed minimum of 3, 4 and 6 respectively. These fallback rows remain raw-only and `commercial_promotion_allowed=false`.

The runtime gate still requires a recent successful raw target in all three categories for every country. No failure is hidden by changing freshness thresholds, disabling TLS verification, or treating an unreachable upstream source as a success.

## 100% meaning

`live_raw_source_coverage_100_status` means the source-target matrix is complete for all 195 enabled countries and all three top-level categories.

`live_raw_source_runtime_100_status` means each country/category has at least one recently successful raw target inside its category-specific freshness window.

Neither status means every upstream source is commercially licensed. Commercial certification is a separate product gate and remains fail-closed.

## First-break to corridor/hot-topic fanout

Country acquisition is the base observation mesh, but global breaking events need a second-stage scope response. The production path is now:

1. GDELT GAL remains the global first-break backbone. It ingests the rolling global stream and feeds the canonical live structurer.
2. A fresh structured event is matched against every governed strategic corridor and required global shock family.
3. Matching scopes receive a dedicated GDELT burst query with a 15-minute window, the event headline, and the scope-specific corridor/hot-topic terms.
4. Every burst is linked to the triggering structured event and stored as a private, SHA-256 verified, chained fragment.
5. A small set of official operational surfaces is polled continuously for early non-media notices: UKMTO, Suez Canal Authority, Panama Canal Authority, UN Security Council, WHO Disease Outbreak News and WTO news/RSS discovery.
6. Burst cooldown and a bounded per-run fanout cap prevent a single breaking event from turning into an uncontrolled query storm.

This gives all current strategic corridors a dedicated three-category burst target and all required global shock families the same three-category burst target. It is a coverage contract plus an escalation mechanism, not a claim that every event occurring anywhere on the planet can be observed.

## Source roles

The source mesh is intentionally layered:

- global open observation: GDELT GAL and GDELT DOC metadata
- country primary surfaces: national government and statistics/monetary authority pages
- route authority surfaces: canal and maritime-security authorities
- domain authority surfaces: UN, WHO, WTO and equivalent institutional sources
- specialist/paid redundancy: commercial providers such as Dataminr, LSEG, Kpler, Fastmarkets and Argus, enabled only after credentials and rights are proven
- Telegram: discovery/lead signal only, with identity, rights and corroboration gates

The current direct route and domain sources were verified as live official surfaces during the September 2026 source review: UKMTO publishes maritime-security alerts and incident information; the Suez Canal Authority maintains a current navigation-circulars surface; the Panama Canal Authority maintains shipping advisories; the UN Security Council publishes RSS/update resources; WHO publishes Disease Outbreak News; and WTO exposes RSS news feeds. These remain separated from commercial redistribution rights.

## Truth boundary

'100%' in this program means 100% of the governed target universe is represented and checked by machine gates. It does not mean 100% of real-world events, every Telegram message, every webpage, or every human report can be guaranteed. Upstream systems publish at different cadences, can be unavailable, and can omit events.

The production acceptance statement should therefore use:

100% target coverage + fresh global first-break backbone + event-triggered corridor/hot-topic fanout + fail-closed commercial rights

rather than an absolute claim of total global event capture.
