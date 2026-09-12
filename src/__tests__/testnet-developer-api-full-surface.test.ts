import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  STRUCTURED_TIER_REGISTRY,
} from "../lib/structured-data-entitlement-registry";
import {
  testnetDeveloperApiManifest,
} from "../lib/testnet-developer-api-manifest";
import {
  TESTNET_INTELLIGENCE_CAPABILITIES,
  TESTNET_INTELLIGENCE_CAPABILITY_CATALOG,
  testnetIntelligenceRequestSchema,
} from "../lib/testnet-intelligence-contract";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("Testnet developer API full product surface", () => {
  it("publishes all Testnet entitlement capabilities in the machine-readable manifest", () => {
    const manifest = testnetDeveloperApiManifest();

    expect(manifest.api_version).toBe("testnet-intelligence-v1.0.0");
    expect([...Object.keys(manifest.capabilities)].sort()).toEqual(
      [...TESTNET_INTELLIGENCE_CAPABILITIES].sort(),
    );
    expect([...manifest.entitlement.included_capabilities].sort()).toEqual(
      [...STRUCTURED_TIER_REGISTRY.testnet_tester.included_capabilities].sort(),
    );
    expect(manifest.full_product_api_surface.full_machine_decision_bundle).toBe(
      "risk_gate_bundle",
    );
    expect(manifest.boundaries.execution_authorized).toBe(false);
    expect(manifest.boundaries.raw_data_included).toBe(false);
  });

  it("keeps every catalog request example valid against the canonical request schema", () => {
    for (const capability of TESTNET_INTELLIGENCE_CAPABILITIES) {
      const entry = TESTNET_INTELLIGENCE_CAPABILITY_CATALOG[capability];
      const parsed = testnetIntelligenceRequestSchema.safeParse(entry.request_example);
      expect(parsed.success, capability).toBe(true);
    }
  });

  it("defines Risk Gate as the complete country/corridor machine-decision bundle", () => {
    const gate = TESTNET_INTELLIGENCE_CAPABILITY_CATALOG.risk_gate_bundle;

    expect(gate.full_product_bundle).toBe(true);
    expect(gate.signed_output).toBe(true);
    expect(gate.risk_gate_output).toBe(true);
    expect(gate.includes).toContain("canonical signed Risk Object and verification");
    expect(gate.includes).toContain("structural country/corridor profile");
    expect(gate.includes).toContain("canonical GRI");
    expect(gate.includes).toContain("GRI change attribution and proof hashes");
  });

  it("exposes discovery, account and intelligence endpoints without creating a second data path", () => {
    const manifestRoute = read("server/api/testnet/manifest.get.ts");
    const accountRoute = read("server/api/testnet/account.get.ts");
    const intelligenceRoute = read("server/api/testnet/intelligence.post.ts");
    const runner = read("src/lib/testnet-intelligence-capability.server.ts");

    expect(manifestRoute).toContain("testnetDeveloperApiManifest");
    expect(accountRoute).toContain("authenticateCommercialApiRequest");
    expect(accountRoute).toContain("ensureCommercialCreditAccount");
    expect(accountRoute).toContain("requireTestnetUsdcReceiver");
    expect(intelligenceRoute).toContain("deliverTestnetIntelligence");
    expect(intelligenceRoute).toContain("preflightTestnetIntelligenceAvailability");
    expect(runner).toContain("answerQuestion");
    expect(runner).toContain("readPublicGlobalRisk");
    expect(runner).toContain("loadStructuralContext");
    expect(runner).toContain("evaluateCountryRiskGate");
    expect(runner).toContain("evaluateCorridorRiskGate");
  });

  it("keeps account/discovery unmetered while intelligence remains pay per call", () => {
    const manifest = testnetDeveloperApiManifest();
    const accountRoute = read("server/api/testnet/account.get.ts");
    const intelligence = read("src/lib/testnet-intelligence-service.server.ts");

    expect(manifest.endpoints.manifest.metered).toBe(false);
    expect(manifest.endpoints.account.metered).toBe(false);
    expect(manifest.endpoints.intelligence.metered).toBe(true);
    expect(accountRoute).not.toContain("consumeCommercialCapability");
    expect(accountRoute).not.toContain("settleTestnetApiCall");
    expect(intelligence).toContain("settleTestnetApiCall");
  });

  it("documents the complete machine-readable Testnet workflow", () => {
    const docs = read("docs/TESTNET_DEVELOPER_API.md");

    expect(docs).toContain("/api/testnet/manifest");
    expect(docs).toContain("/api/testnet/account");
    expect(docs).toContain("/api/testnet/intelligence");
    expect(docs).toContain("GRI change attribution");
    expect(docs).toContain("signed Geomacro Risk Object");
    expect(docs).toContain("full machine-decision bundle");
    expect(docs).toContain("same `request_id`");
    expect(docs).toContain("must not double-charge payment or credits");
  });
});
