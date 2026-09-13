import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("server/api/testnet/dashboard.get.ts", "utf8");

describe("public Testnet dashboard feed", () => {
  it("is a public read-only aggregate feed with explicit privacy boundaries", () => {
    expect(source).toContain('"Access-Control-Allow-Origin": "*"');
    expect(source).toContain('"Cache-Control": "public, max-age=60, stale-while-revalidate=120"');
    expect(source).toContain("customer_identity_exposed: false");
    expect(source).toContain("wallet_address_exposed: false");
    expect(source).toContain("transaction_hash_exposed: false");
    expect(source).toContain("request_id_exposed: false");
    expect(source).toContain("subject_or_query_exposed: false");
    expect(source).toContain("raw_credentials_exposed: false");
    expect(source).toContain("upstream_news_source_identity_exposed: false");
    expect(source).toContain("testnet_counts_as_commercial_revenue: false");
  });

  it("reports the current wallet-first pay-per-call Testnet contract", () => {
    expect(source).toContain('identity_model: "wallet_first_eip4361"');
    expect(source).toContain('payment_model: "pay_per_call"');
    expect(source).toContain('payment_asset: "USDC"');
    expect(source).toContain("TESTNET_USDC_ACCESS_CHAINS");
    expect(source).toContain("STRUCTURED_TIER_REGISTRY.testnet_tester.included_capabilities");
    expect(source).toContain("GEOMACRO_CREDIT_COSTS");
    expect(source).toContain("execution_authorized: false");
  });

  it("does not return raw identity, request, subject, or transaction fields in recent public activity", () => {
    const recentActivity = source.slice(source.indexOf("recent_activity:"), source.indexOf("recent_payments:"));
    expect(recentActivity).not.toContain("principal_id:");
    expect(recentActivity).not.toContain("request_id:");
    expect(recentActivity).not.toContain("subject_key:");
    expect(recentActivity).not.toContain("response_sha256:");

    const recentPayments = source.slice(source.indexOf("recent_payments:"), source.indexOf("boundaries:"));
    expect(recentPayments).not.toContain("tx_hash:");
    expect(recentPayments).not.toContain("principal_id:");
    expect(recentPayments).not.toContain("payer_reference_hash:");
  });
});
