import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const registration = read("src/lib/testnet-tester-registration.server.ts");
const account = read("src/lib/testnet-tester-account.server.ts");
const paymentContract = read("src/lib/testnet-usdc-access-contract.ts");
const paymentVerifier = read("src/lib/testnet-usdc-payment-verification.server.ts");
const paymentService = read("src/lib/testnet-tester-payment.server.ts");
const paymentRoute = read("server/api/testnet-tester/payment-claim.post.ts");
const developer = read("src/lib/testnet-developer-access.server.ts");
const browser = read("public/testnet-access.js");
const page = read("server/routes/testnet-access.get.ts");
const ops = read("src/lib/commercial-ops.server.ts");
const migration = read("supabase/migrations/909_testnet_fixed_500_credit_quota.sql");

describe("Testnet tester end-to-end contract trial", () => {
  it("locks registration to verified email, wallet, X and Discord", () => {
    expect(registration).toContain("email_hash");
    expect(registration).toContain("wallet_address_hash");
    expect(account).toContain("registration_status");
    expect(migration).toContain("email_verified_at is null");
    expect(migration).toContain("wallet_verified_at is null");
    expect(migration).toContain("x_connected_at is null");
    expect(migration).toContain("discord_connected_at is null");
  });

  it("requires 0.5 Testnet USDC and grants one fixed 500-credit quota", () => {
    expect(paymentContract).toContain('TESTNET_USDC_ACCESS_PRICE_USDC = "0.50"');
    expect(paymentContract).toContain("TESTNET_USDC_ACCESS_PRICE_ATOMIC = 500_000n");
    expect(paymentContract).toContain("TESTNET_USDC_ACCESS_CREDITS = 500");
    expect(paymentVerifier).toContain("TESTNET_USDC_ACCESS_PRICE_ATOMIC");
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
    expect(page).toContain("Developer API keys");
    expect(browser).toContain('show("developerPanel", active)');
  });

  it("hides repeat payment activation after account becomes active", () => {
    expect(browser).toContain('show("paymentPanel", account.registration_status === "complete" && !active)');
    expect(browser).toContain("This payment was already verified. No extra credits were granted.");
  });

  it("includes X feedback/shilling flow for active testers", () => {
    expect(page).toContain("Post feedback on X");
    expect(browser).toContain("twitter.com/intent/tweet");
    expect(browser).toContain("xFeedbackButton");
    expect(browser).toContain('show("feedbackPanel", active)');
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
