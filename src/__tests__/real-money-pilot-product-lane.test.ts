import { describe, expect, it } from "vitest";

import { buildAgentQueryPlan } from "@/lib/agent-query-plan";

describe("controlled real-money pilot product lane", () => {
  it("keeps explicit macro plus FX structural intelligence independent of realtime and signed GRO", () => {
    const plan = buildAgentQueryPlan({
      schema_version: "geomacro.agent-query.v1",
      subjects: [{ type: "country", country_iso3: "BRA" }],
      topics: ["macro_risk", "fx_external_risk"],
      evidence: "required",
      detail: "standard",
    });

    expect(plan.question_key).toBeNull();
    expect(plan.topics).toEqual(["fx_external_risk", "macro_risk"]);
    expect(plan.required_modules).toEqual([
      "external_fx",
      "macro_monetary",
      "sovereign_fiscal",
    ]);
    expect(plan.required_modules).not.toContain("hot_topics");
    expect(plan.required_modules).not.toContain("signed_risk_object");
    expect(plan.required_modules).not.toContain("risk_gate");
  });

  it("keeps explicit critical-minerals structural intelligence independent of realtime and signed GRO", () => {
    const plan = buildAgentQueryPlan({
      schema_version: "geomacro.agent-query.v1",
      subjects: [{ type: "country", country_iso3: "ZAF" }],
      topics: ["critical_minerals"],
      evidence: "required",
      detail: "standard",
    });

    expect(plan.question_key).toBeNull();
    expect(plan.required_modules).toEqual(["critical_minerals"]);
    expect(plan.required_modules).not.toContain("hot_topics");
    expect(plan.required_modules).not.toContain("signed_risk_object");
  });

  it("still makes natural-language current intelligence fail closed on realtime and signed-risk dependencies", () => {
    const plan = buildAgentQueryPlan({
      schema_version: "geomacro.agent-query.v1",
      question: "What is the current macro and FX risk in Brazil?",
      subjects: [{ type: "country", country_iso3: "BRA" }],
      topics: ["macro_risk", "fx_external_risk"],
      evidence: "required",
      detail: "standard",
    });

    expect(plan.required_modules).toContain("hot_topics");
    expect(plan.required_modules).toContain("signed_risk_object");
    expect(plan.required_modules).toContain("external_fx");
    expect(plan.required_modules).toContain("macro_monetary");
    expect(plan.required_modules).toContain("sovereign_fiscal");
  });
});
