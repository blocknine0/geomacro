import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { agentAdaptiveQuerySchema, buildAgentQueryPlan } from "../lib/agent-query-plan";

const read = (path: string) => readFileSync(path, "utf8");

describe("#1414 directional corridor x402 contract", () => {
  it("plans a directional corridor query through the canonical adaptive product", () => {
    const parsed = agentAdaptiveQuerySchema.parse({
      schema_version: "geomacro.agent-query.v1",
      question: "What are the current trade and geopolitical risks for the United States to China corridor?",
      subjects: [{ type: "corridor", origin_country_iso3: "USA", destination_country_iso3: "CHN" }],
      topics: ["trade_corridor", "conflict_geopolitics"],
      evidence: "required",
      detail: "compact",
    });
    const plan = buildAgentQueryPlan(parsed);

    expect(plan.intent).toBe("corridor");
    expect(plan.subjects).toEqual([
      { type: "corridor", origin_country_iso3: "USA", destination_country_iso3: "CHN" },
    ]);
    expect(plan.required_modules).toContain("trade_corridor");
    expect(plan.required_modules).toContain("geopolitical_security");
    expect(plan.query_plan_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("wires corridor requests through derived response assembly rather than raw data", () => {
    const paid = read("src/lib/mainnet-intelligence-endpoint.server.ts");
    const response = read("src/lib/agent-query-response.server.ts");
    const prelaunch = read("scripts/agentic/verify-live-x402-prelaunch-availability.mjs");

    expect(paid).toContain("agentAdaptiveQuerySchema.parse(raw)");
    expect(paid).toContain("buildAgentQueryPlan(parsed)");
    expect(paid).toContain("assembleAgentQueryResponse");
    expect(paid).toContain("sanitizeAndRehashPaidPreparedResponse");
    expect(paid).toContain('delivery_boundary: "STRUCTURED_DERIVED_INTELLIGENCE_ONLY"');
    expect(paid).toContain("raw_data_delivered: false");
    expect(paid).toContain("source_identity_delivered: false");

    expect(response).toContain('if (plan.intent === "corridor")');
    expect(response).toContain('return { type: "corridor", directional: true, subject: plan.subjects[0] };');
    expect(response).toContain('`${state.subject.origin_country_iso3} → ${state.subject.destination_country_iso3}`');
    expect(response).toContain("current_state: currentStates");
    expect(response).toContain("decision_intelligence: decisionIntelligence");
    expect(response).toContain("answer: buildDirectAnswer(");

    expect(prelaunch).toContain('id: "usa-china-corridor"');
    expect(prelaunch).toContain('type: "corridor"');
    expect(prelaunch).toContain('topics: ["trade_corridor", "conflict_geopolitics"]');
    expect(prelaunch).toContain("real_funds_touched: false");
  });

  it("rejects same-country pseudo-corridors before any payment path", () => {
    expect(() => agentAdaptiveQuerySchema.parse({
      schema_version: "geomacro.agent-query.v1",
      subjects: [{ type: "corridor", origin_country_iso3: "USA", destination_country_iso3: "USA" }],
      topics: ["trade_corridor"],
    })).toThrow(/Corridor endpoints must differ/);
  });
});
