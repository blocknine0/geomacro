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

  it("keeps signed Risk Objects canonical and verified on the Testnet machine path", () => {
    const machine = read("src/lib/testnet-intelligence-capability.server.ts");

    expect(machine).toContain("getLatestCompatibleCountryRiskObject");
    expect(machine).toContain("getLatestCompatibleCorridorRiskObject");
    expect(machine).toContain("verifyPublicRiskObjectArtifact");
    expect(machine).toContain("return object;");
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

  it("treats Circle x402 as a payment rail over the same Risk Gate service", () => {
    const x402 = read("src/routes/api.agent.risk.ts");
    const agentic = read("src/lib/agentic-demo-service.server.ts");

    expect(x402).toContain("runAgenticPreflightDemo");
    expect(x402).toContain("settleCircleX402");
    expect(agentic).toContain("evaluateCountryRiskGate");
    expect(agentic).toContain("evaluateCorridorRiskGate");
    expect(agentic).toContain("loadStructuralContext");
    expect(agentic).toContain("readPublicGlobalRisk");
    expect(x402).toContain("execution_authorized: false");
  });

  it("documents payment and delivery adapters as non-authoritative for risk truth", () => {
    const architecture = read("src/content/docs/02-product-architecture.md");
    const readme = read("README.md");
    const commercial = read("docs/COMMERCIAL_INTELLIGENCE.md");
    const testnet = read("docs/TESTNET_DEVELOPER_API.md");

    for (const content of [architecture, readme, commercial, testnet]) {
      expect(content).toContain("one governed intelligence foundation");
      expect(content).toContain("pay-per-call");
      expect(content).toContain("not a separate risk engine");
    }
  });
});
