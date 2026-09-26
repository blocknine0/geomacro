import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const helper = readFileSync(
  "src/lib/agent-query-political-governance.server.ts",
  "utf8",
);
const deliverability = readFileSync(
  "src/lib/agent-query-deliverability.server.ts",
  "utf8",
);
const response = readFileSync(
  "src/lib/agent-query-response.server.ts",
  "utf8",
);

const WGI = "world_bank_wgi_political_stability";

describe("adaptive WGI political-governance fallback", () => {
  it("requires the governed commercially eligible WGI observation", () => {
    expect(helper).toContain(WGI);
    expect(helper).toContain("checkCommercialSourceEligibility");
    expect(helper).toContain('.eq("quality_status", "VERIFIED")');
    expect(helper).toContain('commercial_eligibility_status !== "VERIFIED"');
    expect(helper).toContain("OBSERVATION_STALE");
    expect(helper).toContain("NOT_COUNTRY_SUBJECT");
  });

  it("uses WGI only as a fallback for political_governance deliverability", () => {
    expect(deliverability).toContain('module === "political_governance"');
    expect(deliverability).toContain("loadAgentPoliticalGovernanceModule");
    expect(deliverability).toContain("governed_fallback_modules");
    expect(deliverability).toContain("AGENT_POLITICAL_GOVERNANCE_SOURCE_ID");
    expect(deliverability).toContain('fallback.code === "OBSERVATION_STALE"');
  });

  it("delivers a derived governed module state instead of fabricating a GRO", () => {
    expect(response).toContain('delivery: "GOVERNED_WGI_MODULE_STATE"');
    expect(response).toContain("source_observed_at: fallback.source_observed_at");
    expect(response).toContain("state: fallback.state");
    expect(helper).toContain("methodology_version: state.methodology_version");
    expect(response).toContain("SUPPORTED_MODULES");
    expect(response).toContain("without inventing an aggregate signed country Risk Object");
  });

  it("preserves raw-data and execution boundaries", () => {
    expect(response).toContain("raw_upstream_perception_source_material_redistributed: false");
    expect(response).toContain("wgi_upstream_perception_source_material_redistributed: false");
    expect(response).toContain("execution_authorized: false");
    expect(helper).not.toContain("source_url");
    expect(helper).not.toContain("raw_payload");
  });
});
