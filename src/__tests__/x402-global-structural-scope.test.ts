import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync("src/lib/agentic-demo-service.server.ts", "utf8");
const contract = readFileSync("docs/X402_GLOBAL_STRUCTURAL_PRODUCT.md", "utf8");

describe("Coinbase x402 global structural product boundary", () => {
  it("keeps the free sandbox narrow while removing the USA/CHN hard gate from paid Coinbase x402", () => {
    expect(service).toContain('if (mode === "X402_PAID") return;');
    expect(service).toContain("DEMO_ALLOWED_COUNTRIES");
    expect(service).toContain("DEMO_ALLOWED_CORRIDORS");
  });

  it("documents data-driven coverage without claiming universal coverage", () => {
    expect(contract).toContain("maximum defensible country universe");
    expect(contract).toContain("never means Geomacro claims complete data");
    expect(contract).toContain("Missing data is represented as missing/unavailable");
    expect(contract).toContain("0.02 USDC");
    expect(contract).toContain("bulk export of the historical warehouse");
  });
});
