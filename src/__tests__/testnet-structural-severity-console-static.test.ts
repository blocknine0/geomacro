import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runner = readFileSync("src/lib/testnet-intelligence-capability.server.ts", "utf8");
const contract = readFileSync("src/lib/testnet-intelligence-contract.ts", "utf8");
const severityService = readFileSync("src/lib/testnet-live-severity.server.ts", "utf8");
const apiRoute = readFileSync("server/api/testnet-tester/intelligence.post.ts", "utf8");
const developerApiRoute = readFileSync("server/api/testnet/intelligence.post.ts", "utf8");
const preflight = readFileSync("src/lib/testnet-intelligence-preflight.server.ts", "utf8");
const consoleRoute = readFileSync("server/routes/testnet-console.get.ts", "utf8");
const consoleScript = readFileSync("public/testnet-console.js", "utf8");
const pricingScript = readFileSync("public/testnet-console-pricing.js", "utf8");

describe("testnet canonical intelligence console", () => {
  it("serves all governed Testnet capabilities through the shared delivery service", () => {
    expect(contract).toContain("intelligence_query");
    expect(contract).toContain("gri_read");
    expect(contract).toContain("structural_country_digest");
    expect(contract).toContain("structural_corridor_profile");
    expect(contract).toContain("signed_risk_object");
    expect(contract).toContain("risk_gate_bundle");
    expect(apiRoute).toContain("deliverTestnetIntelligence");
    expect(runner).toContain("loadStructuralContext");
    expect(runner).toContain("readPublicGlobalRisk");
  });

  it("reads actual severity from the canonical live structured event table", () => {
    expect(severityService).toContain('.from("live_structured_events")');
    expect(severityService).toContain('"id,event_type,primary_country,countries,severity,confidence,direction,first_seen_at,last_seen_at,structure_version"');
    expect(severityService).toContain('scale: "0-100"');
    expect(runner).toContain("loadTestnetLiveSeverity");
  });

  it("keeps structural, GRI, Risk Object and Risk Gate provenance explicit", () => {
    expect(runner).toContain("observations,");
    expect(runner).toContain("severity,");
    expect(runner).toContain("methodology_version");
    expect(runner).toContain("proof_hash");
    expect(runner).toContain("public_verification");
    expect(runner).toContain("execution_authorized: false");
    expect(severityService).toContain('source_table: "live_structured_events"');
  });

  it("exposes pay-per-call capability selection and wallet retry in the browser console", () => {
    expect(consoleRoute).toContain('/testnet-console.js');
    expect(consoleRoute).toContain('/testnet-console-pricing.js');
    expect(consoleRoute).toContain("CANONICAL INTELLIGENCE PIPELINE");
    expect(consoleScript).toContain('/api/testnet-tester/intelligence');
    expect(consoleScript).toContain("TESTNET_PAYMENT_REQUIRED");
    expect(consoleScript).toContain("Pay Testnet USDC & retry");
    expect(consoleScript).toContain("eth_sendTransaction");
    expect(consoleScript).toContain("Credits remaining");
    expect(consoleScript).toContain("Create share card");
  });

  it("renders browser capability labels from the authenticated canonical pricing config", () => {
    expect(pricingScript).toContain('/api/testnet-tester/config');
    expect(pricingScript).toContain("capability_prices");
    expect(pricingScript).toContain("price.credits");
    expect(pricingScript).toContain("price.testnet_usdc");
    expect(pricingScript).toContain("The payment quote remains the canonical authority");
  });

  it("preflights fulfillment prerequisites before either paid API surface can quote or settle", () => {
    expect(preflight).toContain("loadStructuralContext");
    expect(preflight).toContain("verifyPublicRiskObjectArtifact");
    expect(preflight).toContain("readPublicGlobalRisk");
    expect(preflight).toContain("SIGNED_RISK_OBJECT_NOT_VERIFIED");
    expect(preflight).toContain("STRUCTURAL_DATA_UNAVAILABLE");

    for (const route of [apiRoute, developerApiRoute]) {
      expect(route).toContain("preflightTestnetIntelligenceAvailability");
      expect(route.indexOf("await preflightTestnetIntelligenceAvailability(request)")).toBeGreaterThan(-1);
      expect(route.indexOf("await preflightTestnetIntelligenceAvailability(request)")).toBeLessThan(
        route.indexOf("deliverTestnetIntelligence({"),
      );
    }
  });
});
