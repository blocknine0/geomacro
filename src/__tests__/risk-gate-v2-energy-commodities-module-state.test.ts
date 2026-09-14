import { describe, expect, it } from "vitest";

import {
  buildRiskGateV2EnergyCommoditiesModuleState,
  RISK_GATE_V2_USGS_EXTRACTION_METHOD_VERSION,
  RISK_GATE_V2_USGS_EXTRACTION_SCOPE,
  RISK_GATE_V2_USGS_MCS_SOURCE_FILE_SHA256,
  type RiskGateV2UsqsExtractionManifest,
  type RiskGateV2UsqsExtractionObservation,
} from "../lib/risk-gate-v2-energy-commodities-module-state";

const HASHES = ["a", "b", "c", "d", "e"].map((char) => char.repeat(64));
const OBSERVED_AT = "2025-12-31T00:00:00.000Z";

function manifest(): RiskGateV2UsqsExtractionManifest {
  return {
    release_id: "mcs-2026:2025:extraction-concentration-v1",
    dataset_version: "MCS 2026",
    retrieved_at: "2026-09-14T00:00:00.000Z",
    coverage_end: OBSERVED_AT,
    write_completed: true,
    metadata: {
      methodology_scope: RISK_GATE_V2_USGS_EXTRACTION_SCOPE,
      source_file_sha256: RISK_GATE_V2_USGS_MCS_SOURCE_FILE_SHA256,
      verified_series: [
        {
          commodity_key: "cobalt",
          commodity: "Cobalt",
          series_key: "1".repeat(64),
          section: "World Mine Production and Reserves",
          statistic: "Production",
          detail: "Mine production",
          unit: "metric tons",
          observed_at: OBSERVED_AT,
          source_row_count: 5,
          actual_country_count: 4,
          positive_actual_producer_count: 4,
          residual_bucket_present: true,
          source_row_hashes: HASHES,
          series_hash: "2".repeat(64),
        },
      ],
    },
  };
}

function observations(): RiskGateV2UsqsExtractionObservation[] {
  const values = [
    { iso3: "COD", value: 45 },
    { iso3: "IDN", value: 25 },
    { iso3: "RUS", value: 15 },
    { iso3: "AUS", value: 5 },
  ];
  const rows: RiskGateV2UsqsExtractionObservation[] = values.map(
    (item, index) => ({
      country_iso3: item.iso3,
      commodity: "Cobalt",
      value_numeric: item.value,
      unit: "metric tons",
      observed_at: OBSERVED_AT,
      section: "World Mine Production and Reserves",
      statistic: "Production",
      detail: "Mine production",
      source_file_sha256: RISK_GATE_V2_USGS_MCS_SOURCE_FILE_SHA256,
      source_row_sha256: HASHES[index],
      aggregate_bucket: null,
    }),
  );
  rows.push({
    country_iso3: null,
    commodity: "Cobalt",
    value_numeric: 10,
    unit: "metric tons",
    observed_at: OBSERVED_AT,
    section: "World Mine Production and Reserves",
    statistic: "Production",
    detail: "Mine production",
    source_file_sha256: RISK_GATE_V2_USGS_MCS_SOURCE_FILE_SHA256,
    source_row_sha256: HASHES[4],
    aggregate_bucket: "OTHER_COUNTRIES",
  });
  return rows;
}

function build(overrides: {
  rows?: RiskGateV2UsqsExtractionObservation[];
  release?: RiskGateV2UsqsExtractionManifest;
  generated_at?: string;
  commercial?: "VERIFIED" | "UNVERIFIED" | "DERIVED_ONLY" | "BLOCKED";
} = {}) {
  return buildRiskGateV2EnergyCommoditiesModuleState({
    commodity: "Cobalt",
    observations: overrides.rows ?? observations(),
    manifest: overrides.release ?? manifest(),
    generated_at: overrides.generated_at ?? "2026-09-14T00:00:00.000Z",
    commercial_eligibility_status: overrides.commercial ?? "VERIFIED",
    risk_object_ids: ["risk-b", "risk-a", "risk-a"],
  });
}

describe("Risk Gate v2 critical-mineral extraction concentration", () => {
  it("scores a complete governed extraction series deterministically", () => {
    const state = build();
    expect(state).not.toBeNull();
    expect(state!.module).toBe("energy_commodities");
    expect(state!.coverage).toBe("LIMITED");
    expect(state!.score).toBe(39);
    expect(state!.confidence).toBe(0.36);
    expect(state!.methodology_version).toBe(
      RISK_GATE_V2_USGS_EXTRACTION_METHOD_VERSION,
    );
    expect(state!.risk_object_ids).toEqual(["risk-a", "risk-b"]);
    expect(state!.drivers).toEqual([
      expect.objectContaining({
        driver: "strategic_commodity_dependency",
        score_contribution: 39,
      }),
    ]);
  });

  it("keeps Other countries as a residual denominator bucket, never a sovereign producer", () => {
    // Shares are 45%, 25%, 15%, 5% plus a 10% residual. The HHI upper bound
    // is .30 and the top actual-country share is .45, yielding exactly 39.
    expect(build()!.score).toBe(39);
  });

  it("is reproducible for the same calculation inputs and generation time", () => {
    const left = build();
    const right = build();
    expect(left).toEqual(right);
    expect(left!.module_state_id).toBe(right!.module_state_id);
  });

  it("fails closed when a manifest row is missing from persisted evidence", () => {
    expect(build({ rows: observations().slice(0, 4) })).toBeNull();
  });

  it("fails closed when source identity, unit or exact series semantics drift", () => {
    const badSource = observations();
    badSource[0] = { ...badSource[0], source_file_sha256: "f".repeat(64) };
    expect(build({ rows: badSource })).toBeNull();

    const badUnit = observations();
    badUnit[1] = { ...badUnit[1], unit: "thousand metric tons" };
    expect(build({ rows: badUnit })).toBeNull();

    const badSeries = observations();
    badSeries[2] = { ...badSeries[2], detail: "Refinery production" };
    expect(build({ rows: badSeries })).toBeNull();
  });

  it("fails closed on stale annual evidence instead of carrying it forward indefinitely", () => {
    expect(
      build({ generated_at: "2028-07-01T00:00:00.000Z" }),
    ).toBeNull();
  });

  it("does not score commodities omitted from the verified manifest catalogue", () => {
    expect(
      buildRiskGateV2EnergyCommoditiesModuleState({
        commodity: "Lithium",
        observations: observations().map((row) => ({
          ...row,
          commodity: "Lithium",
        })),
        manifest: manifest(),
        generated_at: "2026-09-14T00:00:00.000Z",
        commercial_eligibility_status: "VERIFIED",
      }),
    ).toBeNull();
  });

  it("preserves commercial eligibility instead of silently promoting it", () => {
    expect(build({ commercial: "UNVERIFIED" })!.commercial_eligibility_status).toBe(
      "UNVERIFIED",
    );
  });
});
