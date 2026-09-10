import { describe, expect, it } from "vitest";

import { canonicalGrantPolicy } from "../lib/commercial-entitlement-policy";
import { STRUCTURED_DATA_REGISTRY_VERSION } from "../lib/structured-data-entitlement-registry";

describe("canonical commercial entitlement policy", () => {
  it("allows the canonical API subscription to use API-tier capabilities", () => {
    const result = canonicalGrantPolicy({
      tier: "api_pilot",
      capability: "structural_country_profile",
      metadata: {
        offer_id: "api_risk_gate_pilot_30d",
        structured_data_registry_version: STRUCTURED_DATA_REGISTRY_VERSION,
      },
    });
    expect(result.allowed).toBe(true);
    expect(result.offer_id).toBe("api_risk_gate_pilot_30d");
    expect(result.entitlement_kind).toBe("subscription");
  });

  it("does not turn a one-shot machine preflight payment into the full API tier", () => {
    const metadata = {
      offer_id: "machine_risk_preflight",
      structured_data_registry_version: STRUCTURED_DATA_REGISTRY_VERSION,
    };

    expect(
      canonicalGrantPolicy({
        tier: "api_pilot",
        capability: "risk_gate_bundle",
        metadata,
      }).allowed,
    ).toBe(true);

    const profile = canonicalGrantPolicy({
      tier: "api_pilot",
      capability: "structural_country_profile",
      metadata,
    });
    expect(profile.allowed).toBe(false);
    expect(profile.code).toBe("ONE_SHOT_CAPABILITY_MISMATCH");
  });

  it("fails closed for unknown offers, mismatched tiers and stale registry versions", () => {
    expect(
      canonicalGrantPolicy({
        tier: "api_pilot",
        capability: "risk_gate_bundle",
        metadata: { offer_id: "provider-injected-super-tier" },
      }).code,
    ).toBe("UNKNOWN_OFFER");

    expect(
      canonicalGrantPolicy({
        tier: "institutional",
        capability: "risk_gate_bundle",
        metadata: { offer_id: "api_risk_gate_pilot_30d" },
      }).code,
    ).toBe("OFFER_TIER_MISMATCH");

    expect(
      canonicalGrantPolicy({
        tier: "api_pilot",
        capability: "risk_gate_bundle",
        metadata: {
          offer_id: "api_risk_gate_pilot_30d",
          structured_data_registry_version: "structured-entitlements-v0",
        },
      }).code,
    ).toBe("REGISTRY_VERSION_MISMATCH");
  });

  it("never treats Free or Analyst as commercial API tiers", () => {
    expect(
      canonicalGrantPolicy({
        tier: "free",
        capability: "gri_read",
        metadata: {},
      }).allowed,
    ).toBe(false);
    expect(
      canonicalGrantPolicy({
        tier: "analyst_pilot",
        capability: "structural_country_profile",
        metadata: {},
      }).allowed,
    ).toBe(false);
  });
});
