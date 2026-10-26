import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GEOMACRO_API_EXAMPLES as examples, GEOMACRO_PUBLIC_API_ENDPOINTS as endpoints } from "../lib/public-api-endpoints";
import { officialGeomacroAgentDiscovery, officialGeomacroAgentOpenApi, planOfficialGeomacroToolCall } from "../lib/official-geomacro-agent.server";
import { agentAdaptiveQuerySchema, buildAgentQueryPlan } from "../lib/agent-query-plan";
import { bindCategoryAliasPayload } from "../lib/category-intelligence-alias.server";
import { quoteGeomacroUsdcCapabilityPreflight } from "../lib/geomacro-multichain-usdc.server";

describe("public endpoint integration contract", () => {
  const openapi = officialGeomacroAgentOpenApi();
  const paths = openapi.paths as Record<string, any>;
  const staticPaths = JSON.parse(readFileSync("public/openapi-x402.json", "utf8")).paths;
  it("keeps website, agent discovery and both OpenAPI surfaces on existing routes and methods", () => {
    expect(officialGeomacroAgentDiscovery().public_endpoint_catalog).toEqual(endpoints);
    expect(new Set(endpoints.map(endpoint => endpoint.path)).size).toBe(endpoints.length);
    expect(endpoints.some(endpoint => String(endpoint.path) === "/api/public/global-risk")).toBe(false);
    expect(paths["/api/public/global-risk"].get.deprecated).toBe(true);
    for (const endpoint of endpoints) {
      for (const method of endpoint.methods) {
        expect(paths[endpoint.path], endpoint.path).toHaveProperty(method.toLowerCase());
        expect(staticPaths[endpoint.path][method.toLowerCase()]).toEqual(paths[endpoint.path][method.toLowerCase()]);
      }
      const tanstack = `src/routes/${endpoint.path.slice(1).replaceAll("/", ".")}.ts`;
      const nitro = `server${endpoint.path}.get.ts`;
      expect(existsSync(tanstack) || existsSync(nitro) || existsSync(`server${endpoint.path}/index.get.ts`), endpoint.path).toBe(true);
    }
    const operations = Object.values(paths).flatMap(path => Object.values(path) as any[]);
    expect(new Set(operations.map(operation => operation.operationId)).size).toBe(operations.length);
  });
  it("publishes examples accepted by the canonical planner and exact category binders", () => {
    expect(() => buildAgentQueryPlan(examples.query)).not.toThrow();
    for (const [id, topics, requiredModules] of [
      ["geopolitics", ["conflict_geopolitics"], ["geopolitical_security"]],
      ["macro_fx", ["macro_risk", "fx_external_risk"], ["external_fx", "macro_monetary", "sovereign_fiscal"]],
      ["critical_minerals", ["critical_minerals"], ["critical_minerals"]],
    ] as const) {
      expect(bindCategoryAliasPayload(examples[id], { topics, requiredModules }).ok).toBe(true);
    }
    const baseline = buildAgentQueryPlan(examples.availability);
    expect(baseline.delivery_tier).toBe("structural_baseline");
    expect(baseline.required_modules).toEqual(["macro_monetary"]);
    expect(planOfficialGeomacroToolCall(examples.agent)?.tool).toBe("macro_fx_query");
    expect(() => quoteGeomacroUsdcCapabilityPreflight(examples.price_preflight)).not.toThrow();
  });
  it("documents valid schema bounds and the baseline-only preflight instead of arbitrary objects", () => {
    const query = paths["/api/v1/intelligence/query"].post.requestBody.content["application/json"];
    expect(agentAdaptiveQuerySchema.safeParse(query.example).success).toBe(true);
    expect(Object.keys(query.schema.properties).sort()).toEqual(Object.keys(agentAdaptiveQuerySchema.shape).sort());
    expect(query.schema.properties.detail.enum).toEqual(["compact", "standard", "full"]);
    expect(query.schema.properties.subjects.maxItems).toBe(25);
    const baseline = paths["/api/v1/intelligence/availability"].post.requestBody.content["application/json"];
    expect(baseline.schema.required).toContain("delivery_tier");
    expect(baseline.schema.properties.delivery_tier.const).toBe("structural_baseline");
    expect(baseline.schema.properties.subjects.maxItems).toBe(1);
    expect(baseline.schema.properties.topics.maxItems).toBe(5);
    expect(baseline.schema.allOf[0].then.properties.topics.maxItems).toBe(1);
    expect(paths["/api/v1/intelligence/geopolitics"].post.requestBody.content["application/json"].schema.properties.fulfillment_mode.default).toBe("live_on_demand");
    expect(openapi["x-geomacro"].payment_authorized_by_discovery).toBe(false);
  });
});
