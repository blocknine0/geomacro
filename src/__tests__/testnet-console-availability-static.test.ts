import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const configRoute = readFileSync("server/api/testnet-tester/config.get.ts", "utf8");
const pricingScript = readFileSync("public/testnet-console-pricing.js", "utf8");
const walletFirst = readFileSync("public/testnet-wallet-first-v2.js", "utf8");

describe("Testnet console availability regression guards", () => {
  it("does not hide the entire public console when the payment receiver is temporarily unavailable", () => {
    expect(configRoute).toContain("function optionalTestnetUsdcReceiver");
    expect(configRoute).toContain("return requireTestnetUsdcReceiver()");
    expect(configRoute).toContain("return null");
    expect(configRoute).toContain("payment_configured: receiverAddress !== null");
    expect(configRoute).toContain("receiver_address: receiverAddress");
    expect(configRoute).not.toContain("TESTNET_PAYMENT_CONFIG_UNAVAILABLE");
  });

  it("keeps the public console on the public-key endpoint rather than requiring a developer Key + Secret", () => {
    expect(pricingScript).not.toContain("window.fetch =");
    expect(pricingScript).not.toContain("testerCredentialPair");
    expect(pricingScript).not.toContain("/api/testnet/intelligence");
  });

  it("makes native select menus readable on the dark access and console pages", () => {
    for (const source of [pricingScript, walletFirst]) {
      expect(source).toContain("select{color-scheme:dark}");
      expect(source).toContain("select option{background:#0d1420;color:#f4f2ea}");
      expect(source).toContain("select option:checked{background:#1d4f8f;color:#fff}");
    }
  });
});
