/** Public product capability, NOT a source catalogue.
 * Private provider IDs, original URLs, publisher names, attributable
 * identifiers, lane counts and internal source receipts stay server-side.
 * Neither a public API nor a browser bundle may import private source
 * catalogue JSON merely to show monitoring status.
 */
export type CommercialIntelligenceCategory =
  | "geopolitics"
  | "macro-fx"
  | "critical-minerals";

const CATEGORY_PATHS = Object.freeze({
  geopolitics: "/api/v1/intelligence/geopolitics",
  "macro-fx": "/api/v1/intelligence/macro-fx",
  "critical-minerals": "/api/v1/intelligence/critical-minerals",
});

export function publicIntelligenceSourceCoverage(category: CommercialIntelligenceCategory) {
  // Reject inherited JS property names at runtime; only these exact three
  // commercial categories may be surfaced through the public capability.
  if (!Object.prototype.hasOwnProperty.call(CATEGORY_PATHS,category)) {
    throw new Error("INTELLIGENCE_CATEGORY_INVALID");
  }
  const path = CATEGORY_PATHS[category];
  return {
    schema: "geomacro.public-intelligence-monitoring-capability.v1",
    category,
    // Intentionally omit names, URLs, internal source IDs, source-count
    // inventories, provider-origin evidence receipt and contributor lists.
    source_identity_disclosed: false,
    raw_third_party_content_delivered: false,
    monitoring_is_not_scored_intelligence: true,
    current_event_observed_by_this_catalog: false,
    current_scored_intelligence_from_this_catalog: false,
    intelligence_delivery_mode: "EXISTING_VERIFIED_RISK_OBJECT_GATE_ONLY",
    intelligence_query_method: "POST",
    intelligence_query_path: path,
    requires_independent_paid_availability: true,
    paid_intelligence_authorized_by_catalog: false,
  };
}

export const PUBLIC_SOURCE_COVERAGE_DOMAINS = ([
  { key: "geopolitics", label: "Geopolitics" },
  { key: "macro-fx", label: "Macro / FX" },
  { key: "critical-minerals", label: "Critical minerals" },
] as const).map(({ key, label }) => ({
  ...publicIntelligenceSourceCoverage(key),
  label,
})) as ReadonlyArray<ReturnType<typeof publicIntelligenceSourceCoverage> & { label: string }>;
