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
const browser = read("public/testnet-access.js");
const consoleBrowser = read("public/testnet-console.js");
const page = read("server/routes/testnet-access.get.ts");
const ops = read("src/lib/commercial-ops.server.ts");
const walletMigration = read("supabase/migrations/910_testnet_wallet_only_access.sql");
const pricingMigration = read("supabase/migrations/911_testnet_api_pricing_alignment.sql");

describe("Testnet tester end-to-end contract trial", () => {
  it("uses wallet verification as the only identity gate", () => {
    expect(account).toContain("TESTNET_WALLET_ALREADY_REGISTERED");
    expect(account).toContain('registration_status: "complete"');
    expect(walletMigration).toContain("wallet_verified_at is not null");
    expect(walletMigration).not.toContain("email_verified_at is not null");
    expect(walletMigration).not.toContain("x_connected_at is not null");
    expect(walletMigration).not.toContain("discord_connected_at is not null");
    expect(page).toContain("No email, X-account or Discord connection is required");
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

  it("requires 0.5 Testnet USDC per credit for one fixed 500-credit quota", () => {
    expect(pricing).toContain("TESTNET_API_CREDIT_PRICE_USDC = 0.5");
    expect(pricing).toContain("TESTNET_API_FIXED_CREDITS = 500");
    expect(pricing).toContain("TESTNET_API_FIXED_QUOTA_USDC = 250");
    expect(pricing).toContain("TESTNET_API_FIXED_QUOTA_ATOMIC = 250_000_000n");
    expect(paymentContract).toContain("TESTNET_API_FIXED_QUOTA_ATOMIC");
    expect(paymentVerifier).toContain("TESTNET_USDC_ACCESS_PRICE_ATOMIC");
    expect(pricingMigration).toContain("amount_atomic >= 250000000");
    expect(pricingMigration).toContain("amount_usdc >= 250");
    expect(pricingMigration).toContain("'credit_price_testnet_usdc', 0.5");
    expect(pricingMigration).toContain("'quota_price_usdc', 250");
    expect(paymentService).toContain("TESTNET_API_FIXED_QUOTA_ATOMIC");
    expect(paymentRoute).toContain("TESTNET_API_FIXED_CREDITS");
    expect(paymentRoute).toContain("TESTNET_API_CREDIT_PRICE_USDC");
    expect(paymentRoute).toContain("TESTNET_API_FIXED_QUOTA_USDC");
  });

  it("keeps payment replay bounded and Testnet non-revenue", () => {
    expect(walletMigration).toContain("'idempotent_replay',true");
    expect(walletMigration).toContain("'credits_granted',0");
    expect(pricingMigration).toContain("testnet_non_revenue");
    expect(paymentService).toContain("commercial_revenue: false");
    expect(paymentRoute).toContain('payment_environment: "testnet"');
    expect(paymentRoute).toContain("commercial_revenue: false");
  });

  it("issues an API Key + one-time API Secret only after active tester entitlement", () => {
    expect(developer).toContain('profile.access_status !== "active"');
    expect(developer).toContain('grant.tier !== "testnet_tester"');
    expect(developer).toContain("TESTNET_TESTER_ENTITLEMENT_NOT_ACTIVE");
    expect(developer).toContain("const apiKey = `gmk_test_");
    expect(developer).toContain("const apiSecret = `gms_test_");
    expect(developer).toContain("api_key_hash: sha256(apiSecret)");
    expect(developer).toContain("api_secret: apiSecret");
    expect(commercialAccess).toContain("TESTNET_API_KEY_SECRET_REQUIRED");
    expect(commercialAccess).toContain("GeomacroTest");
    expect(page).toContain("API Key + API Secret");
    expect(browser).toContain("payload.data.api_secret");
  });

  it("keeps the professional social-card to X flow after testing", () => {
    expect(page).toContain("TEST → CARD → X");
    expect(consoleBrowser).toContain("Create share card");
    expect(consoleBrowser).toContain("Share result on X");
    expect(consoleBrowser).toContain("twitter.com/intent/tweet");
    expect(consoleBrowser).toContain("/api/testnet-tester/share");
  });

  it("keeps owner-side usage and collection evidence available", () => {
    expect(ops).toContain("recent_usage");
    expect(ops).toContain("recent_payments");
    expect(ops).toContain("principal_id");
    expect(ops).toContain("tx_hash");
    expect(ops).toContain("network_name");
    expect(ops).toContain("amount_decimal");
    expect(ops).toContain("credits_remaining");
  });
});
