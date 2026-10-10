import intakeReceipt from "../../config/public-intelligence-source-intake-coverage.v1.json";

export type CommercialIntelligenceCategory =
  | "geopolitics"
  | "macro-fx"
  | "critical-minerals";

const CATEGORY_PATHS = Object.freeze({
  geopolitics: "/api/v1/intelligence/geopolitics",
  "macro-fx": "/api/v1/intelligence/macro-fx",
  "critical-minerals": "/api/v1/intelligence/critical-minerals",
});

function exactSourceReceipt() {
  if (
    intakeReceipt.schema !== "geomacro.public-source-intake-coverage.v1" ||
    intakeReceipt.source_receipt.catalog_mode !== "PINNED_SANITIZED_REPOSITORY_SNAPSHOT" ||
    intakeReceipt.source_receipt.latest_private_repo_sync_verified !== false ||
    intakeReceipt.source_receipt.realtime_event_publication_verified !== false ||
    intakeReceipt.totals.catalog_entries !==
      Object.values(intakeReceipt.domains).reduce((sum, domain) => sum + domain.total, 0) ||
    intakeReceipt.totals.telegram_authorized_in_snapshot !== 0
  ) throw new Error("SOURCE_INTAKE_PUBLIC_RECEIPT_INVALID");

  for (const domain of Object.values(intakeReceipt.domains)) {
    if (
      domain.total !== domain.core + domain.free + domain.governed_roots +
        domain.telegram_candidates + domain.historical_sources ||
      !Object.values(domain).every((field) =>
        typeof field === "string" || (Number.isSafeInteger(field) && field >= 0))
    ) throw new Error("SOURCE_INTAKE_PUBLIC_CATEGORY_TOTAL_INVALID");
  }

  if (!Number.isFinite(Date.parse(intakeReceipt.source_receipt.observed_at))) {
    throw new Error("SOURCE_INTAKE_PUBLIC_OBSERVATION_CLOCK_INVALID");
  }
  return intakeReceipt;
}

/**
 * A tiny public aggregate for monitoring DISCOVERY COVERAGE ONLY.
 * 778 entries are not 778 publishers, real events or paid-ready scores.
 * New country/macro/minerals risk records are served only by the pre-existing
 * independently verified current B2/D1/GRO-backed intelligence engine.
 */
export function publicIntelligenceSourceCoverage(category: CommercialIntelligenceCategory) {
  const receipt = exactSourceReceipt();
  const domain = receipt.domains[category];
  const observedAt = receipt.source_receipt.observed_at;
  return {
    schema: receipt.schema,
    category,
    catalogued_entries: domain.total,
    catalogued_by_lane: {
      canonical_registry: domain.core,
      free_catalog: domain.free,
      governed_official_discovery_roots: domain.governed_roots,
      telegram_candidates_unapproved: domain.telegram_candidates,
      historical_evidence_sources: domain.historical_sources,
    },
    catalogued_as_of: observedAt,
    evidence_receipt_url: receipt.source_receipt.workflow_run_url,
    catalog_mode: receipt.source_receipt.catalog_mode,
    current_private_repository_sync_verified: false,
    current_event_observed_by_this_catalog: false,
    current_scored_intelligence_from_this_catalog: false,
    catalog_entry_is_distinct_publisher: false,
    source_catalog_snapshot_automatically_updates_this_api: false,
    catalog_review_cadence: receipt.refresh_policy.source_catalog,
    intelligence_delivery_mode: "EXISTING_VERIFIED_RISK_OBJECT_GATE_ONLY",
    intelligence_query_method: "POST",
    intelligence_query_path: CATEGORY_PATHS[category],
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
