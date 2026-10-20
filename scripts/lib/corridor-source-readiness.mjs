// Read-only coverage census for the existing named-corridor discovery overlay.
// Local crosswalk membership is NOT evidence of a working publisher, route
// geometry, customer delivery or commercial rights. Never fetch raw sources.
const SCHEMA = "geomacro.operator-corridor-source-crosswalk.v1";
const CATEGORIES = ["geopolitics", "macro_fx", "critical_minerals"];
export function buildNamedCorridorSourceReadiness(catalog) {
  if (!catalog || catalog.schema !== SCHEMA ||
      !Array.isArray(catalog.source_registry) || !Array.isArray(catalog.corridors))
    throw Error("CORRIDOR_CATALOG_INVALID");
  const registry = new Map();
  for (const source of catalog.source_registry) {
    if (typeof source.source_id !== "string" || !/^[a-z0-9_]{3,100}$/.test(source.source_id) ||
        registry.has(source.source_id) || typeof source.activation_status !== "string" ||
        typeof source.transport_tested !== "boolean" ||
        typeof source.commercial_licence_verified !== "boolean")
      throw Error("CORRIDOR_SOURCE_ENTRY_INVALID");
    registry.set(source.source_id, source);
  }
  const seenRoutes = new Set(), externalRefs = new Set();
  let referencesTotal = 0, localReferences = 0, externalReferences = 0;
  const routes = [];
  for (const route of catalog.corridors) {
    if (typeof route.id !== "string" || !/^[a-z0-9_]{3,100}$/.test(route.id) ||
        seenRoutes.has(route.id) || !Array.isArray(route.monitor_refs) ||
        !Array.isArray(route.country_iso3) ||
        !route.country_iso3.every(x => typeof x === "string" && /^[A-Z]{3}$/.test(x)) ||
        !Array.isArray(route.category_tags) ||
        !route.category_tags.every(x => CATEGORIES.includes(x)))
      throw Error("CORRIDOR_ROUTE_ENTRY_INVALID");
    seenRoutes.add(route.id);
    const local = [], external = [];
    for (const ref of route.monitor_refs) {
      const id = ref?.source_id;
      if (typeof id !== "string" || !/^[a-z0-9_]{3,100}$/.test(id))
        throw Error("CORRIDOR_MONITOR_REFERENCE_INVALID");
      referencesTotal++;
      if (registry.has(id)) {
        localReferences++;
        local.push(id);
      } else {
        externalReferences++;
        externalRefs.add(id);
        external.push(id);
      }
    }
    routes.push({
      corridor_id: route.id, country_iso3: route.country_iso3.slice(),
      category_tags: route.category_tags.slice(),
      analyst_priority_unverified: route.criticality_analyst_unverified ?? null,
      monitor_references: route.monitor_refs.length,
      sources_in_this_overlay: local,
      references_outside_this_overlay: external,
      local_transport_tested_count: local.filter(id => registry.get(id).transport_tested).length,
      verified_live_route_evidence: false, route_geometry_certified: false,
      commercial_rights_proven_for_route: false, signed_corridor_delivery: false
    });
  }
  routes.sort((a,b) =>
    (Number(b.analyst_priority_unverified)||0)-(Number(a.analyst_priority_unverified)||0) ||
    a.corridor_id.localeCompare(b.corridor_id));
  return {
    schema: "geomacro.named-corridor-source-readiness.v1",
    input_as_of: catalog.as_of ?? null,
    registry_source_count: registry.size, named_corridor_count: routes.length,
    monitor_references_total: referencesTotal,
    monitor_refs_in_local_source_overlay: localReferences,
    monitor_refs_outside_local_source_overlay: externalReferences,
    distinct_external_overlay_reference_ids: [...externalRefs].sort(),
    existing_family_reuse_source_count: [...registry.values()].filter(s =>
      s.activation_status === "EXISTING_FAMILY_REUSE_NO_NEW_POLLER").length,
    source_entries_with_transport_tested: [...registry.values()].filter(s => s.transport_tested).length,
    source_entries_with_commercial_licence_verified: [...registry.values()].filter(s => s.commercial_licence_verified).length,
    routes_with_no_local_source_reference: routes.filter(r => r.sources_in_this_overlay.length === 0).length,
    routes_with_cross_overlay_references: routes.filter(r => r.references_outside_this_overlay.length > 0).length,
    live_route_geometry_and_flow_certified: 0,
    paid_named_corridor_delivery_verified: 0,
    external_overlay_refs_are_not_proven_missing_globally: true,
    no_upstream_network_requests: true, no_raw_publisher_content: true,
    no_supabase: true, no_b2: true, no_d1_writes: true, no_payments: true,
    route_worklist: routes
  };
}
