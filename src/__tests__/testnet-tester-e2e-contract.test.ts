import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const account = read("src/lib/testnet-tester-account.server.ts");
const pricing = read("src/lib/testnet-api-pricing.ts");
const paymentContract = read("src/lib/testnet-usdc-access-contract.ts");
const paymentVerifier = read("src/lib/testnet-usdc-payment-verification.server.ts");
const paymentService = read("src/lib/testnet-tester-payment.server.ts");
const paymentRoute = read("server/api/testnet-tester/payment-claim.post.ts");
const developer = read("src/lib/testnet-developer-access.server.ts");
const commercialAccess = read("src/lib/commercial-access.server.ts");
const structuralRoute = read("server/api/commercial/structural.post.ts");
const browser = read("public/testnet-access.js");
const consoleBrowser = read("public/testnet-console.js");
const page = read("server/routes/testnet-access.get.ts");
const ops = read("src/lib/commercial-ops.server.ts");
const walletMigration = read("supabase/migrations/910_testnet_wallet_only_access.sql");
const meteredMigration = read("supabase/migrations/912_testnet_api_pay_per_call.sql");

describe("Testnet tester end-to-end contract trial", () => {
  it("uses wallet verification as the only identity gate and provisions access without upfront payment", () => {
    expect(account).toContain("TESTNET_WALLET_ALREADY_REGISTERED");
    expect(account).toContain('registration_status: "complete"');
    expect(account).toContain("provision_testnet_metered_access");
    expect(account).toContain('payment_model: "pay_per_call"');
    expect(account).not.toContain("verifyTestnetTesterEmail");
    expect(account).not.toContain("issueTesterOauthState");
    expect(account).not.toContain("consumeTesterOauthIdentity");
    expect(meteredMigration).toContain("wallet_verified_at is not null");
    expect(meteredMigration).not.toContain("current_payment_event_id is not null");
    expect(page).toContain("Profile + wallet");
    expect(page).toContain("Create a tester profile and verify one EVM wallet");
  });

  it("supports only Arc Testnet, Base Sepolia and Polygon Amoy", () => {
    expect(paymentContract).toContain('"arcTestnet"');
    expect(paymentContract).toContain('"baseSepolia"');
    expect(paymentContract).toContain('"polygonAmoy"');
    expect(paymentContract).not.toContain('"ethSepolia"');
    expect(page).toContain("Arc Testnet");
    expect(page).toContain("Base Sepolia");
    expect(page).toContain("Polygon Amoy");
  });

  it("uses 500 credits as a cap and charges 0.5 Testnet USDC per consumed credit", () => {
    expect(pricing).toContain("TESTNET_API_CREDIT_PRICE_USDC = 0.5");
    expect(pricing).toContain("TESTNET_API_CREDIT_PRICE_ATOMIC = 500_000n");
    expect(pricing).toContain("TESTNET_API_FIXED_CREDITS = 500");
    expect(pricing).toContain('payment_model: "pay_per_call"');
    expect(pricing).toContain("upfront_payment_required: false");
    expect(paymentContract).toContain("credits_per_30_days: TESTNET_API_FIXED_CREDITS");
    expect(paymentVerifier).toContain("minimum_amount_atomic?: bigint");
    expect(meteredMigration).toContain("amount_atomic >= 500000");
    expect(meteredMigration).toContain("max_credits_per_30_days");
    expect(paymentService).toContain("TESTNET_UPFRONT_ACTIVATION_RETIRED");
    expect(paymentRoute).toContain("TESTNET_UPFRONT_ACTIVATION_RETIRED");
  });

  it("returns a per-call 402 quote and binds one payment proof to one request id", () => {
    expect(structuralRoute).toContain("TESTNET_PAYMENT_REQUIRED");
    expect(structuralRoute).toContain("testnetApiCallPriceAtomic");
    expect(structuralRoute).toContain("testnetApiCallPriceUsdc");
    expect(structuralRoute).toContain("minimum_amount_atomic: requiredAtomic");
    expect(structuralRoute).toContain("TESTNET_PAYMENT_ALREADY_CLAIMED");
    expect(structuralRoute).toContain("TESTNET_PAYMENT_IDEMPOTENCY_CONFLICT");
    expect(meteredMigration).toContain("testnet_usdc_payment_claim_principal_request_unique");
    expect(meteredMigration).toContain("request_id text");
    expect(meteredMigration).toContain("capability text");
    expect(meteredMigration).toContain("credit_cost integer");
  });

  it("issues an API Key + one-time API Secret after wallet verification", () => {
    expect(developer).toContain("TESTNET_WALLET_VERIFICATION_REQUIRED");
    expect(developer).toContain("provision_testnet_metered_access");
    expect(developer).toContain('grant.metadata?.payment_model !== "pay_per_call"');
    expect(developer).toContain("const apiKey = `gmk_test_");
    expect(developer).toContain("const apiSecret = `gms_test_");
    expect(developer).toContain("api_key_hash: sha256(apiSecret)");
    expect(developer).toContain("api_secret: apiSecret");
    expect(commercialAccess).toContain("TESTNET_API_KEY_SECRET_REQUIRED");
    expect(browser).toContain("payload.data.api_secret");
  });

  it("keeps Testnet settlement non-revenue and execution unauthorized", () => {
    expect(pricing).toContain("payment_is_real_revenue: false");
    expect(structuralRoute).toContain("commercial_revenue: false");
    expect(structuralRoute).toContain("execution_authorized: false");
    expect(paymentVerifier).toContain('revenue_classification: "testnet_non_revenue"');
  });

  it("keeps X as a result-share CTA rather than an identity connection", () => {
    expect(page).toContain("TEST → X → FEEDBACK");
    expect(page).toContain("open one X post");
    expect(consoleBrowser).toContain("Create share card");
    expect(consoleBrowser).toContain("Share result on X");
    expect(consoleBrowser).toContain("twitter.com/intent/tweet");
    expect(consoleBrowser).toContain("/api/testnet-tester/share");
    expect(consoleBrowser).not.toContain("oauth/x");
    expect(browser).not.toContain("oauth/x");
    expect(browser).not.toContain("oauth/discord");
  });

  it("keeps owner-side usage evidence available", () => {
    expect(ops).toContain("recent_usage");
    expect(ops).toContain("recent_payments");
    expect(ops).toContain("principal_id");
    expect(ops).toContain("tx_hash");
    expect(ops).toContain("network_name");
    expect(ops).toContain("credits_remaining");
    expect(walletMigration).toContain("testnet_usdc_payment_claims");
  });
});
