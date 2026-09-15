import { describe, expect, it } from "vitest";

import {
  hasTestnetCapabilityScope,
  requiredTestnetScopeForCapability,
  testnetDeveloperScopesForIntegration,
} from "../lib/testnet-developer-scopes";

describe("Testnet developer least-privilege scopes", () => {
  it("keeps agent scope exclusive to AI-agent credentials", () => {
    expect(testnetDeveloperScopesForIntegration("ai_agent")).toContain("testnet:agent");
    expect(testnetDeveloperScopesForIntegration("product_api")).not.toContain("testnet:agent");
    expect(testnetDeveloperScopesForIntegration("automation")).not.toContain("testnet:agent");
    expect(testnetDeveloperScopesForIntegration("demo")).not.toContain("testnet:agent");
  });

  it("does not grant Risk Gate scope to demo credentials by default", () => {
    expect(testnetDeveloperScopesForIntegration("demo")).toEqual([
      "commercial:read",
      "testnet:structured",
      "testnet:risk-object",
    ]);
  });

  it("maps each metered capability to the minimum required scope", () => {
    expect(requiredTestnetScopeForCapability("intelligence_query")).toBe("testnet:structured");
    expect(requiredTestnetScopeForCapability("gri_read")).toBe("testnet:structured");
    expect(requiredTestnetScopeForCapability("structural_country_digest")).toBe("testnet:structured");
    expect(requiredTestnetScopeForCapability("structural_corridor_profile")).toBe("testnet:structured");
    expect(requiredTestnetScopeForCapability("signed_risk_object")).toBe("testnet:risk-object");
    expect(requiredTestnetScopeForCapability("risk_gate_bundle")).toBe("testnet:risk-gate");
  });

  it("fails a wallet-issued Testnet key closed when its capability scope is missing", () => {
    expect(
      hasTestnetCapabilityScope({
        keyId: "gmk_test_example012345678901234567890",
        scopes: ["commercial:read", "testnet:structured"],
        capability: "risk_gate_bundle",
      }),
    ).toBe(false);
  });

  it("does not reinterpret production commercial bearer scopes as Testnet wallet scopes", () => {
    expect(
      hasTestnetCapabilityScope({
        keyId: "commercial-key-id",
        scopes: [],
        capability: "risk_gate_bundle",
      }),
    ).toBe(true);
  });
});
