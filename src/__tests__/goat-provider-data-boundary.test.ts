import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// This contract is intentionally static: any future provider field expansion
// must be explicitly normalized before it can enter customer-facing evidence.
describe("GOAT provider data boundary", () => {
  it("keeps raw provider responses out of the public payment challenge contract", () => {
    const source = readFileSync("src/lib/goat-flow.server.ts", "utf8");
    const start = source.indexOf("export type GoatFlowPaymentChallenge");
    const end = source.indexOf("export type GoatFlowOrder", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const contract = source.slice(start, end);
    expect(contract).not.toContain("raw:");
    expect(contract).not.toContain("Record<string, unknown>");
  });

  it("persists and returns only the normalized allowlisted challenge", () => {
    const service = readFileSync("src/lib/goat-pilot-service.server.ts", "utf8");
    expect(service).not.toContain("raw: _providerRaw");
    expect(service).toContain("const normalizedChallenge = providerChallenge;");
    expect(service).not.toContain("provider_response");
    expect(service).not.toContain("provider_raw");
  });

  it("never stores a raw provider response column in GOAT pilot evidence migrations", () => {
    const evidence = readFileSync("supabase/migrations/046_goat_partner_pilot_evidence.sql", "utf8");
    expect(evidence).not.toContain("provider_raw");
    expect(evidence).not.toContain("provider_response");
    expect(evidence).not.toContain("raw_response");
  });
});
