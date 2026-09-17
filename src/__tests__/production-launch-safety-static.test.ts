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

  it("requires strict P0, reconciled provider canaries and marketplace verification before promotion", () => {
    const manifest = JSON.parse(read("config/commercial-launch-manifest.json"));

    for (const gate of [
      "strict_p0_capacity_closure",
      "provider_capped_paid_smoke_reconciled",
      "marketplace_post_listing_verification",
      "emergency_freeze_and_provider_quarantine",
      "support_and_incident_ownership",
    ]) {
      expect(manifest.required_gates).toContain(gate);
    }

    expect(
      manifest.launch_rule.require_reconciled_capped_real_purchase_before_marketplace_promotion,
    ).toBe(true);
    expect(manifest.launch_rule.require_post_listing_endpoint_probe).toBe(true);
    expect(manifest.launch_rule.require_truthful_runtime_price_and_network_metadata).toBe(true);
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

  it("documents canary-before-listing and reconciliation-before-revenue", () => {
    const doc = read("docs/PRODUCTION_LAUNCH_ACCEPTANCE.md");

    expect(doc).toContain("Isolated real-money canary");
    expect(doc).toContain("payment success is not treated as proof of Bazaar visibility");
    expect(doc).toContain("Marketplace promotion only after production smoke is clean");
    expect(doc).toContain("A payment is not commercial revenue merely because the provider says");
    expect(doc).toContain("Automatic social publication remains disabled");
  });
});
