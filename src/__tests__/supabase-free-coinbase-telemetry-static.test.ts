import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const coinbase=readFileSync("src/lib/coinbase-x402.server.ts","utf8");
const query=readFileSync("src/lib/mainnet-intelligence-endpoint.server.ts","utf8");
const audit=readFileSync("src/lib/coinbase-x402-product-audit.server.ts","utf8");
const delivery=readFileSync("src/lib/agent-commerce-delivery.server.ts","utf8");

describe("Supabase-free Coinbase production settlement telemetry (no funds)",()=>{
  it("makes the durable ledger authoritative before retiring the optional legacy Supabase projection",()=>{
    const source=coinbase.slice(coinbase.indexOf("export async function persistCoinbaseSettlementTelemetry"));
    expect(source).toContain("if (durableCommerceControlPlaneEnabled()) return;");
    expect(source.indexOf("if (durableCommerceControlPlaneEnabled()) return;"))
      .toBeLessThan(source.indexOf("const db = requireRiskSupabase();"));
    expect(delivery).toContain('commerceLedgerBackend() === "durable_object"');
    expect(delivery).toContain('callDurableLedger');
    expect(delivery).toContain('settlementReference');
    expect(delivery).toContain('responseSha256');
  });
  it("preserves durable payment evidence and idempotent replay, independent of optional telemetry",()=>{
    for(const required of [
      "claimCoinbaseX402Delivery","prepareCoinbaseX402Delivery",
      "completeCoinbaseX402Delivery","finalizeCoinbaseX402AgentUsage",
      "settleCoinbaseX402","upsertCoinbaseX402ProductAudit",
      "paymentFingerprint","preparedResponseSha256",
    ])expect(query).toContain(required);
    expect(query.indexOf("await completeCoinbaseX402Delivery("))
      .toBeLessThan(query.indexOf("await persistCoinbaseSettlementTelemetry("));
    expect(audit).toContain('if (durableCommerceControlPlaneEnabled())');
    expect(audit).toContain('"/v1/audit/upsert"');
    expect(audit).toContain("payment_fingerprint_sha256");
    expect(audit).toContain("delivered_product_hash");
    expect(audit).toContain("settlement_tx");
    expect(audit).toContain("amount_atomic");
  });
});