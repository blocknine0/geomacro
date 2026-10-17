import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

/**
 * The Hybrid Agent reuses the existing machine/x402 product.
 * No browser chat turn can accidentally acquire a paid JSON delivery path.
 */
describe("hybrid human/machine delivery boundaries", () => {
  it("keeps both machine agent aliases on the same governed x402 handler", () => {
    for (const path of [
      "src/routes/api.v1.intelligence.query.ts",
      "src/routes/api.x402.intelligence.ts",
    ]) {
      expect(read(path)).toContain("mainnetIntelligenceHandlers");
    }
    const machine = read("src/lib/mainnet-intelligence-endpoint.server.ts");
    expect(machine).toContain("checkAgentQueryDeliverability");
    expect(machine).toContain("assertPublicPaidOutputBoundary");
    expect(machine).toContain("coinbaseX402PaymentRequirements");
    expect(machine).toContain("settleCoinbaseX402");
    expect(machine).toContain("prepareCoinbaseX402Delivery");
    expect(machine).toContain("query_plan_hash");
  });

  it("never exposes machine payment or signing control through free Ask", () => {
    const adapter = read("src/lib/hybrid-agent-chat.server.ts");
    const transport = read("server/api/public-ask.get.ts");
    expect(adapter).toContain("executeAskGeomacro");
    expect(adapter).not.toContain("settleCoinbaseX402(");
    expect(adapter).not.toContain("signRiskObject(");
    expect(transport).not.toContain("payment_signature");
    expect(transport).not.toContain("raw_payload");
    expect(transport).toContain('Cache-Control", "no-store"');
  });
});
