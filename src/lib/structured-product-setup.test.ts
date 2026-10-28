import { describe, it, expect } from "vitest";
import { structuredProductSetup } from "./structured-product-setup";
import { buildAgentQueryPlan } from "./agent-query-plan";
import { resolveVerifiedPublishedPlanPrice } from "./capability-pricing-verified-plan.server";

describe("all twelve structured product setups", () => {
  it("binds each executable request to its exact canonical price and fields", () => {
    const setup = structuredProductSetup();
    expect(setup.variant_count).toBe(12);
    expect(setup.products.filter(p=>p.launch_status==="COMING_SOON")).toHaveLength(3);
    expect(setup.products.filter(p=>p.new_sales_allowed)).toHaveLength(9);
    expect(setup.capability_count).toBe(7);
    expect(new Set(setup.products.map((p) => p.capability + "/" + p.variant)).size).toBe(12);
    for (const row of setup.products) {
      const plan = buildAgentQueryPlan(row.example_request);
      const structural = row.capability.startsWith("structural_");
      const price = resolveVerifiedPublishedPlanPrice(plan, {
        evidence_verified: true,
        rights_verified: true,
        deliverable: true,
        signing_verified: !structural,
        signed_object_lifecycle: structural ? "none" : row.id === "signed_new" ? "new" : "existing",
        change_attribution_verified: false,
        store_structural_scope_verified: structural,
      });
      expect(price.amount_usdc).toBe(row.price_usdc);
      expect(price.amount_atomic).toBe(row.amount_atomic);
      expect(row.required_fields.length).toBeGreaterThan(0);
      expect(row.payment_authorized).toBe(false);
    }
    expect(setup.live_availability_claimed).toBe(false);
    expect(setup.ingestion_per_product).toBe(false);
    expect(setup.preparation_check.quote_issued).toBe(false);
    expect(setup.products.find((p) => p.id === "signed_new")!.request_time_fields).toEqual([
      "product.issued_after",
    ]);
  });
  it("includes the signed object in every gate price and never in structural baselines", () => {
    const products = structuredProductSetup().products;
    for (const row of products.filter((p) => p.capability === "risk_gate_bundle"))
      expect(row.signed_object_fee).toBe("INCLUDED_NO_DOUBLE_CHARGE");
    for (const row of products.filter((p) => p.capability.startsWith("structural_"))) {
      const plan = buildAgentQueryPlan(row.example_request);
      expect(plan.required_modules).not.toContain("signed_risk_object");
      expect(plan.required_modules).not.toContain("risk_gate");
    }
  });
});
