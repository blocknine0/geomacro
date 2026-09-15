import type { TestnetIntelligenceCapability } from "./testnet-intelligence-contract";

export const TESTNET_DEVELOPER_SCOPES = [
  "commercial:read",
  "testnet:structured",
  "testnet:risk-object",
  "testnet:risk-gate",
  "testnet:agent",
] as const;

export type TestnetDeveloperScope = (typeof TESTNET_DEVELOPER_SCOPES)[number];
export type TestnetIntegrationType = "product_api" | "ai_agent" | "automation" | "demo";

const INTEGRATION_SCOPES: Record<TestnetIntegrationType, readonly TestnetDeveloperScope[]> = {
  product_api: [
    "commercial:read",
    "testnet:structured",
    "testnet:risk-object",
    "testnet:risk-gate",
  ],
  ai_agent: [
    "commercial:read",
    "testnet:structured",
    "testnet:risk-object",
    "testnet:risk-gate",
    "testnet:agent",
  ],
  automation: [
    "commercial:read",
    "testnet:structured",
    "testnet:risk-object",
    "testnet:risk-gate",
  ],
  demo: [
    "commercial:read",
    "testnet:structured",
    "testnet:risk-object",
  ],
};

const CAPABILITY_SCOPE: Record<TestnetIntelligenceCapability, TestnetDeveloperScope> = {
  intelligence_query: "testnet:structured",
  gri_read: "testnet:structured",
  structural_country_digest: "testnet:structured",
  structural_corridor_digest: "testnet:structured",
  structural_country_profile: "testnet:structured",
  structural_corridor_profile: "testnet:structured",
  signed_risk_object: "testnet:risk-object",
  risk_gate_bundle: "testnet:risk-gate",
};

export function testnetDeveloperScopesForIntegration(
  integrationType: TestnetIntegrationType,
): TestnetDeveloperScope[] {
  return [...INTEGRATION_SCOPES[integrationType]];
}

export function requiredTestnetScopeForCapability(
  capability: TestnetIntelligenceCapability,
): TestnetDeveloperScope {
  return CAPABILITY_SCOPE[capability];
}

export function hasTestnetCapabilityScope(input: {
  keyId: string;
  scopes: readonly string[];
  capability: TestnetIntelligenceCapability;
}): boolean {
  // Production/commercial bearer credentials have a separate entitlement contract.
  // This least-privilege gate applies specifically to wallet-issued Testnet keys.
  if (!input.keyId.startsWith("gmk_test_")) return true;
  return input.scopes.includes(requiredTestnetScopeForCapability(input.capability));
}
