import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseExternalRiskGateBody,
  RiskGateApiError,
} from "../lib/risk-gate-api.server";

const NOW = new Date("2026-09-15T09:00:00.000Z");

const POLICY = {
  policy_id: "scope-test",
  policy_version: "1",
  continue_max_score: 30,
  reduce_limit_max_score: 50,
  require_approval_max_score: 70,
  minimum_confidence_for_auto_continue: 0.8,
  require_commercial_verification_for_continue: true,
};

function request(subject: Record<string, unknown>) {
  return {
    request_id: "scope-test-request",
    evaluated_at: NOW.toISOString(),
    subject,
    policy: POLICY,
  };
}

function riskGateRequestSchema(openapi: string) {
  const start = openapi.indexOf("    RiskGateRequest:\n");
  const end = openapi.indexOf("    RiskGateDecision:\n", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return openapi.slice(start, end);
}

describe("Risk Gate v1 external subject scope", () => {
  it("accepts only the implemented country and directional-corridor subjects", () => {
    const country = parseExternalRiskGateBody(
      request({ type: "country", country_iso3: "USA" }),
      NOW,
    );
    expect(country.subject_type).toBe("country");
    expect(country.subject_id).toBe("USA");

    const corridor = parseExternalRiskGateBody(
      request({
        type: "corridor",
        origin_country_iso3: "USA",
        destination_country_iso3: "CHN",
      }),
      NOW,
    );
    expect(corridor.subject_type).toBe("corridor");
    expect(corridor.subject_id).toBe("USA>CHN");
  });

  it.each([
    "event",
    "entity",
    "region",
    "port",
    "airport",
    "route",
    "commodity",
    "portfolio",
  ])("fails closed on future/non-v1 subject type %s", (type) => {
    try {
      parseExternalRiskGateBody(request({ type }), NOW);
      throw new Error("expected parser rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(RiskGateApiError);
      expect((error as RiskGateApiError).status).toBe(400);
      expect((error as RiskGateApiError).code).toBe("INVALID_REQUEST");
      expect((error as Error).message).toBe("subject.type must be country or corridor");
    }
  });

  it("keeps the v1 OpenAPI subject schema aligned with runtime", () => {
    const openapi = readFileSync("docs/openapi/geomacro-v1.yaml", "utf8");
    const schema = riskGateRequestSchema(openapi);

    expect(schema).toContain("type: { const: country }");
    expect(schema).toContain("type: { const: corridor }");
    expect(schema).toContain("country_iso3");
    expect(schema).toContain("origin_country_iso3");
    expect(schema).toContain("destination_country_iso3");

    for (const unsupported of [
      "event",
      "entity",
      "region",
      "port",
      "airport",
      "route",
      "commodity",
      "portfolio",
    ]) {
      expect(schema).not.toContain(`type: { const: ${unsupported} }`);
    }
  });

  it("keeps the public v1 contract non-authorizing", () => {
    const openapi = readFileSync("docs/openapi/geomacro-v1.yaml", "utf8");
    expect(openapi).toContain("enum: [CONTINUE, REDUCE_LIMIT, REQUIRE_APPROVAL, PAUSE]");
    expect(openapi).toContain("execution_authorized:\n          const: false");
  });
});
