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
const page = read("server/routes/testnet-access.get.ts");
const browser = read("public/testnet-access.js");
const migration = read("supabase/migrations/911_testnet_api_pricing_alignment.sql");

describe("Testnet API v1.2 alignment gate", () => {
  it("locks pricing to Testnet only: 0.5 per credit, 500 credits, 250 total", () => {
    expect(pricing).toContain("TESTNET_API_CREDIT_PRICE_USDC = 0.5");
    expect(pricing).toContain("TESTNET_API_FIXED_CREDITS = 500");
    expect(pricing).toContain("TESTNET_API_FIXED_QUOTA_USDC = 250");
    expect(pricing).toContain("TESTNET_API_FIXED_QUOTA_ATOMIC = 250_000_000n");
    expect(pricing).toContain('environment: "testnet"');
    expect(pricing).toContain("applies_to_mainnet: false");
    expect(accessContract).toContain("TESTNET_API_FIXED_QUOTA_ATOMIC");
    expect(paymentVerifier).toContain("TESTNET_USDC_ACCESS_PRICE_ATOMIC");
    expect(paymentService).toContain("TESTNET_API_FIXED_QUOTA_ATOMIC");
    expect(configRoute).toContain("TESTNET_API_CREDIT_PRICE_USDC");
    expect(paymentRoute).toContain("TESTNET_API_FIXED_QUOTA_USDC");
  });

  it("enforces the current pricing contract in the database without rewriting historical rows", () => {
    expect(migration).toContain("amount_atomic >= 250000000");
    expect(migration).toContain("amount_usdc >= 250");
    expect(migration).toContain("not valid");
    expect(migration).toContain("align_testnet_tester_grant_metadata");
    expect(migration).toContain("align_testnet_tester_payment_metadata");
    expect(migration).toContain("testnet-api-pricing-v1.0.0");
    expect(migration).toContain("testnet_non_revenue");
  });

  it("creates a one-time API Key + API Secret pair and stores only the secret hash", () => {
    expect(developer).toContain("const apiKey = `gmk_test_");
    expect(developer).toContain("const apiSecret = `gms_test_");
    expect(developer).toContain("api_key_hash: sha256(apiSecret)");
    expect(developer).toContain("api_secret: apiSecret");
    expect(developer).toContain("shown_once: true");
    expect(commercialAccess).toContain("TESTNET_API_KEY_SECRET_REQUIRED");
    expect(commercialAccess).toContain("TESTNET_API_CREDENTIAL_DENIED");
    expect(commercialAccess).toContain("GeomacroTest");
  });

  it("keeps the external structural endpoint compatible with the paired Authorization scheme", () => {
    expect(structuralRoute).toContain('getRequestHeader(event, "authorization")');
    expect(structuralRoute).toContain("authenticateCommercialApiRequest");
    expect(structuralRoute).toContain('"Access-Control-Allow-Headers": "Authorization, Content-Type"');
  });

  it("renders the same pricing and credential-pair contract in the Testnet UI", () => {
    expect(page).toContain("0.5 Testnet USDC per credit");
    expect(page).toContain("250 Testnet USDC");
    expect(page).toContain("API Key + API Secret");
    expect(browser).toContain("renderCanonicalPricing");
    expect(browser).toContain("payload.data.api_secret");
    expect(browser).toContain("Copy both values now");
  });
});
