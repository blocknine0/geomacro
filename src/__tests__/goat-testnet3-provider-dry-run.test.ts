import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("GOAT Testnet3 provider dry-run safety", () => {
  const source = readFileSync("scripts/goat/testnet3-provider-dry-run.mjs", "utf8");

  it("pins the official Testnet3 merchant origin and network", () => {
    expect(source).toContain('const API_ORIGIN = "https://flow-api.testnet3.goat.network"');
    expect(source).toContain("const CHAIN_ID = 48816");
    expect(source).toContain('const CAIP2 = "eip155:48816"');
  });

  it("cannot sign or submit a wallet transaction", () => {
    expect(source).not.toContain("Wallet");
    expect(source).not.toContain("privateKey");
    expect(source).not.toContain("PRIVATE_KEY");
    expect(source).not.toContain(".transfer(");
    expect(source).not.toContain("sendTransaction");
    expect(source).toContain("random payer address is intentionally generated without a private key");
  });

  it("uses merchant credentials only from server environment variables", () => {
    expect(source).toContain('requiredEnv("GOATX402_API_KEY"');
    expect(source).toContain('requiredEnv("GOATX402_API_SECRET"');
    expect(source).toContain('requiredEnv("GOATX402_MERCHANT_ID"');
    expect(source).not.toMatch(/GOATX402_API_KEY\s*=\s*["'][^"']+["']/);
    expect(source).not.toMatch(/GOATX402_API_SECRET\s*=\s*["'][^"']+["']/);
  });

  it("writes normalized evidence only and explicitly records no payment/no revenue", () => {
    expect(source).toContain("provider_raw_payload_persisted: false");
    expect(source).toContain("transaction_submitted: false");
    expect(source).toContain("commercial_revenue: false");
    expect(source).not.toContain("provider_raw:");
    expect(source).not.toContain("raw_response");
  });

  it("requires HTTP 402 creation plus authenticated order read in unpaid state", () => {
    expect(source).toContain('[402]');
    expect(source).toContain('`/api/v1/orders/${encodeURIComponent(challenge.order_id)}`');
    expect(source).toContain('=== "CHECKOUT_VERIFIED"');
    expect(source).toContain("No-payment dry run unexpectedly has a transaction hash");
  });
});
