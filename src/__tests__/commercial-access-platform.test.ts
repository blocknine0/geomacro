import {
  describe,
  expect,
  it,
} from "vitest";

import {
  tierAllowsCapability,
  tierCreditAllocation,
} from "../lib/commercial-access.server";

describe("commercial access platform v1", () => {
  it("keeps paid launch credit allocations aligned with the commercial contract", () => {
    expect(tierCreditAllocation("free")).toBe(0);
    expect(tierCreditAllocation("analyst_pilot")).toBe(5_000);
    expect(tierCreditAllocation("api_pilot")).toBe(20_000);
    expect(tierCreditAllocation("institutional")).toBe(100_000);
  });

  it("does not expose the commercial API to Free Explorer", () => {
    expect(tierAllowsCapability("free", "intelligence_query")).toBe(false);
    expect(tierAllowsCapability("free", "gri_read")).toBe(false);
    expect(tierAllowsCapability("free", "structural_country_digest")).toBe(false);
    expect(tierAllowsCapability("free", "structural_corridor_digest")).toBe(false);
    expect(tierAllowsCapability("free", "structural_country_profile")).toBe(false);
    expect(tierAllowsCapability("free", "signed_risk_object")).toBe(false);
    expect(tierAllowsCapability("free", "risk_gate_bundle")).toBe(false);
  });

  it("keeps Analyst as a paid dashboard entitlement rather than an API credential tier", () => {
    expect(tierAllowsCapability("analyst_pilot", "intelligence_query")).toBe(false);
    expect(tierAllowsCapability("analyst_pilot", "gri_read")).toBe(false);
    expect(tierAllowsCapability("analyst_pilot", "structural_country_profile")).toBe(false);
    expect(tierAllowsCapability("analyst_pilot", "structural_corridor_profile")).toBe(false);
    expect(tierAllowsCapability("analyst_pilot", "signed_risk_object")).toBe(false);
    expect(tierAllowsCapability("analyst_pilot", "risk_gate_bundle")).toBe(false);
  });

  it("enables commercial API, signed Risk Objects and Risk Gate only for API/Institutional tiers", () => {
    for (const tier of ["api_pilot", "institutional"] as const) {
      expect(tierAllowsCapability(tier, "intelligence_query")).toBe(true);
      expect(tierAllowsCapability(tier, "structural_country_profile")).toBe(true);
      expect(tierAllowsCapability(tier, "signed_risk_object")).toBe(true);
      expect(tierAllowsCapability(tier, "risk_gate_bundle")).toBe(true);
    }
  });
});
