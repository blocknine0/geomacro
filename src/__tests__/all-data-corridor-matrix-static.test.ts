import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync(
  new URL("../../scripts/all-data-corridor-matrix.ts", import.meta.url),
  "utf8",
);
const workflow = readFileSync(
  new URL("../../.github/workflows/all-data-corridor-matrix.yml", import.meta.url),
  "utf8",
);

describe("all-data corridor matrix", () => {
  it("uses governed live and historical serving layers", () => {
    expect(script).toContain('from("live_structured_events")');
    expect(script).toContain('from("commercial_structural_country_profiles")');
    expect(script).toContain('from("commercial_structural_country_coverage_latest")');
    expect(script).toContain('from("commercial_structural_corridor_latest")');
    expect(script).not.toContain('from("structural_geopolitical_observations")');
  });

  it("does not silently add structural evidence to frozen scoring", () => {
    expect(script).toContain('"EVIDENCE_ONLY_NOT_IN_GRI_V1_2"');
    expect(script).toContain("dryRunCountryRiskObject");
    expect(script).toContain("buildCorridorRiskObject");
    expect(script).not.toContain("structural_weight");
    expect(script).not.toContain("structural_score");
  });

  it("enumerates all accepted directed pairs with a fail-closed cap", () => {
    expect(script).toContain("origin.iso3 === destination.iso3");
    expect(script).toContain("pairCount > MAX_PAIR_COUNT");
    expect(script).toContain("corridorRows.push");
  });

  it("makes missing data actionable without guessing", () => {
    expect(script).toContain("missing_data_actions");
    expect(script).toContain("run_or_repair_world_bank_wgi_structural_ingest");
    expect(script).toContain("run_or_repair_ucdp_ged_structural_ingest");
    expect(script).toContain("run_or_repair_ucdp_dyadic_structural_ingest");
    expect(script).toContain("run_or_repair_unhcr_structural_ingest");
  });

  it("keeps commercial and execution safety boundaries explicit", () => {
    expect(script).toContain("corridor_verified_for_production: false");
    expect(script).toContain("execution_authorized: false");
    expect(workflow).not.toContain("GOAT_TESTNET3_USDC");
    expect(workflow).not.toContain("RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64");
  });
});
