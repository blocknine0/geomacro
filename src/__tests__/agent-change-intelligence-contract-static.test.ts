import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const response = readFileSync("src/lib/agent-query-response.server.ts", "utf8");
const contract = readFileSync("src/lib/geomacro-intelligence-contract.ts", "utf8");

describe("#1414 machine change-intelligence contract", () => {
  it("exposes one stable derived change object per subject", () => {
    expect(response).toContain('CHANGE_INTELLIGENCE_SCHEMA_VERSION = "geomacro.change-intelligence.v1"');
    expect(response).toContain("change_intelligence: changeIntelligence");
    expect(response).toContain("previous_verified_state");
    expect(response).toContain("historical_reference_states");
    expect(response).toContain("cross_domain_effects");
    expect(response).toContain("corridor_effects");
    expect(response).toContain('delivery_boundary: "STRUCTURED_DERIVED_CHANGE_INTELLIGENCE_ONLY"');
    expect(response).toContain("raw_data_delivered: false");
  });

  it("gives agents a bounded refresh hint without manufacturing freshness", () => {
    expect(response).toContain('strategy: "SOURCE_NATIVE_CADENCE_OR_STATE_CHANGE"');
    expect(response).toContain("recommended_not_before_seconds: boundedRefreshSeconds");
    expect(response).toContain("this hint never advances evidence freshness");
    expect(response).toContain("state_version: state.state_version");
    expect(contract).toContain("refreshSeconds < 900 || refreshSeconds > 86_400");
  });

  it("makes the paid runtime validator reject missing or unsafe change intelligence", () => {
    expect(contract).toContain('"change_intelligence"');
    expect(contract).toContain("INTELLIGENCE_RESPONSE_CHANGE_INTELLIGENCE_INVALID");
    expect(contract).toContain('row.schema_version !== "geomacro.change-intelligence.v1"');
    expect(contract).toContain('row.delivery_boundary !== "STRUCTURED_DERIVED_CHANGE_INTELLIGENCE_ONLY"');
    expect(contract).toContain("row.raw_data_delivered !== false || row.execution_authorized !== false");
  });
});
