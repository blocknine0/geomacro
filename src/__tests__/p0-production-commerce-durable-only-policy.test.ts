import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolveCommerceLedgerDurabilityPolicy } from "../lib/commerce-control-plane.server";

describe("P0 production commerce cannot fall back to Supabase",()=>{
  it("resolves all valid production configurations to Durable Objects exclusively",()=>{
    for (const configured of [undefined,"","durable_object"," DURABLE_OBJECT "]) {
      expect(resolveCommerceLedgerDurabilityPolicy(configured,"production")).toBe(true);
    }
    for(const bad of ["supabase"," SUPABASE ","direct_postgres","legacy"]){
      expect(()=>resolveCommerceLedgerDurabilityPolicy(bad,"production")).toThrow();
    }
    expect(()=>resolveCommerceLedgerDurabilityPolicy("supabase","production"))
      .toThrow("AGENT_PRODUCTION_SUPABASE_COMMERCE_FORBIDDEN");
  });
  it("preserves explicit nonproduction legacy-fixture operation only",()=>{
    expect(resolveCommerceLedgerDurabilityPolicy("supabase","test")).toBe(false);
    expect(resolveCommerceLedgerDurabilityPolicy(undefined,"test")).toBe(false);
    expect(resolveCommerceLedgerDurabilityPolicy("durable_object","test")).toBe(true);
    expect(resolveCommerceLedgerDurabilityPolicy("durable_object","development")).toBe(true);
  });
  it("leaves usage reservations, audit and settlement bound to the durable policy",()=>{
    const read=(path:string)=>readFileSync(path,"utf8");
    const main=read("src/lib/commerce-control-plane.server.ts");
    const usage=read("src/lib/coinbase-x402-usage-guard.server.ts");
    const audit=read("src/lib/coinbase-x402-product-audit.server.ts");
    const coinbase=read("src/lib/coinbase-x402.server.ts");
    const query=read("src/lib/mainnet-intelligence-endpoint.server.ts");
    expect(main).toContain("AGENT_PRODUCTION_SUPABASE_COMMERCE_FORBIDDEN");
    expect(main).toContain("return resolveCommerceLedgerDurabilityPolicy(");
    expect(usage).toContain("if (durableCommerceControlPlaneEnabled())");
    expect(usage).toContain('"/v1/usage/reserve"');
    expect(usage).toContain('"/v1/usage/finalize"');
    expect(usage).toContain('"/v1/usage/release"');
    expect(audit).toContain("if (durableCommerceControlPlaneEnabled())");
    expect(audit).toContain('"/v1/audit/upsert"');
    expect(coinbase).toContain("if (durableCommerceControlPlaneEnabled()) return;");
    expect(query).toContain("claimCoinbaseX402Delivery");
    expect(query).toContain("reserveCoinbaseX402AgentUsage");
    expect(query).toContain("upsertCoinbaseX402ProductAudit");
    // No automatic fallback after a DO timeout/5xx or misconfiguration.
    expect(main).not.toContain("catch { return false");
    expect(main).not.toContain("if (configured === \"supabase\") return false;");
  });
});
