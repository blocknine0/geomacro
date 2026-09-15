import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("Risk Object well-known trust surfaces", () => {
  it("publishes standard JWKS from server-controlled verification keys", () => {
    const route = read("server/routes/.well-known/jwks.json.get.ts");
    const discovery = read("src/lib/risk-object-trust-discovery.server.ts");

    expect(route).toContain("ensureRiskObjectRuntimePublicKey");
    expect(route).toContain("publicRiskObjectJwks");
    expect(route).toContain("application/jwk-set+json");
    expect(route).not.toContain("PRIVATE_KEY");

    expect(discovery).toContain('RISK_OBJECT_JWKS_PATH = "/.well-known/jwks.json"');
    expect(discovery).toContain('kty: "OKP"');
    expect(discovery).toContain('crv: "Ed25519"');
    expect(discovery).toContain('alg: "EdDSA"');
  });

  it("publishes independent trust metadata including chain anchors", () => {
    const route = read("server/routes/.well-known/geomacro-risk-keys.json.get.ts");
    const discovery = read("src/lib/risk-object-trust-discovery.server.ts");

    expect(route).toContain("publicRiskObjectTrustDiscovery");
    expect(discovery).toContain('signed_observation_timestamp: "observed_at"');
    expect(discovery).toContain('caip2: "eip155:84532"');
    expect(discovery).toContain('caip2: "eip155:5042002"');
    expect(discovery).toContain("BASE_SEPOLIA_RISK_KEY_REGISTRY");
    expect(discovery).toContain("0xb1881d2f0026395d5016b90031a8acc651a2e316");
    expect(discovery).not.toContain("process.env.RISK_OBJECT_KEY_REGISTRY_BASE_SEPOLIA");
    expect(discovery).toContain("RISK_OBJECT_KEY_REGISTRY_ARC_TESTNET");
    expect(discovery).toContain("execution_authorized: false");
  });

  it("delivers complete signed objects and trust discovery through x402", () => {
    const agentic = read("src/lib/agentic-demo-service.server.ts");
    const coinbase = read("src/routes/api.x402.risk.ts");

    expect(coinbase).toContain("runAgenticPreflightDemo");
    expect(agentic).toContain("return object;");
    expect(agentic).toContain("risk_object: riskObject");
    expect(agentic).toContain("risk_object_trust: publicRiskObjectTrustDiscovery()");
    expect(agentic).toContain("verifyCommercialRiskObjectArtifact");
  });
});
