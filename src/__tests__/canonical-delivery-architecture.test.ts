import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("canonical one-data multi-delivery architecture", () => {
  it("keeps human Ask and pay-per-call Ask on the same answer engine", () => {
    const humanAsk = read("src/lib/ask-geomacro.functions.ts");
    const machine = read("src/lib/testnet-intelligence-capability.server.ts");

    expect(humanAsk).toContain("answerQuestion");
    expect(machine).toContain("answerQuestion");
  });

  it("keeps public GRI and machine GRI on the same canonical read service", () => {
    const publicRisk = read("src/lib/public-risk.functions.ts");
    const machine = read("src/lib/testnet-intelligence-capability.server.ts");
    const agentic = read("src/lib/agentic-demo-service.server.ts");

    expect(publicRisk).toContain("readPublicGlobalRisk");
    expect(machine).toContain("readPublicGlobalRisk");
    expect(agentic).toContain("readPublicGlobalRisk");
  });

  it("keeps structural API, Testnet pay-per-call and agentic proof on the same governed structural context", () => {
    const commercial = read("server/api/commercial/structural.post.ts");
    const machine = read("src/lib/testnet-intelligence-capability.server.ts");
    const assistive = read("src/lib/testnet-assistive-context.server.ts");
    const agentic = read("src/lib/agentic-demo-service.server.ts");

    for (const content of [commercial, machine, assistive, agentic]) {
      expect(content).toContain("loadStructuralContext");
    }

    expect(machine).not.toContain('from("structural_observations")');
    expect(agentic).not.toContain('from("structural_observations")');
  });

  it("keeps country/corridor Risk Gate logic shared across pay-per-call and x402 proof", () => {
    const machine = read("src/lib/testnet-intelligence-capability.server.ts");
    const agentic = read("src/lib/agentic-demo-service.server.ts");

    for (const content of [machine, agentic]) {
      expect(content).toContain("evaluateCountryRiskGate");
      expect(content).toContain("evaluateCorridorRiskGate");
      expect(content).toContain("execution_authorized");
    }
  });

  it("keeps signed Risk Objects canonical, authentic and commercially deliverable on machine paths", () => {
    const machine = read("src/lib/testnet-intelligence-capability.server.ts");
    const agentic = read("src/lib/agentic-demo-service.server.ts");

    expect(machine).toContain("getLatestCompatibleCountryRiskObject");
    expect(machine).toContain("getLatestCompatibleCorridorRiskObject");
    expect(machine).toContain("verifyCommercialRiskObjectArtifact");
    expect(machine).toContain("commercialVerification.deliverable");
    expect(machine).toContain("return object;");
    expect(agentic).toContain("verifyCommercialRiskObjectArtifact");
    expect(agentic).toContain("COMMERCIAL_RISK_OBJECT_NOT_DELIVERABLE");
  });

  it("treats direct Testnet pay-per-call as settlement around canonical intelligence", () => {
    const developerRoute = read("server/api/testnet/intelligence.post.ts");
    const browserRoute = read("server/api/testnet-tester/intelligence.post.ts");
    const delivery = read("src/lib/testnet-intelligence-service.server.ts");

    expect(developerRoute).toContain("deliverTestnetIntelligence");
    expect(browserRoute).toContain("deliverTestnetIntelligence");
    expect(delivery).toContain("settleTestnetApiCall");
    expect(delivery).toContain("runCanonicalTestnetIntelligence");
    expect(delivery.indexOf("settleTestnetApiCall")).toBeLessThan(
      delivery.indexOf("runCanonicalTestnetIntelligence"),
    );
    expect(delivery).toContain('payment_model: "pay_per_call"');
    expect(delivery).toContain("execution_authorized: false");
  });

  it("keeps A2A Testnet payment and delivery on the same canonical pay-per-call runner", () => {
    const a2a = read("src/lib/a2a-service.server.ts");

    expect(a2a).toContain("preflightTestnetIntelligenceAvailability");
    expect(a2a).toContain("settleTestnetApiCall");
    expect(a2a).toContain("runCanonicalTestnetIntelligence");
    expect(a2a).toContain('capability: "risk_gate_bundle"');
    expect(a2a).toContain("execution_authorized: false");
  });

  it("treats Circle and Coinbase x402 as payment rails over the same agentic Risk Gate service", () => {
    const circle = read("src/routes/api.agent.risk.ts");
    const coinbase = read("src/routes/api.x402.risk.ts");
    const agentic = read("src/lib/agentic-demo-service.server.ts");

    expect(circle).toContain("runAgenticPreflightDemo");
    expect(circle).toContain("settleCircleX402");
    expect(coinbase).toContain("runAgenticPreflightDemo");
    expect(coinbase).toContain("settleCoinbaseX402");
    expect(agentic).toContain("evaluateCountryRiskGate");
    expect(agentic).toContain("evaluateCorridorRiskGate");
    expect(agentic).toContain("loadStructuralContext");
    expect(agentic).toContain("readPublicGlobalRisk");
    expect(circle).toContain("execution_authorized: false");
    expect(coinbase).toContain("execution_authorized: false");
  });

  it("keeps GOAT x402 fulfillment on the same canonical agentic Risk Gate service", () => {
    const goat = read("src/lib/goat-pilot-service.server.ts");

    expect(goat).toContain("runAgenticPreflightDemo");
    expect(goat).toContain('mode: "GOAT_X402_PAID"');
    expect(goat).toContain("execution_authorized: false");
  });

  it("keeps a single documented architecture contract across product and delivery surfaces", () => {
    const contract = read("docs/CANONICAL_DELIVERY_ARCHITECTURE.md");
    const architecture = read("src/content/docs/02-product-architecture.md");
    const readme = read("README.md");
    const commercial = read("docs/COMMERCIAL_INTELLIGENCE.md");
    const testnet = read("docs/TESTNET_DEVELOPER_API.md");

    expect(contract).toContain("one governed intelligence foundation");
    expect(contract).toContain("pay-per-call");
    expect(contract).toContain("not a separate risk engine");
    expect(contract).toContain("same underlying data truth");

    expect(architecture).toContain("one shared evidence and provenance foundation");
    expect(architecture).toContain("Data & API is an access and delivery surface over this architecture");
    expect(architecture).toContain("second risk engine");

    expect(readme).toContain("Real-world evidence and data");
    expect(readme).toContain("Structured intelligence state");
    expect(readme).toContain("Customer-controlled action");

    expect(commercial).toContain("Data & API, Access & Pricing, institutional packaging, agent protocols and payment rails are delivery or presentation layers over the shared intelligence state");
    expect(commercial).toContain("Payment or access mechanisms, including x402, must never bypass source-license or commercial-use restrictions");

    expect(testnet).toContain("same canonical Geomacro intelligence pipeline");
    expect(testnet).toContain("There is no separate API-only risk database");
    expect(testnet).toContain("Payment model: pay per API call");
  });
});
