import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const pricing = read("src/lib/testnet-api-pricing.ts");
const accessContract = read("src/lib/testnet-usdc-access-contract.ts");
const paymentVerifier = read("src/lib/testnet-usdc-payment-verification.server.ts");
const paymentService = read("src/lib/testnet-tester-payment.server.ts");
const configRoute = read("server/api/testnet-tester/config.get.ts");
const paymentRoute = read("server/api/testnet-tester/payment-claim.post.ts");
const developer = read("src/lib/testnet-developer-access.server.ts");
const commercialAccess = read("src/lib/commercial-access.server.ts");
const structuralRoute = read("server/api/commercial/structural.post.ts");
const browser = read("public/testnet-access.js");
const migration = read("supabase/migrations/912_testnet_api_pay_per_call.sql");

describe("Testnet API pay-per-call alignment gate", () => {
  it("locks Testnet pricing to 0.5 per credit with no upfront purchase", () => {
    expect(pricing).toContain("TESTNET_API_CREDIT_PRICE_USDC = 0.5");
    expect(pricing).toContain("TESTNET_API_CREDIT_PRICE_ATOMIC = 500_000n");
    expect(pricing).toContain("TESTNET_API_FIXED_CREDITS = 500");
    expect(pricing).toContain('payment_model: "pay_per_call"');
    expect(pricing).toContain("upfront_payment_required: false");
    expect(pricing).toContain('environment: "testnet"');
    expect(pricing).toContain("applies_to_mainnet: false");
    expect(accessContract).toContain('payment_model: "pay_per_call"');
    expect(accessContract).toContain("upfront_payment_required: false");
    expect(paymentVerifier).toContain("minimum_amount_atomic?: bigint");
    expect(configRoute).toContain('payment_model: "pay_per_call"');
    expect(configRoute).toContain("upfront_payment_required: false");
    expect(paymentService).toContain("TESTNET_UPFRONT_ACTIVATION_RETIRED");
    expect(paymentRoute).toContain("TESTNET_UPFRONT_ACTIVATION_RETIRED");
  });

  it("provisions wallet-verified metered access and relaxes the claim floor to one credit", () => {
    expect(migration).toContain("amount_atomic >= 500000");
    expect(migration).toContain("amount_usdc >= 0.5");
    expect(migration).toContain("provision_testnet_metered_access");
    expect(migration).toContain("testnet_tester_metered_30d");
    expect(migration).toContain("max_credits_per_30_days");
    expect(migration).toContain("pay_per_call");
    expect(migration).toContain("upfront_payment_required");
    expect(migration).toContain("request_id text");
    expect(migration).toContain("credit_cost integer");
  });

  it("creates a one-time API Key + API Secret pair and stores only the secret hash", () => {
    expect(developer).toContain("const apiKey = `gmk_test_");
    expect(developer).toContain("const apiSecret = `gms_test_");
    expect(developer).toContain("api_key_hash: sha256(apiSecret)");
    expect(developer).toContain("api_secret: apiSecret");
    expect(developer).toContain("shown_once: true");
    expect(developer).toContain("provision_testnet_metered_access");
    expect(commercialAccess).toContain("TESTNET_API_KEY_SECRET_REQUIRED");
    expect(commercialAccess).toContain("TESTNET_API_CREDENTIAL_DENIED");
  });

  it("requires a 402 per-call proof on the external structural endpoint", () => {
    expect(structuralRoute).toContain("TESTNET_PAYMENT_REQUIRED");
    expect(structuralRoute).toContain("testnetApiCallPriceAtomic");
    expect(structuralRoute).toContain("minimum_amount_atomic: requiredAtomic");
    expect(structuralRoute).toContain("TESTNET_PAYMENT_ALREADY_CLAIMED");
    expect(structuralRoute).toContain('"X-Geomacro-Api-Key"'.toLowerCase().replaceAll('"', ''));
    expect(structuralRoute.toLowerCase()).toContain("x-geomacro-api-secret");
  });

  it("renders pay-per-call guidance and keeps the credential pair visible once", () => {
    expect(browser).toContain("There is no upfront Testnet USDC activation payment");
    expect(browser).toContain("402 quote");
    expect(browser).toContain("payload.data.api_secret");
    expect(browser).toContain("Copy both values now");
    expect(browser).not.toContain("claimPayment(event)");
  });
});
