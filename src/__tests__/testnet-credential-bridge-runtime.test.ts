import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pricingScript = readFileSync("public/testnet-console-pricing.js", "utf8");
const consoleScript = readFileSync("public/testnet-console.js", "utf8");

describe("Testnet public console browser boundary", () => {
  it("does not hijack the public console into the private developer API", () => {
    expect(pricingScript).not.toContain("window.fetch =");
    expect(pricingScript).not.toContain("/api/testnet/intelligence");
    expect(pricingScript).not.toContain("testerCredentialPair");
    expect(pricingScript).not.toContain("Verify credential & continue");
    expect(pricingScript).not.toContain("TESTNET_API_KEY_SECRET_REQUIRED");

    expect(consoleScript).toContain('/api/testnet-tester/intelligence');
    expect(consoleScript).toContain('"x-geomacro-public-key"');
    expect(consoleScript).toContain("Get price quote");
    expect(consoleScript).toContain("TESTNET_PAYMENT_REQUIRED");
  });

  it("keeps canonical pricing synchronized without requiring developer credentials", () => {
    expect(pricingScript).toContain('/api/testnet-tester/config');
    expect(pricingScript).toContain("capability_prices");
    expect(pricingScript).toContain("price.credits");
    expect(pricingScript).toContain("price.testnet_usdc");
    expect(pricingScript).toContain("The payment quote remains the canonical authority");
  });

  it("forces readable native select option contrast on the dark Testnet UI", () => {
    expect(pricingScript).toContain("geomacroNativeSelectContrast");
    expect(pricingScript).toContain("select option{background:#0d1420;color:#f4f2ea}");
  });
});
