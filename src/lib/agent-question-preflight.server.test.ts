import { describe, expect, it } from "vitest";
import {
  normalizePaidQuestionWithRegistry,
  type PaidQuestionCountryRegistryRow,
} from "./agent-question-preflight.server";
import { buildAgentQueryPlan } from "./agent-query-plan";

const registry: PaidQuestionCountryRegistryRow[] = [
  { iso3: "IND", country_name: "India", aliases: ["Republic of India"], demonyms: ["Indian"] },
  { iso3: "USA", country_name: "United States", aliases: ["United States of America", "US", "U.S."], demonyms: ["American"] },
  { iso3: "ARE", country_name: "United Arab Emirates", aliases: ["UAE", "Emirates"], demonyms: ["Emirati"] },
];

describe("paid question natural-language normalization", () => {
  it("turns one plain-English country question into the exact governed macro/FX plan", () => {
    const request = normalizePaidQuestionWithRegistry({
      question: "What are the current macro and FX risks for India?",
      client_request_id: "private-workflow-123",
    }, registry);
    const plan = buildAgentQueryPlan(request);

    expect(request.subjects).toEqual([{ type: "country", country_iso3: "IND" }]);
    expect(request.topics).toEqual(expect.arrayContaining(["macro_risk", "fx_external_risk"]));
    expect(plan.required_modules).toEqual(expect.arrayContaining(["macro_monetary", "sovereign_fiscal", "external_fx"]));
    expect(plan.query_plan_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("resolves a directional corridor without sending the question to an external model", () => {
    const request = normalizePaidQuestionWithRegistry({
      question: "What is the trade corridor risk from India to the United Arab Emirates?",
    }, registry);
    const plan = buildAgentQueryPlan(request);

    expect(request.subjects).toEqual([{
      type: "corridor",
      origin_country_iso3: "IND",
      destination_country_iso3: "ARE",
    }]);
    expect(plan.intent).toBe("corridor");
    expect(plan.required_modules).toContain("trade_corridor");
  });

  it("infers a bounded Risk Gate context from a payment question", () => {
    const request = normalizePaidQuestionWithRegistry({
      question: "Should a 1000 USDC treasury payment involving India proceed based on current risk?",
    }, registry);
    const plan = buildAgentQueryPlan(request);

    expect(request.subjects).toEqual([{ type: "country", country_iso3: "IND" }]);
    expect(request.risk_gate_context).toEqual({
      policy_preset: "balanced",
      action_type: "treasury_payment",
      amount_usdc: 1000,
    });
    expect(plan.intent).toBe("risk_gate");
    expect(plan.required_modules).toEqual(expect.arrayContaining(["signed_risk_object", "risk_gate"]));
  });

  it("normalizes comparisons across multiple named countries", () => {
    const request = normalizePaidQuestionWithRegistry({
      question: "Compare India and the United States on macro risk.",
    }, registry);
    const plan = buildAgentQueryPlan(request);

    expect(request.subjects).toEqual([
      { type: "country", country_iso3: "IND" },
      { type: "country", country_iso3: "USA" },
    ]);
    expect(plan.intent).toBe("comparison");
    expect(plan.topics).toContain("macro_risk");
  });

  it("uses the signed Risk Object for a generic current country-risk question", () => {
    const request = normalizePaidQuestionWithRegistry({
      question: "What is the current risk for India?",
    }, registry);
    const plan = buildAgentQueryPlan(request);

    expect(plan.topics).toContain("risk_object");
    expect(plan.required_modules).toContain("signed_risk_object");
  });

  it("fails closed for unsupported historical timing rather than silently substituting current data", () => {
    expect(() => normalizePaidQuestionWithRegistry({
      question: "How did macro risk in India change since last month?",
    }, registry)).toThrow("QUESTION_HISTORICAL_TIME_REQUIRES_EXPLICIT_STRUCTURED_AS_OF");
  });

  it("fails closed when geography or topic cannot be resolved safely", () => {
    expect(() => normalizePaidQuestionWithRegistry({
      question: "What is the macro risk here?",
    }, registry)).toThrow("QUESTION_SUBJECT_UNRESOLVED");

    expect(() => normalizePaidQuestionWithRegistry({
      question: "Tell me something interesting about India.",
    }, registry)).toThrow("QUESTION_TOPIC_UNRESOLVED");
  });
});
