import { describe, expect, it } from "vitest";
import {
  AGENT_MODULE_MAX_AGE_SECONDS,
  buildAgentQueryPlan,
  inferAgentQueryIntent,
  inferAgentQueryTopics,
  paymentBindingForAgentQuery,
} from "./agent-query-plan";

const base = {
  subjects: [{ type: "country" as const, country_iso3: "ind" }],
  topics: ["macro_risk" as const, "fx_external_risk" as const],
};

describe("adaptive agent query planner", () => {
  it("normalizes ISO3 and deterministically selects governed modules", () => {
    const plan = buildAgentQueryPlan(base);
    expect(plan.intent).toBe("single_subject");
    expect(plan.subjects[0]).toEqual({ type: "country", country_iso3: "IND" });
    expect(plan.required_modules).toEqual(["external_fx", "macro_monetary", "sovereign_fiscal"]);
    expect(plan.query_plan_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces the same plan hash regardless of duplicate/topic ordering", () => {
    const a = buildAgentQueryPlan(base);
    const b = buildAgentQueryPlan({
      subjects: [{ type: "country", country_iso3: "IND" }],
      topics: ["fx_external_risk", "macro_risk", "macro_risk"],
    });
    expect(a.query_plan_hash).toBe(b.query_plan_hash);
  });

  it("canonicalizes unordered subject sets and removes exact duplicates before hashing", () => {
    const a = buildAgentQueryPlan({
      intent: "comparison",
      subjects: [
        { type: "country", country_iso3: "IND" },
        { type: "country", country_iso3: "USA" },
      ],
      topics: ["macro_risk"],
    });
    const b = buildAgentQueryPlan({
      intent: "comparison",
      subjects: [
        { type: "country", country_iso3: "usa" },
        { type: "country", country_iso3: "IND" },
        { type: "country", country_iso3: "USA" },
      ],
      topics: ["macro_risk"],
    });
    expect(a.subjects).toEqual([
      { type: "country", country_iso3: "IND" },
      { type: "country", country_iso3: "USA" },
    ]);
    expect(a.query_plan_hash).toBe(b.query_plan_hash);
  });

  it("preserves directional corridor semantics while canonicalizing the subject list", () => {
    const forward = buildAgentQueryPlan({
      subjects: [{ type: "corridor", origin_country_iso3: "IND", destination_country_iso3: "USA" }],
      topics: ["trade_corridor"],
    });
    const reverse = buildAgentQueryPlan({
      subjects: [{ type: "corridor", origin_country_iso3: "USA", destination_country_iso3: "IND" }],
      topics: ["trade_corridor"],
    });
    expect(forward.intent).toBe("corridor");
    expect(forward.query_plan_hash).not.toBe(reverse.query_plan_hash);
  });

  it("infers bounded question topics instead of inventing arbitrary modules", () => {
    expect(inferAgentQueryTopics("How do Iran sanctions and oil disruption affect FX reserves?")).toEqual(
      expect.arrayContaining(["energy_commodities", "fx_external_risk", "sanctions_restrictions"]),
    );
    const plan = buildAgentQueryPlan({
      question: "What is the latest FX and macro risk?",
      subjects: [{ type: "country", country_iso3: "IND" }],
    });
    expect(plan.topics).toEqual(expect.arrayContaining(["fx_external_risk", "macro_risk", "hot_topics"]));
    expect(plan.question_key).toBe("what is the latest fx and macro risk?");
    expect(plan.intent).toBe("single_subject");
  });

  it("infers only bounded intent classes and rejects conflicting intent language", () => {
    expect(inferAgentQueryIntent("Compare India versus the United States on macro risk")).toBe("comparison");
    expect(inferAgentQueryIntent("Audit the provenance and methodology for this risk object")).toBe("audit");
    expect(() => inferAgentQueryIntent("Compare and rank these countries by highest risk")).toThrow("AMBIGUOUS_QUERY_INTENT");
    expect(() => buildAgentQueryPlan({
      intent: "audit",
      question: "Compare India and the United States on macro risk",
      subjects: [
        { type: "country", country_iso3: "IND" },
        { type: "country", country_iso3: "USA" },
      ],
      topics: ["macro_risk"],
    })).toThrow("QUERY_INTENT_CONFLICT");
  });

  it("rejects an ambiguous question with no supported topic", () => {
    expect(() => buildAgentQueryPlan({
      question: "Tell me something useful",
      subjects: [{ type: "country", country_iso3: "IND" }],
    })).toThrow("UNSUPPORTED_OR_AMBIGUOUS_AGENT_QUESTION");
  });

  it("grounds ranking requests in a structured signed Risk Object score specification", () => {
    expect(() => buildAgentQueryPlan({
      intent: "ranking_filter",
      subjects: [
        { type: "country", country_iso3: "IND" },
        { type: "country", country_iso3: "USA" },
      ],
    })).toThrow("RANKING_FILTER_REQUIRES_MULTIPLE_SUBJECTS_AND_RANKING_SPEC");

    const plan = buildAgentQueryPlan({
      intent: "ranking_filter",
      ranking: { metric: "risk_object_score", order: "high_to_low", limit: 2 },
      subjects: [
        { type: "country", country_iso3: "USA" },
        { type: "country", country_iso3: "IND" },
      ],
    });
    expect(plan.intent).toBe("ranking_filter");
    expect(plan.topics).toContain("risk_object");
    expect(plan.required_modules).toContain("signed_risk_object");
  });

  it("grounds change analysis in the previous signed publication instead of arbitrary historical substitution", () => {
    const plan = buildAgentQueryPlan({
      intent: "change_since",
      change: { baseline: "previous_published" },
      subjects: [{ type: "country", country_iso3: "IND" }],
    });
    expect(plan.intent).toBe("change_since");
    expect(plan.topics).toContain("risk_object");
    expect(plan.change).toEqual({ baseline: "previous_published" });

    expect(() => buildAgentQueryPlan({
      intent: "change_since",
      subjects: [{ type: "country", country_iso3: "IND" }],
    })).toThrow("CHANGE_SINCE_REQUIRES_ONE_SUBJECT_AND_BASELINE_SPEC");
  });

  it("makes audit intent independently verifiable by requiring a signed Risk Object", () => {
    const plan = buildAgentQueryPlan({
      intent: "audit",
      subjects: [{ type: "country", country_iso3: "IND" }],
    });
    expect(plan.topics).toContain("risk_object");
    expect(plan.required_modules).toEqual(["signed_risk_object"]);
  });

  it("requires action context when Risk Gate is requested", () => {
    expect(() => buildAgentQueryPlan({
      subjects: [{ type: "country", country_iso3: "IND" }],
      topics: ["risk_gate"],
    })).toThrow("RISK_GATE_CONTEXT_REQUIRED");
    expect(() => buildAgentQueryPlan({
      subjects: [{ type: "country", country_iso3: "IND" }],
      topics: ["risk_gate"],
      risk_gate_context: { action_type: "treasury_payment", policy_preset: "strict", amount_usdc: 1000 },
    })).not.toThrow();
  });

  it("does not silently answer historical structural or GRI questions with current data", () => {
    expect(() => buildAgentQueryPlan({
      subjects: [{ type: "country", country_iso3: "IND" }],
      topics: ["macro_risk"],
      as_of: "2024-01-01T00:00:00.000Z",
    })).toThrow("HISTORICAL_AS_OF_UNSUPPORTED_FOR_REQUESTED_MODULES");
    expect(() => buildAgentQueryPlan({
      subjects: [{ type: "country", country_iso3: "IND" }],
      topics: ["gri_context"],
      as_of: "2024-01-01T00:00:00.000Z",
    })).toThrow("HISTORICAL_AS_OF_UNSUPPORTED_FOR_REQUESTED_MODULES");
    expect(() => buildAgentQueryPlan({
      subjects: [{ type: "country", country_iso3: "IND" }],
      topics: ["risk_gate"],
      as_of: "2024-01-01T00:00:00.000Z",
      risk_gate_context: { action_type: "exposure_review", policy_preset: "balanced" },
    })).not.toThrow();
  });

  it("lets callers tighten freshness but never relax the module SLA", () => {
    const relaxed = buildAgentQueryPlan({
      subjects: [{ type: "country", country_iso3: "IND" }],
      topics: ["hot_topics"],
      max_age_seconds: 30 * 86_400,
    });
    expect(relaxed.module_max_age_seconds.hot_topics).toBe(AGENT_MODULE_MAX_AGE_SECONDS.hot_topics);

    const strict = buildAgentQueryPlan({
      subjects: [{ type: "country", country_iso3: "IND" }],
      topics: ["macro_risk"],
      max_age_seconds: 3_600,
    });
    expect(strict.module_max_age_seconds.macro_monetary).toBe(3_600);
    expect(strict.module_max_age_seconds.sovereign_fiscal).toBe(3_600);
  });

  it("rejects unknown topics rather than silently mapping them", () => {
    expect(() => buildAgentQueryPlan({ ...base, topics: ["made_up_risk"] })).toThrow();
  });

  it("rejects an invalid same-country corridor", () => {
    expect(() => buildAgentQueryPlan({
      subjects: [{ type: "corridor", origin_country_iso3: "USA", destination_country_iso3: "USA" }],
      topics: ["trade_corridor"],
    })).toThrow();
  });

  it("binds payment to the exact query plan, question intent and commercial terms", () => {
    const plan = buildAgentQueryPlan(base);
    const common = {
      queryPlan: plan,
      amountAtomic: "20000",
      network: "eip155:8453",
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      payTo: "0x1111111111111111111111111111111111111111",
    };
    const first = paymentBindingForAgentQuery(common);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(paymentBindingForAgentQuery({ ...common, amountAtomic: "20001" })).not.toBe(first);

    const differentPlan = buildAgentQueryPlan({
      subjects: [{ type: "country", country_iso3: "IND" }],
      topics: ["sanctions_restrictions"],
    });
    expect(paymentBindingForAgentQuery({ ...common, queryPlan: differentPlan })).not.toBe(first);

    const questionBound = buildAgentQueryPlan({ ...base, question: "Current macro and FX risk for India" });
    expect(questionBound.query_plan_hash).not.toBe(plan.query_plan_hash);
  });
});
