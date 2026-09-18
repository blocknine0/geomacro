import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("production launch safety contract", () => {
  it("keeps the initial paid cohort coordinated and includes Circle explicitly", () => {
    const manifest = JSON.parse(read("config/commercial-launch-manifest.json"));

    for (const provider of ["coinbase_x402", "circle_gateway_x402", "nevermined"]) {
      expect(manifest.providers[provider].launch_cohort).toBe(true);
      expect(manifest.providers[provider].production_enabled).toBe(false);
    }

    expect(manifest.providers.goat_x402.launch_cohort).toBe(false);
    expect(manifest.launch_rule.allow_partial_provider_launch).toBe(false);
  });

  it("requires the lean initial pay-per-call gate and separates post-launch/scale evidence", () => {
    const manifest = JSON.parse(read("config/commercial-launch-manifest.json"));

    expect(manifest.required_gates).toContain("initial_commercial_pay_per_call_acceptance");
    expect(manifest.required_gates).not.toContain("strict_p0_capacity_closure");
    expect(manifest.required_gates).not.toContain("provider_capped_paid_smoke_reconciled");
    expect(manifest.required_gates).not.toContain("marketplace_post_listing_verification");

    expect(manifest.post_launch_promotion_gates).toEqual([
      "provider_capped_paid_smoke_reconciled",
      "marketplace_post_listing_verification",
    ]);
    expect(manifest.optional_scale_gates).toEqual([
      "strict_p0_capacity_closure",
      "distributed_40k_observability_closure",
    ]);
    expect(manifest.commercial_milestone.launch_price_usdc).toBe("0.05");
    expect(manifest.commercial_milestone.early_adoption_delivery_target).toBe(10000);
    expect(manifest.commercial_milestone.pre_funding_required).toBe(false);
    expect(manifest.launch_rule.scale_certification_required_before_initial_launch).toBe(false);
    expect(manifest.launch_rule.require_internal_real_money_canary_before_initial_launch).toBe(false);
    expect(manifest.launch_rule.require_external_first_purchase_before_revenue_claim).toBe(true);
    expect(manifest.launch_rule.require_marketplace_verification_before_initial_launch).toBe(false);
  });

  it("ships global freeze and provider quarantine controls disabled by default", () => {
    const env = read(".env.example");
    const gate = read("src/lib/commercial-launch-gate.server.ts");

    expect(env).toContain("GEOMACRO_COMMERCE_EMERGENCY_FREEZE=false");
    expect(env).toContain("GEOMACRO_COMMERCE_DISABLED_PROVIDERS=");
    expect(gate).toContain("GEOMACRO_COMMERCE_EMERGENCY_FREEZE");
    expect(gate).toContain("GEOMACRO_COMMERCE_DISABLED_PROVIDERS");
    expect(gate).toContain("GEOMACRO_COMMERCE_EMERGENCY_FREEZE_ACTIVE");
    expect(gate).toContain("_PRODUCTION_QUARANTINED");
  });

  it("documents the no-funds initial pay-per-call path and post-launch reconciliation", () => {
    const doc = read("docs/PRODUCTION_LAUNCH_ACCEPTANCE.md");

    expect(doc).toContain("Initial Commercial Pay-Per-Call Launch Acceptance");
    expect(doc).toContain("The first 10,000 deliveries are an adoption and revenue milestone");
    expect(doc).toContain("The founder does not need to purchase 10,000 calls");
    expect(doc).toContain("Optional scale certification");
    expect(doc).toContain("A payment is not commercial revenue merely because the provider says");
    expect(doc).toContain("Automatic social publication remains disabled");
  });
});
