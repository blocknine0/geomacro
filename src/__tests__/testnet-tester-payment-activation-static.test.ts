import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const meteredMigration = readFileSync("supabase/migrations/912_testnet_api_pay_per_call.sql", "utf8");
const service = readFileSync("src/lib/testnet-tester-payment.server.ts", "utf8");
const route = readFileSync("server/api/testnet-tester/payment-claim.post.ts", "utf8");
const verifier = readFileSync("src/lib/testnet-usdc-payment-verification.server.ts", "utf8");
const structural = readFileSync("server/api/commercial/structural.post.ts", "utf8");

describe("testnet developer API metered payment model", () => {
  it("activates access after wallet verification without an upfront payment event", () => {
    expect(meteredMigration).toContain("provision_testnet_metered_access");
    expect(meteredMigration).toContain("registration_status <> 'complete'");
    expect(meteredMigration).toContain("wallet_verified_at is null");
    expect(meteredMigration).not.toContain("current_payment_event_id is not null");
    expect(meteredMigration).toContain("access_status='active'");
  });

  it("creates a bounded 500-credit 30-day metered entitlement", () => {
    expect(meteredMigration).toContain("'testnet_tester_metered_30d'");
    expect(meteredMigration).toContain("interval '30 days'");
    expect(meteredMigration).toContain("'max_credits_per_30_days',500");
    expect(meteredMigration).toContain("'credit_price_testnet_usdc',0.5");
    expect(meteredMigration).toContain("'payment_model','pay_per_call'");
    expect(meteredMigration).toContain("'upfront_payment_required',false");
    expect(meteredMigration).toContain("'commercial_revenue',false");
  });

  it("sets the minimum stored payment proof to one credit and supports per-call request binding", () => {
    expect(meteredMigration).toContain("amount_atomic >= 500000");
    expect(meteredMigration).toContain("amount_usdc >= 0.5");
    expect(meteredMigration).toContain("request_id text");
    expect(meteredMigration).toContain("capability text");
    expect(meteredMigration).toContain("credit_cost integer");
    expect(meteredMigration).toContain("required_amount_atomic");
    expect(meteredMigration).toContain("testnet_usdc_payment_claim_principal_request_unique");
  });

  it("verifies chain identity, USDC contract, recipient and dynamic amount for each call", () => {
    expect(verifier).toContain('"eth_chainId"');
    expect(verifier).toContain('"eth_getTransactionReceipt"');
    expect(verifier).toContain('id("Transfer(address,address,uint256)")');
    expect(verifier).toContain("minimum_amount_atomic?: bigint");
    expect(verifier).toContain("RPC_IDENTITY_MISMATCH");
    expect(verifier).toContain("WRONG_RECIPIENT");
    expect(verifier).toContain("UNDERPAYMENT");
    expect(structural).toContain("minimum_amount_atomic: requiredAtomic");
  });

  it("retires the old upfront activation path", () => {
    expect(service).toContain("TESTNET_UPFRONT_ACTIVATION_RETIRED");
    expect(route).toContain("TESTNET_UPFRONT_ACTIVATION_RETIRED");
    expect(route).toContain("statusCode: 410");
    expect(route).toContain('payment_model: "pay_per_call"');
    expect(route).toContain("upfront_payment_required: false");
  });

  it("keeps all Testnet settlement non-revenue and execution unauthorized", () => {
    expect(structural).toContain("commercial_revenue: false");
    expect(structural).toContain("execution_authorized: false");
    expect(verifier).toContain('revenue_classification: "testnet_non_revenue"');
  });
});
