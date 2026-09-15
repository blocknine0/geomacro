import { describe, expect, it } from "vitest";
import { buildAgentQueryPlan, paymentBindingForAgentQuery } from "./agent-query-plan";

const base = {
  subjects: [{ type: "country" as const, country_iso3: "ind" }],
  topics: ["macro_risk" as const, "fx_external_risk" as const],
};

describe("adaptive agent query planner", () => {
  it("normalizes ISO3 and deterministically selects governed modules", () => {
    const plan = buildAgentQueryPlan(base);
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

  it("rejects unknown topics rather than silently mapping them", () => {
    expect(() => buildAgentQueryPlan({ ...base, topics: ["made_up_risk"] })).toThrow();
  });

  it("rejects an invalid same-country corridor", () => {
    expect(() => buildAgentQueryPlan({
      subjects: [{ type: "corridor", origin_country_iso3: "USA", destination_country_iso3: "USA" }],
      topics: ["trade_corridor"],
    })).toThrow();
  });

  it("binds payment to the exact query plan and commercial terms", () => {
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
  });
});
