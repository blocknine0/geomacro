import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const account = read("src/lib/testnet-tester-account.server.ts");
const paymentContract = read("src/lib/testnet-usdc-access-contract.ts");
const paymentVerifier = read("src/lib/testnet-usdc-payment-verification.server.ts");
const paymentService = read("src/lib/testnet-tester-payment.server.ts");
const paymentRoute = read("server/api/testnet-tester/payment-claim.post.ts");
const developer = read("src/lib/testnet-developer-access.server.ts");
const browser = read("public/testnet-access.js");
const consoleBrowser = read("public/testnet-console.js");
const page = read("server/routes/testnet-access.get.ts");
const ops = read("src/lib/commercial-ops.server.ts");
const migration = read("supabase/migrations/910_testnet_wallet_only_access.sql");

describe("Testnet tester end-to-end contract trial", () => {
  it("uses wallet verification as the only identity gate", () => {
    expect(account).toContain("TESTNET_WALLET_ALREADY_REGISTERED");
    expect(account).toContain('registration_status: "complete"');
    expect(migration).toContain("wallet_verified_at is not null");
    expect(migration).not.toContain("email_verified_at is not null");
    expect(migration).not.toContain("x_connected_at is not null");
    expect(migration).not.toContain("discord_connected_at is not null");
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

  it("requires 0.5 Testnet USDC and grants one fixed 500-credit quota", () => {
    expect(paymentContract).toContain('TESTNET_USDC_ACCESS_PRICE_USDC = "0.50"');
    expect(paymentContract).toContain("TESTNET_USDC_ACCESS_PRICE_ATOMIC = 500_000n");
    expect(paymentContract).toContain("TESTNET_USDC_ACCESS_CREDITS = 500");
    expect(paymentVerifier).toContain("TESTNET_USDC_ACCESS_PRICE_ATOMIC");
    expect(migration).toContain("amount_atomic >= 500000");
    expect(migration).toContain("p_amount_atomic < 500000");
    expect(migration).toContain("TESTNET_FIXED_QUOTA_ALREADY_ACTIVATED");
    expect(migration).toContain("'credits_granted',500");
    expect(paymentService).toContain("credits_granted: Number(row.credits_granted ?? 0)");
    expect(paymentRoute).toContain("quota_credits: 500");
  });

  it("keeps payment replay idempotent and Testnet non-revenue", () => {
    expect(migration).toContain("'idempotent_replay',true");
    expect(migration).toContain("'credits_granted',0");
    expect(migration).toContain("'testnet_non_revenue'");
    expect(migration).toContain("'commercial_revenue',false");
    expect(paymentService).toContain("commercial_revenue: false");
  });

  it("unlocks developer keys only after active tester entitlement", () => {
    expect(developer).toContain('profile.access_status !== "active"');
    expect(developer).toContain('grant.tier !== "testnet_tester"');
    expect(developer).toContain("TESTNET_TESTER_ENTITLEMENT_NOT_ACTIVE");
    expect(page).toContain("Use Geomacro in your product or AI agent");
    expect(browser).toContain('show("developerPanel", active)');
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
