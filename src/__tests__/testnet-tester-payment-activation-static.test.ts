import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/905_testnet_usdc_payment_activation.sql", "utf8");
const service = readFileSync("src/lib/testnet-tester-payment.server.ts", "utf8");
const verifier = readFileSync("src/lib/testnet-usdc-payment-verification.server.ts", "utf8");

describe("testnet tester payment activation", () => {
  it("requires completed registration before paid tester activation", () => {
    expect(migration).toContain("registration_status <> 'complete'");
    expect(migration).toContain("email_verified_at is null");
    expect(migration).toContain("wallet_verified_at is null");
    expect(migration).toContain("x_connected_at is null");
    expect(migration).toContain("discord_connected_at is null");
  });

  it("binds payment to the verified registration wallet and blocks replay theft", () => {
    expect(migration).toContain("v_profile.wallet_address_hash <> p_payer_address_hash");
    expect(migration).toContain("TESTNET_PAYER_WALLET_MISMATCH");
    expect(migration).toContain("TESTNET_PAYMENT_ALREADY_CLAIMED");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("commercial_testnet_entitlement_source_unique");
  });

  it("creates only the bounded 250-credit 30-day non-revenue tester entitlement", () => {
    expect(migration).toContain("'testnet_tester'");
    expect(migration).toContain("'testnet_tester_pass_30d'");
    expect(migration).toContain("interval '30 days'");
    expect(migration).toContain("'testnet_non_revenue'");
    expect(migration).toContain("commercial_revenue,");
    expect(migration).toContain("false,");
    expect(migration).toContain("'credits_granted', 250");
  });

  it("verifies supported-chain identity, USDC contract, recipient and amount before activation", () => {
    expect(verifier).toContain('"eth_chainId"');
    expect(verifier).toContain('"eth_getTransactionReceipt"');
    expect(verifier).toContain('id("Transfer(address,address,uint256)")');
    expect(verifier).toContain("RPC_IDENTITY_MISMATCH");
    expect(verifier).toContain("WRONG_RECIPIENT");
    expect(verifier).toContain("UNDERPAYMENT");
    expect(service).toContain("verifyTestnetUsdcPayment");
    expect(service).toContain("activate_verified_testnet_usdc_pass");
  });

  it("never accepts production/mainnet revenue semantics", () => {
    expect(service).toContain("commercial_revenue: false");
    expect(migration).toContain("'testnet',");
    expect(migration).toContain("'testnet_non_revenue'");
    expect(migration).toContain("'execution_authorized', false");
    expect(migration).toContain("'upstream_news_source_identity_exposed', false");
  });
});
