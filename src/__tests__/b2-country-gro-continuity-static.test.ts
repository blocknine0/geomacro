import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("B2 country GRO continuity", () => {
  it("reads canonical country GROs directly from private B2 without Supabase mediation", () => {
    const source = read("src/lib/b2-country-gro.server.ts");
    expect(source).toContain('const B2_ENDPOINT = "https://s3.us-east-005.backblazeb2.com"');
    expect(source).toContain('const B2_BUCKET = "geomacro-private-archive"');
    expect(source).toContain("AWS4-HMAC-SHA256");
    expect(source).toContain("verifyRiskObjectSignature(object).valid");
    expect(source).toContain("verifyCommercialRiskObjectArtifact(object");
    expect(source).not.toContain("requireRiskSupabase");
    expect(source).not.toContain("gro-archive-read");
    expect(source).not.toContain("supabase-js");
  });

  it("uses B2 only as canonical outage continuity and never overrides a healthy primary miss", () => {
    const source = read("src/lib/country-gro-resolver.server.ts");
    expect(source).toContain("return await getLatestCompatibleCountryRiskObjectAtOrBefore");
    expect(source).toContain('if (deliveryProfile !== "CANONICAL") return null');
    expect(source).toContain("return await readB2LatestCanonicalCountryGro");
    const tryIndex = source.indexOf("try {");
    const catchIndex = source.indexOf("} catch {");
    const b2Index = source.indexOf("readB2LatestCanonicalCountryGro", catchIndex);
    expect(tryIndex).toBeGreaterThanOrEqual(0);
    expect(catchIndex).toBeGreaterThan(tryIndex);
    expect(b2Index).toBeGreaterThan(catchIndex);
  });

  it("wires both paid country module resolution and Risk Gate through the outage-safe resolver", () => {
    const modules = read("src/lib/agent-query-external-modules.server.ts");
    const gate = read("src/lib/risk-gate-service.server.ts");
    expect(modules).toContain('from "./country-gro-resolver.server"');
    expect(modules).toContain("await resolveCountryGroAtOrBefore(subject.country_iso3, asOf)");
    expect(gate).toContain('from "./country-gro-resolver.server"');
    expect(gate).toContain("await resolveCountryGroAtOrBefore(");
  });

  it("publishes only verified deliverable signed GROs after full B2 readback", () => {
    const publisher = read("scripts/ops/publish-b2-country-gro-continuity.ts");
    expect(publisher).toContain("await b2.put(key, packed)");
    expect(publisher).toContain("const readback = await b2.get(key)");
    expect(publisher).toContain("sha256(readback) !== digest");
    expect(publisher).toContain("verifyRiskObjectSignature(object).valid");
    expect(publisher).toContain("verifyCommercialRiskObjectArtifact(object");
    expect(publisher).toContain("PUBLIC_DEMO_RISK_PROFILE_REASON");
    expect(publisher).toContain("country-gro/by-id/");
    expect(publisher).toContain("/latest.json.gz");
  });

  it("proves the runtime reader works after Supabase credentials are removed", () => {
    const canary = read("scripts/ops/verify-b2-country-gro-direct-read.ts");
    const workflow = read(".github/workflows/b2-country-gro-continuity.yml");
    expect(canary).toContain("delete process.env.APP_SUPABASE_URL");
    expect(canary).toContain("delete process.env.APP_SUPABASE_SERVICE_ROLE_KEY");
    expect(canary).toContain("delete process.env.SUPABASE_URL");
    expect(canary).toContain("delete process.env.SUPABASE_SERVICE_ROLE_KEY");
    expect(canary).toContain("await import(");
    expect(canary).toContain('"../../src/lib/b2-country-gro.server"');
    expect(canary).toContain("readB2LatestCanonicalCountryGro(countryIso3, evaluatedAt)");
    expect(canary).toContain("supabase_credentials_present: Boolean(");
    expect(workflow).toContain("bun scripts/ops/verify-b2-country-gro-direct-read.ts");
  });

  it("keeps production publication bounded and explicit", () => {
    const workflow = read(".github/workflows/b2-country-gro-continuity.yml");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("scripts/db/assert-authoritative-supabase.mjs");
    expect(workflow).toContain("publish-b2-country-gro-continuity.ts");
    expect(workflow).not.toContain("schedule:");
  });
});
