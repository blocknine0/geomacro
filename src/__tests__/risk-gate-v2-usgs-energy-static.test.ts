import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const recorder = readFileSync(
  new URL("../../scripts/record-usgs-mcs-release-manifest.mjs", import.meta.url),
  "utf8",
);
const server = readFileSync(
  new URL("../lib/risk-gate-v2-energy-commodities-module-state.server.ts", import.meta.url),
  "utf8",
);

describe("Risk Gate v2 USGS critical-mineral supply contract", () => {
  it("records source completeness before zero/missing producer data can be trusted", () => {
    expect(recorder).toContain('SOURCE_ID = "usgs_mcs"');
    expect(recorder).toContain("production_source_rows");
    expect(recorder).toContain("production_normalized_rows");
    expect(recorder).toContain("production_unmapped_rows");
    expect(recorder).toContain("production_non_numeric_rows");
    expect(recorder).toContain("global_release: true");
    expect(recorder).toContain("live_source_release_manifests");
    expect(recorder).toContain("manifest_hash");
  });

  it("serves only verified commercially eligible USGS observations", () => {
    expect(server).toContain('.eq("source_id", "usgs_mcs")');
    expect(server).toContain('.eq("quality_status", "VERIFIED")');
    expect(server).toContain(
      '.eq("commercial_eligibility_status", "VERIFIED")',
    );
    expect(server).toContain("live_source_release_manifests");
  });
});
