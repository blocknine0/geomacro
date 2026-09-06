export const GLOBAL_PUBLICATION_COVERAGE_VERSION =
  "global-publication-coverage-v0.1.0" as const;

export type GlobalEntityScope =
  | "SOVEREIGN"
  | "TERRITORY"
  | "SPECIAL_ENTITY"
  | "UNCLASSIFIED";

export type CurrentEventCoverageStatus =
  | "FULL"
  | "PARTIAL"
  | "SPARSE"
  | "NO_CURRENT_SIGNAL";

export type CriticalMineralsCoverageStatus =
  | "AVAILABLE"
  | "NOT_APPLICABLE"
  | "UNKNOWN";

export type GlobalPublicationCoverageInput = {
  country_iso3: string;
  entity_scope: GlobalEntityScope;
  macro_available: boolean;
  geopolitics_available: boolean;
  current_event_coverage: CurrentEventCoverageStatus;
  critical_minerals: CriticalMineralsCoverageStatus;
};

export type GlobalPublicationCoverageResult = {
  version:
    typeof GLOBAL_PUBLICATION_COVERAGE_VERSION;

  country_iso3: string;

  entity_scope:
    GlobalEntityScope;

  structural_risk_available:
    boolean;

  gro_v02_available:
    boolean;

  included_in_primary_global_gate:
    boolean;

  event_coverage_usable:
    boolean;

  critical_minerals_blocks_gro:
    false;

  reason_codes:
    string[];
};

function normalizeIso3(
  value: string,
): string {
  const iso3 =
    value
      .trim()
      .toUpperCase();

  if (
    !/^[A-Z]{3}$/.test(
      iso3,
    )
  ) {
    throw new Error(
      "country_iso3 must be ISO3",
    );
  }

  return iso3;
}

export function evaluateGlobalPublicationCoverage(
  input: GlobalPublicationCoverageInput,
): GlobalPublicationCoverageResult {
  const countryIso3 =
    normalizeIso3(
      input.country_iso3,
    );

  const reasons:
    string[] = [];

  /*
   * Structural intelligence is distinct
   * from GRO publication eligibility.
   *
   * At least one usable structured domain
   * is enough for structural intelligence.
   */
  const structuralRiskAvailable =
    input.macro_available ||
    input.geopolitics_available;

  /*
   * GRO v0.2 requires usable current-event
   * evidence.
   *
   * FULL and PARTIAL are usable.
   * SPARSE and NO_CURRENT_SIGNAL fail closed.
   */
  const eventCoverageUsable =
    input.current_event_coverage ===
      "FULL" ||
    input.current_event_coverage ===
      "PARTIAL";

  /*
   * The primary global publication
   * denominator currently contains
   * sovereign entities only.
   *
   * Territories and special entities can
   * still expose intelligence separately.
   */
  const includedInPrimaryGlobalGate =
    input.entity_scope ===
      "SOVEREIGN";

  /*
   * Critical minerals are deliberately
   * non-blocking for GRO v0.2.
   *
   * Their dependency/concentration model
   * is not yet versioned into GRO.
   */
  const groAvailable =
    includedInPrimaryGlobalGate &&
    input.macro_available &&
    input.geopolitics_available &&
    eventCoverageUsable;

  if (!structuralRiskAvailable) {
    reasons.push(
      "no_structured_risk_domain_available",
    );
  }

  if (!input.macro_available) {
    reasons.push(
      "macro_component_unavailable",
    );
  }

  if (!input.geopolitics_available) {
    reasons.push(
      "geopolitics_component_unavailable",
    );
  }

  if (!eventCoverageUsable) {
    reasons.push(
      input.current_event_coverage ===
        "NO_CURRENT_SIGNAL"
        ? "current_event_component_unavailable"
        : "current_event_coverage_insufficient",
    );
  }

  if (
    input.entity_scope ===
      "UNCLASSIFIED"
  ) {
    reasons.push(
      "entity_scope_unclassified",
    );
  }

  if (
    !includedInPrimaryGlobalGate
  ) {
    reasons.push(
      "outside_primary_sovereign_publication_gate",
    );
  }

  if (
    input.critical_minerals ===
      "UNKNOWN"
  ) {
    reasons.push(
      "critical_minerals_applicability_unknown_nonblocking",
    );
  }

  if (
    input.critical_minerals ===
      "NOT_APPLICABLE"
  ) {
    reasons.push(
      "critical_minerals_not_applicable_nonblocking",
    );
  }

  return {
    version:
      GLOBAL_PUBLICATION_COVERAGE_VERSION,

    country_iso3:
      countryIso3,

    entity_scope:
      input.entity_scope,

    structural_risk_available:
      structuralRiskAvailable,

    gro_v02_available:
      groAvailable,

    included_in_primary_global_gate:
      includedInPrimaryGlobalGate,

    event_coverage_usable:
      eventCoverageUsable,

    critical_minerals_blocks_gro:
      false,

    reason_codes:
      reasons,
  };
}
