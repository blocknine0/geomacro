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
    expect(manifest.commercial_milestone.pricing_contract_version).toBe("geomacro.capability-usdc.v2");
    expect(manifest.commercial_milestone.pricing_model).toBe("MONTHLY_CREDITS_ONE_TIME_PACKS_AND_CAPABILITY_X402");
    expect(manifest.commercial_milestone.founder_separately_authorized_first_live_canary_usdc).toBe("0.05");
    expect(manifest.commercial_milestone.credit_units_separate_from_usdc).toBe(true);
    expect(manifest.commercial_milestone.pre_funding_required).toBe(false);
    expect(manifest.launch_rule.scale_certification_required_before_initial_launch).toBe(false);
    expect(manifest.launch_rule.require_internal_real_money_canary_before_initial_launch).toBe(false);
    expect(manifest.launch_rule.require_external_first_purchase_before_revenue_claim).toBe(true);
    expect(manifest.launch_rule.require_marketplace_verification_before_initial_launch).toBe(false);
  });

  it("requires explicitly non-funded capability-priced manual acceptance", () => {
    const workflow = read(".github/workflows/initial-commercial-pay-per-call-acceptance.yml");
    expect(workflow).toContain("ACCEPT_GEOMACRO_CAPABILITY_PRICES_NO_FUNDS");
    expect(workflow).not.toContain("ACCEPT_GEOMACRO_INITIAL_0_05_USDC_PAY_PER_CALL");
    expect(workflow).toContain("geomacro.capability-usdc.v2");
    expect(workflow).toContain("MONTHLY_CREDITS_ONE_TIME_PACKS_AND_CAPABILITY_X402");
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

  it("documents capability-priced no-funds acceptance and authentic receipt-only revenue", () => {
    const doc = read("docs/PRODUCTION_LAUNCH_ACCEPTANCE.md");

    expect(doc).toContain("geomacro.capability-usdc.v2");
    expect(doc).toContain("8 approved capabilities and 14 USDC variants");
    expect(doc).toContain("REAL FUNDS DISABLED");
    expect(doc).toContain("separate founder ACK");
    expect(doc).toContain("Not mandatory for the first legitimate sale");
    expect(doc).toContain("Testnet payments never count");
    expect(doc).not.toContain("canonical launch price of **0.05 USDC per successful");
  });
});
