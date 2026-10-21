import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveCommerceLedgerDurabilityPolicy } from "../lib/commerce-control-plane.server";

const service = readFileSync("src/lib/agent-commerce-delivery.server.ts", "utf8");

describe("old Supabase irreversible retirement: commerce delivery authority", () => {
  it("pins every production commerce delivery to DO even if not configured", () => {
    expect(resolveCommerceLedgerDurabilityPolicy(undefined, "production")).toBe(true);
    expect(resolveCommerceLedgerDurabilityPolicy("durable_object", "production")).toBe(true);
  });
  it("never permits stale production Supabase environment override", () => {
    expect(() => resolveCommerceLedgerDurabilityPolicy("supabase", "production"))
      .toThrow("AGENT_PRODUCTION_SUPABASE_COMMERCE_FORBIDDEN");
    expect(() => resolveCommerceLedgerDurabilityPolicy("unknown", "production"))
      .toThrow("AGENT_COMMERCE_LEDGER_BACKEND_INVALID");
  });
  it("retains deliberate local fixture behavior but forbids real-money fallback", () => {
    expect(resolveCommerceLedgerDurabilityPolicy("supabase", "test")).toBe(false);
    expect(resolveCommerceLedgerDurabilityPolicy("durable_object", "test")).toBe(true);
    expect(service).toContain("import { resolveCommerceLedgerDurabilityPolicy }");
    expect(service).toContain("return resolveCommerceLedgerDurabilityPolicy(");
    expect(service).toContain(') ? "durable_object" : "supabase"');
    expect(service).not.toContain(
      '(process.env.NODE_ENV === "production" ? "durable_object" : "supabase")'
    );
    expect(service).toContain('commerceLedgerBackend() === "durable_object"');
    expect(service).toContain('AGENT_COMMERCE_DURABLE_LEDGER_CONFIG_REQUIRED');
  });
});
