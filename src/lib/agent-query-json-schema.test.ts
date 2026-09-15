import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AGENT_QUERY_INTENTS,
  AGENT_QUERY_SCHEMA_VERSION,
  AGENT_QUERY_TOPICS,
  buildAgentQueryPlan,
} from "./agent-query-plan";

function readSchema(name: string) {
  return JSON.parse(readFileSync(join(process.cwd(), "schemas", name), "utf8")) as Record<string, any>;
}

const request = readSchema("agent-query-v1.schema.json");
const response = readSchema("adaptive-intelligence-response-v1.schema.json");

describe("published adaptive agent JSON Schemas", () => {
  it("publishes Draft 2020-12 schemas with stable public identifiers", () => {
    for (const schema of [request, response]) {
      expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
      expect(schema.$id).toMatch(/^https:\/\/geomacro\.live\/schemas\//);
    }
    expect(request.properties.schema_version.const).toBe(AGENT_QUERY_SCHEMA_VERSION);
    expect(response.properties.schema_version.const).toBe("geomacro.adaptive-intelligence-response.v1");
  });

  it("keeps public topic and intent vocabularies identical to the runtime planner", () => {
    expect(request.$defs.topic.enum).toEqual([...AGENT_QUERY_TOPICS]);
    expect(request.$defs.intent.enum).toEqual([...AGENT_QUERY_INTENTS]);
    expect(response.$defs.topic.enum).toEqual([...AGENT_QUERY_TOPICS]);
    expect(response.$defs.intent.enum).toEqual([...AGENT_QUERY_INTENTS]);
  });

  it("documents the fail-closed ranking, change and Risk Gate request constraints", () => {
    const text = JSON.stringify(request);
    expect(text).toContain("ranking_filter");
    expect(text).toContain("risk_object_score");
    expect(text).toContain("previous_published");
    expect(text).toContain("risk_gate_context");
    expect(request.additionalProperties).toBe(false);
    expect(request.properties.subjects.maxItems).toBe(25);
  });

  it("keeps the stable response envelope explicit and non-executing", () => {
    expect(response.additionalProperties).toBe(false);
    expect(response.required).toEqual(expect.arrayContaining([
      "query_plan_hash",
      "question_interpretation",
      "analysis",
      "structural",
      "hot_topics",
      "risk_gate",
      "signed_risk_objects",
      "methodology",
      "limitations",
      "delivered_product_hash",
      "execution_authorized",
    ]));
    expect(response.properties.execution_authorized.const).toBe(false);
    expect(response.properties.limitations.properties.missing_is_never_zero_risk.const).toBe(true);
    expect(response.properties.limitations.properties.only_prechecked_required_modules_delivered.const).toBe(true);
  });

  it("publishes every runtime intent-specific response analysis type", () => {
    const types = response.$defs.analysis.oneOf.map((variant: any) => variant.properties.type.const).sort();
    expect(types).toEqual([...AGENT_QUERY_INTENTS].sort());
  });

  it("documents a request whose deterministic plan binds the same public contract", () => {
    const plan = buildAgentQueryPlan({
      schema_version: AGENT_QUERY_SCHEMA_VERSION,
      question: "Compare India and the United States on macro risk",
      subjects: [
        { type: "country", country_iso3: "USA" },
        { type: "country", country_iso3: "IND" },
      ],
      topics: ["macro_risk"],
      intent: "comparison",
      evidence: "required",
      detail: "standard",
    });
    expect(plan.intent).toBe("comparison");
    expect(plan.subjects).toEqual([
      { type: "country", country_iso3: "IND" },
      { type: "country", country_iso3: "USA" },
    ]);
    expect(plan.query_plan_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
