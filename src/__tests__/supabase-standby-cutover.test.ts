import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  geomacroSupabaseRuntimeMode,
  supabasePrimaryTrafficAllowed,
  supabaseReadFallbackAllowed,
} from "../lib/supabase-runtime-mode.server";

const appSupabase = readFileSync("src/lib/supabase-app.server.ts", "utf8");
const riskSupabase = readFileSync("src/lib/risk-supabase.server.ts", "utf8");
const structural = readFileSync("src/lib/structural-context.server.ts", "utf8");
const sourceRights = readFileSync("src/lib/commercial-source-eligibility.server.ts", "utf8");
const agentLedger = readFileSync("src/lib/agent-commerce-delivery.server.ts", "utf8");
const coinbase = readFileSync("src/lib/coinbase-x402.server.ts", "utf8");
const usage = readFileSync("src/lib/coinbase-x402-usage-guard.server.ts", "utf8");
const audit = readFileSync("src/lib/coinbase-x402-product-audit.server.ts", "utf8");
const worker = readFileSync("workers/commerce-ledger/src/index.mjs", "utf8");

describe("Supabase cold-standby production policy", () => {
  it("defaults production to standby and keeps operator opt-ins explicit", () => {
    expect(geomacroSupabaseRuntimeMode({ NODE_ENV: "production" })).toBe("standby");
    expect(geomacroSupabaseRuntimeMode({ NODE_ENV: "test" })).toBe("primary");
    expect(
      geomacroSupabaseRuntimeMode({
        NODE_ENV: "production",
        GEOMACRO_SUPABASE_RUNTIME_MODE: "standby_read",
      }),
    ).toBe("standby_read");
    expect(
      supabasePrimaryTrafficAllowed({
        NODE_ENV: "production",
        GEOMACRO_SUPABASE_RUNTIME_MODE: "standby",
      }),
    ).toBe(false);
    expect(
      supabaseReadFallbackAllowed({
        NODE_ENV: "production",
        GEOMACRO_SUPABASE_RUNTIME_MODE: "standby_read",
      }),
    ).toBe(true);
  });

  it("cuts the normal app, risk and historical structural clients out of production serving", () => {
    expect(appSupabase).toContain("supabaseReadFallbackAllowed(env)");
    expect(riskSupabase).toContain("if (!supabasePrimaryTrafficAllowed(env)) return null;");
    expect(riskSupabase).toContain('if (env.NODE_ENV === "production") return false;');
    expect(riskSupabase).toContain("AUTHORITATIVE_RISK_PROJECT_REF");
    expect(structural).toContain("if (!supabaseReadFallbackAllowed()) return null;");
    expect(structural).toContain("readB2StructuralServingSnapshot");
  });

  it("checks verified B2 source-rights before any Supabase fallback", () => {
    const b2 = sourceRights.indexOf("readB2CommercialSourceRights()");
    const supabase = sourceRights.indexOf("readSupabaseSourceRightsRow(normalized)");
    expect(b2).toBeGreaterThan(-1);
    expect(supabase).toBeGreaterThan(b2);
    expect(sourceRights).toContain("COMMERCIAL_SOURCE_RIGHTS_B2_UNAVAILABLE_SUPABASE_STANDBY");
  });
});

describe("durable commerce control plane", () => {
  it("defaults production paid-delivery state to the Durable Object backend", () => {
    expect(agentLedger).toContain('process.env.NODE_ENV === "production" ? "durable_object" : "supabase"');
    expect(agentLedger).toContain('commerceLedgerBackend() === "durable_object"');
  });

  it("moves Coinbase delivery claim/prepare/complete/release off Coinbase-specific Supabase RPCs", () => {
    expect(coinbase).toContain("claimAgentCommerceDelivery({");
    expect(coinbase).toContain("prepareAgentCommerceDelivery({");
    expect(coinbase).toContain("completeAgentCommerceDelivery({");
    expect(coinbase).toContain("releaseAgentCommerceDelivery({");
    expect(coinbase).toContain("configuredCoinbaseCommercialEnvironment()");
    expect(coinbase).not.toContain('rpc("claim_coinbase_x402_delivery"');
    expect(coinbase).not.toContain('rpc("prepare_coinbase_x402_delivery"');
    expect(coinbase).not.toContain('rpc("complete_coinbase_x402_delivery"');
    expect(coinbase).not.toContain('rpc("release_coinbase_x402_delivery"');
  });

  it("moves production usage guard and product audit to the same durable control plane", () => {
    expect(usage).toContain('"/v1/usage/reserve"');
    expect(usage).toContain('"/v1/usage/finalize"');
    expect(usage).toContain('"/v1/usage/release"');
    expect(audit).toContain('"/v1/audit/upsert"');
    expect(worker).toContain('capabilities: ["delivery", "usage_guard", "product_audit"]');
    expect(worker).toContain("async usageReserve(body)");
    expect(worker).toContain("async usageFinalize(body)");
    expect(worker).toContain("async usageRelease(body)");
    expect(worker).toContain("async auditUpsert(body)");
  });
});
