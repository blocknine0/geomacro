import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/918_risk_gate_v2_global_source_manifests.sql", import.meta.url),
  "utf8",
);
const geopoliticalServer = readFileSync(
  new URL("../lib/risk-gate-v2-geopolitical-security-module-state.server.ts", import.meta.url),
  "utf8",
);
const wgiIngest = readFileSync(
  new URL("../../scripts/ingest-wgi-political-stability-live.ts", import.meta.url),
  "utf8",
);
const ucdpManifest = readFileSync(
  new URL("../../scripts/record-ucdp-candidate-release-manifest.mjs", import.meta.url),
  "utf8",
);
const census = readFileSync(
  new URL("../../scripts/global-risk-gate-country-census.ts", import.meta.url),
  "utf8",
);

describe("global country Risk Gate readiness evidence", () => {
  it("requires explicit governed release-completeness evidence", () => {
    expect(migration).toContain("live_source_release_manifests");
    expect(migration).toContain("write_completed boolean");
    expect(migration).toContain("manifest_hash");
    expect(geopoliticalServer).toContain("live_source_release_manifests");
    expect(geopoliticalServer).toContain('.eq("write_completed", true)');
    expect(geopoliticalServer).toContain('.eq("rejected_rows", 0)');
    expect(geopoliticalServer).toContain('.eq("unmapped_rows", 0)');
    expect(geopoliticalServer).toContain("release_rank");
  });

  it("blocks incomplete WGI sovereign reconciliation", () => {
    expect(wgiIngest).toContain("missingCountries.length > 0");
    expect(wgiIngest).toContain("WGI global write blocked");
    expect(wgiIngest).toContain("sovereign_denominator");
    expect(wgiIngest).toContain("live_source_release_manifests");
  });

  it("records UCDP release identity instead of inferring completeness from silence", () => {
    expect(ucdpManifest).toContain("global_release: true");
    expect(ucdpManifest).toContain("release_rank");
    expect(ucdpManifest).toContain("write_completed: WRITE");
    expect(ucdpManifest).toContain("manifest_hash");
  });

  it("census exercises all four country modules and a real Risk Gate evaluation", () => {
    for (const module of [
      "geopolitical_security",
      "political_governance",
      "sovereign_fiscal",
      "macro_monetary",
    ]) {
      expect(census).toContain(module);
    }
    expect(census).toContain("evaluateRiskGateV2");
    expect(census).toContain('status: accepted ? "ACCEPTED" : "FAIL_CLOSED"');
    expect(census).toContain("execution_authorized_is_false");
  });
});
