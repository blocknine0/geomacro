import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/routes/data-api.tsx", "utf8");
const packageDoc = readFileSync(
  "docs/STRUCTURAL_DATA_COMMERCIAL_PACKAGE.md",
  "utf8",
);

describe("structural data commercial surface", () => {
  it("keeps commercial machine delivery governed and runtime-status driven without a free API promise", () => {
    expect(page).toContain("INTELLIGENCE API · AI AGENTS");
    expect(page).toContain("Paid API requests become available only when the live payment and delivery service confirms activation.");
    expect(page).toContain("AgentCommerceStatus");
    expect(page).toContain("RUNTIME STATUS ABOVE");
    expect(page).toContain("Free Explorer is website/dashboard access, not a free API");
    expect(page).not.toContain("bounded public structured-data digest");
  });

  it("keeps structural API/download delivery out of the public free entitlement", () => {
    expect(packageDoc).toContain("Free Explorer is a public website/dashboard experience only");
    expect(packageDoc).toContain("anonymous structured API access");
    expect(packageDoc).toContain("structured-data download/export");
    expect(packageDoc).toContain("full country or corridor structural profile payloads");
  });

  it("keeps the current corridor model endpoint-composed and non-executing", () => {
    expect(page).toContain("ENDPOINT_COMPOSED_V0_1");
    expect(page).toContain("route_modeling_status = NOT_MODELED");
    expect(page).toContain("execution_authorized=false");
  });

  it("preserves the methodology and source-rights boundary", () => {
    expect(page).toContain("Payment never bypasses evidence, freshness, source-rights or product controls.");
    expect(page).toContain("Get concise, structured Geomacro intelligence built for decisions, while underlying evidence remains protected.");
    expect(packageDoc).toContain("EVIDENCE_ONLY_NOT_IN_GRO_V02");
    expect(packageDoc).toContain("Unknown or review-required source rights fail closed");
  });
});
