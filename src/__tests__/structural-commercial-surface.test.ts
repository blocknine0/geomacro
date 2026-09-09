import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/routes/data-api.tsx", "utf8");
const packageDoc = readFileSync(
  "docs/STRUCTURAL_DATA_COMMERCIAL_PACKAGE.md",
  "utf8",
);

describe("structural data commercial surface", () => {
  it("publishes the Geomacro Agent endpoint and grounded public capability", () => {
    expect(page).toContain("POST https://geomacro.live/api/agent/risk");
    expect(page).toContain('"capability": "intelligence_query"');
    expect(page).toContain("/.well-known/geomacro-agent.json");
  });

  it("keeps structural data out of the public free entitlement", () => {
    expect(packageDoc).toContain("Not included in the public/free layer");
    expect(packageDoc).toContain("raw historical structural warehouse access");
    expect(packageDoc).toContain("full country structural profile payloads");
  });

  it("keeps the current corridor model endpoint-composed and non-executing", () => {
    expect(page).toContain("ENDPOINT_COMPOSED_V0_1");
    expect(page).toContain("route_modeling_status = NOT_MODELED");
    expect(page).toContain("execution_authorized=false");
  });

  it("preserves the methodology and source-rights boundary", () => {
    expect(page).toContain("EVIDENCE_ONLY_NOT_IN_GRI_V1_2");
    expect(packageDoc).toContain("EVIDENCE_ONLY_NOT_IN_GRO_V02");
    expect(packageDoc).toContain("Unknown or review-required source rights fail closed");
  });
});
