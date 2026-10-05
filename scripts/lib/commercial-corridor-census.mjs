export const CORRIDOR_REGISTRY_VERSION = "geomacro-corridor-registry-v1";
export const CORRIDOR_STABLE_ID_CONTRACT = "ORIGIN_ISO3>DESTINATION_ISO3";
export const CORRIDOR_TYPE = "COUNTRY_PAIR_STRUCTURAL_V1";
export const CORRIDOR_COMPOSITION_METHOD = "ENDPOINT_COMPOSED_V0_1";
export const CORRIDOR_ROUTE_MODELING_STATUS = "NOT_MODELED";
export const CORRIDOR_SCORE_STATUS = "NOT_OFFERED_UNTIL_APPROVED_METHODOLOGY";
export const CORRIDOR_MISSING_ROUTE_BEHAVIOR = "EXPLICIT_UNAVAILABLE_OR_DEGRADED";

function integer(value, label) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new Error(`CORRIDOR_CENSUS_${label}_INVALID:${String(value)}`);
  }
  return n;
}

function exact(value, expected, label) {
  const actual = String(value ?? "").trim();
  if (actual !== expected) {
    throw new Error(`CORRIDOR_CENSUS_${label}_MISMATCH:${actual || "empty"}`);
  }
  return actual;
}

export function validateCommercialCorridorCensus(row, { minimumCountries = 195 } = {}) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new Error("CORRIDOR_CENSUS_ROW_REQUIRED");
  }

  const enabledCountryCount = integer(row.enabled_country_count, "ENABLED_COUNTRY_COUNT");
  const supportedDirectedPairCount = integer(
    row.supported_directed_pair_count,
    "SUPPORTED_DIRECTED_PAIR_COUNT",
  );
  const invalidEnabledIso3Rows = integer(row.invalid_enabled_iso3_rows, "INVALID_ISO3_ROWS");
  const namedStrategicCorridorCount = integer(
    row.named_strategic_corridor_count,
    "NAMED_STRATEGIC_CORRIDOR_COUNT",
  );
  const namedRouteDataPromotedRows = integer(
    row.named_route_data_promoted_rows,
    "NAMED_ROUTE_DATA_PROMOTED_ROWS",
  );
  const requiredPairs = enabledCountryCount * Math.max(enabledCountryCount - 1, 0);

  exact(row.registry_version, CORRIDOR_REGISTRY_VERSION, "REGISTRY_VERSION");
  exact(row.stable_id_contract, CORRIDOR_STABLE_ID_CONTRACT, "STABLE_ID_CONTRACT");
  exact(row.corridor_type, CORRIDOR_TYPE, "CORRIDOR_TYPE");
  exact(row.composition_method, CORRIDOR_COMPOSITION_METHOD, "COMPOSITION_METHOD");
  exact(row.route_modeling_status, CORRIDOR_ROUTE_MODELING_STATUS, "ROUTE_MODELING_STATUS");
  exact(row.corridor_score_status, CORRIDOR_SCORE_STATUS, "CORRIDOR_SCORE_STATUS");
  exact(
    row.missing_route_evidence_behavior,
    CORRIDOR_MISSING_ROUTE_BEHAVIOR,
    "MISSING_ROUTE_EVIDENCE_BEHAVIOR",
  );

  if (enabledCountryCount < minimumCountries) {
    throw new Error(
      `CORRIDOR_CENSUS_COUNTRY_FLOOR_NOT_MET:${enabledCountryCount}<${minimumCountries}`,
    );
  }
  if (invalidEnabledIso3Rows !== 0) {
    throw new Error(`CORRIDOR_CENSUS_INVALID_ENABLED_ISO3:${invalidEnabledIso3Rows}`);
  }
  if (supportedDirectedPairCount !== requiredPairs) {
    throw new Error(
      `CORRIDOR_CENSUS_PAIR_COUNT_MISMATCH:${supportedDirectedPairCount}!=${requiredPairs}`,
    );
  }
  if (namedRouteDataPromotedRows !== 0) {
    throw new Error(`CORRIDOR_CENSUS_UNCERTIFIED_ROUTE_PROMOTION:${namedRouteDataPromotedRows}`);
  }
  if (row.commercial_corridor_registry_complete !== true) {
    throw new Error("CORRIDOR_CENSUS_DATABASE_GATE_NOT_COMPLETE");
  }

  return {
    ok: true,
    registry_version: CORRIDOR_REGISTRY_VERSION,
    stable_id_contract: CORRIDOR_STABLE_ID_CONTRACT,
    corridor_type: CORRIDOR_TYPE,
    enabled_country_count: enabledCountryCount,
    supported_directed_pair_count: supportedDirectedPairCount,
    invalid_enabled_iso3_rows: invalidEnabledIso3Rows,
    named_strategic_corridor_count: namedStrategicCorridorCount,
    named_route_data_promoted_rows: namedRouteDataPromotedRows,
    composition_method: CORRIDOR_COMPOSITION_METHOD,
    route_modeling_status: CORRIDOR_ROUTE_MODELING_STATUS,
    corridor_score_status: CORRIDOR_SCORE_STATUS,
    missing_route_evidence_behavior: CORRIDOR_MISSING_ROUTE_BEHAVIOR,
    route_scores_authorized: false,
    synthetic_route_evidence_allowed: false,
  };
}
