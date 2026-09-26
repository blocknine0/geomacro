import fs from "node:fs";
import { describe, expect, it } from "vitest";

const loader = fs.readFileSync("src/lib/agent-query-critical-minerals.server.ts", "utf8");
const availability = fs.readFileSync("src/lib/agent-query-deliverability.server.ts", "utf8");
const response = fs.readFileSync("src/lib/agent-query-response.server.ts", "utf8");

describe("critical-minerals adaptive derived serving", () => {
  it("keeps the USGS customer boundary derived-only", () => {
    expect(loader).toContain('delivery_boundary: "DERIVED_ONLY"');
    expect(loader).toContain("raw_payload_allowed: false");
    expect(loader).not.toContain("value_numeric");
    expect(response).toContain("raw_numeric_source_rows_redistributed: false");
    expect(response).toContain("risk_score_produced: false");
  });

  it("uses the same governed loader for availability and response", () => {
    expect(availability).toContain("loadAgentCriticalMineralsModule");
    expect(response).toContain("loadAgentCriticalMineralsModule");
    expect(availability).toContain("governedDerivedFallbackSourceIds");
    expect(response).toContain("GOVERNED_USGS_CRITICAL_MINERALS_EVIDENCE");
  });

  it("does not send derived-only USGS through the raw redistribution checker", () => {
    expect(availability).toContain("const rawSourceIds");
    expect(availability).toContain("sourceChecker(rawSourceIds)");
    expect(availability).toContain("...governedDerivedFallbackSourceIds");
  });
});
