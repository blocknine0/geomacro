import { describe, expect, it } from "vitest";

import {
  COMMERCIAL_OFFER_REGISTRY,
  STRUCTURED_DATA_REGISTRY_VERSION,
  STRUCTURED_PRODUCT_REGISTRY,
  STRUCTURED_TIER_REGISTRY,
  offerToCanonicalEntitlement,
  structuredDeliveryPolicy,
  tierAllowsStructuredCapability,
} from "../lib/structured-data-entitlement-registry";

describe("structured data entitlement registry", () => {
  it("keeps free users on the public website only with no commercial API entitlement", () => {
    const free = STRUCTURED_TIER_REGISTRY.free;
    expect(free.access_surfaces).toEqual(["public_web"]);
    expect(free.api_access).toBe(false);
    expect(free.included_capabilities).toEqual([]);
    expect(free.export_mode).toBe("none");
    expect(free.signed_risk_objects).toBe(false);
    expect(free.risk_gate).toBe(false);
    expect(tierAllowsStructuredCapability("free", "gri_read")).toBe(false);
    expect(tierAllowsStructuredCapability("free", "structural_country_digest")).toBe(false);
  });

  it("keeps Analyst paid but dashboard-oriented rather than silently granting API access", () => {
    const analyst = STRUCTURED_TIER_REGISTRY.analyst_pilot;
    expect(analyst.access_surfaces).toContain("paid_dashboard");
    expect(analyst.api_access).toBe(false);
    expect(analyst.history_mode).toBe("bounded_history");
    expect(analyst.signed_risk_objects).toBe(false);
    expect(analyst.risk_gate).toBe(false);
    expect(tierAllowsStructuredCapability("analyst_pilot", "structural_country_profile")).toBe(false);
  });

  it("grants machine-readable Risk Object and Risk Gate only through API-enabled tiers", () => {
    for (const tier of ["api_pilot", "institutional"] as const) {
      expect(STRUCTURED_TIER_REGISTRY[tier].api_access).toBe(true);
      expect(tierAllowsStructuredCapability(tier, "signed_risk_object")).toBe(true);
      expect(tierAllowsStructuredCapability(tier, "risk_gate_bundle")).toBe(true);
    }
    expect(STRUCTURED_PRODUCT_REGISTRY.risk_gate_bundle.execution_authorized).toBe(false);
    expect(STRUCTURED_PRODUCT_REGISTRY.risk_gate_bundle.raw_data_included).toBe(false);
    expect(STRUCTURED_PRODUCT_REGISTRY.risk_gate_bundle.private_warehouse_access).toBe(false);
  });

  it("makes product output limits server-owned and tier-specific", () => {
    const api = structuredDeliveryPolicy("api_pilot", "structural_country_profile");
    const institutional = structuredDeliveryPolicy("institutional", "structural_country_profile");
    expect(api.registry_version).toBe(STRUCTURED_DATA_REGISTRY_VERSION);
    expect(api.allowed).toBe(true);
    expect(api.tier.max_structural_observations).toBe(12);
    expect(api.tier.max_evidence_references).toBe(30);
    expect(institutional.tier.max_structural_observations).toBe(50);
    expect(institutional.tier.max_evidence_references).toBe(100);
  });

  it("maps provider payments to canonical offers instead of provider-defined capabilities", () => {
    const machine = offerToCanonicalEntitlement("machine_risk_preflight");
    expect(machine.payment_required).toBe(true);
    expect(machine.entitlement_kind).toBe("one_shot");
    expect(machine.tier).toBe("api_pilot");
    expect(machine.one_shot_capability).toBe("risk_gate_bundle");
    expect(COMMERCIAL_OFFER_REGISTRY.machine_risk_preflight).not.toHaveProperty("provider");
  });

  it("keeps global safety boundaries false for every structured product", () => {
    for (const product of Object.values(STRUCTURED_PRODUCT_REGISTRY)) {
      expect(product.execution_authorized).toBe(false);
      expect(product.raw_data_included).toBe(false);
      expect(product.private_warehouse_access).toBe(false);
      expect(product.structural_data_is_gri_v1_2_input).toBe(false);
    }
  });
});
