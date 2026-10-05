import { describe, expect, it } from "vitest";
import {
  validateCommercialCorridorCensus,
} from "../../scripts/lib/commercial-corridor-census.mjs";

const valid = {
  registry_version: "geomacro-corridor-registry-v1",
  stable_id_contract: "ORIGIN_ISO3>DESTINATION_ISO3",
  corridor_type: "COUNTRY_PAIR_STRUCTURAL_V1",
  enabled_country_count: 250,
  supported_directed_pair_count: 250 * 249,
  invalid_enabled_iso3_rows: 0,
  named_strategic_corridor_count: 35,
  named_route_data_promoted_rows: 0,
  composition_method: "ENDPOINT_COMPOSED_V0_1",
  route_modeling_status: "NOT_MODELED",
  corridor_score_status: "NOT_OFFERED_UNTIL_APPROVED_METHODOLOGY",
  missing_route_evidence_behavior: "EXPLICIT_UNAVAILABLE_OR_DEGRADED",
  commercial_corridor_registry_complete: true,
};

describe("#1414 commercial corridor census gate", () => {
  it("accepts the full enabled-country directed pair universe without route-score claims", () => {
    expect(validateCommercialCorridorCensus(valid)).toMatchObject({
      ok: true,
      enabled_country_count: 250,
      supported_directed_pair_count: 62250,
      route_scores_authorized: false,
      synthetic_route_evidence_allowed: false,
    });
  });

  it("fails closed below the 195-country launch floor", () => {
    expect(() => validateCommercialCorridorCensus({
      ...valid,
      enabled_country_count: 194,
      supported_directed_pair_count: 194 * 193,
    })).toThrow("CORRIDOR_CENSUS_COUNTRY_FLOOR_NOT_MET");
  });

  it("fails closed when a pair disappears or an enabled ISO3 is invalid", () => {
    expect(() => validateCommercialCorridorCensus({
      ...valid,
      supported_directed_pair_count: valid.supported_directed_pair_count - 1,
    })).toThrow("CORRIDOR_CENSUS_PAIR_COUNT_MISMATCH");

    expect(() => validateCommercialCorridorCensus({
      ...valid,
      invalid_enabled_iso3_rows: 1,
    })).toThrow("CORRIDOR_CENSUS_INVALID_ENABLED_ISO3");
  });

  it("does not silently promote named routes or corridor scores", () => {
    expect(() => validateCommercialCorridorCensus({
      ...valid,
      named_route_data_promoted_rows: 1,
    })).toThrow("CORRIDOR_CENSUS_UNCERTIFIED_ROUTE_PROMOTION");

    expect(() => validateCommercialCorridorCensus({
      ...valid,
      corridor_score_status: "AVAILABLE",
    })).toThrow("CORRIDOR_CENSUS_CORRIDOR_SCORE_STATUS_MISMATCH");
  });
});
