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

  it("uses verified B2 as the canonical commercial serving authority before Supabase recovery", () => {
    const source = read("src/lib/country-gro-resolver.server.ts");
    expect(source).toContain('if (deliveryProfile === "CANONICAL")');
    expect(source).toContain("const b2 = await readB2LatestCanonicalCountryGro(countryIso3, atOrBefore)");
    expect(source).toContain("if (b2) return b2");
    expect(source).toContain("return await getLatestCompatibleCountryRiskObjectAtOrBefore");
    const b2Index = source.indexOf("const b2 = await readB2LatestCanonicalCountryGro(countryIso3, atOrBefore)");
    const recoveryIndex = source.indexOf("return await getLatestCompatibleCountryRiskObjectAtOrBefore");
    expect(b2Index).toBeGreaterThanOrEqual(0);
    expect(recoveryIndex).toBeGreaterThan(b2Index);
  });

  it("wires both paid country module resolution and Risk Gate through the B2-first resolver", () => {
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

  it("refreshes the full 195+ country-like commercial subject universe without synthetic fill", () => {
    const workflow = read(".github/workflows/b2-country-gro-continuity.yml");
    const runner = read("scripts/refresh-global-canonical-risk-objects.ts");
    expect(workflow).toContain('cron: "41 * * * *"');
    expect(workflow).toContain("refresh-global-canonical-risk-objects.ts");
    expect(workflow).toContain('GLOBAL_CANONICAL_MIN_READY: "195"');
    expect(workflow).toContain('GLOBAL_CANONICAL_MIN_COUNTRY_LIKE_DENOMINATOR: "195"');
    expect(workflow).toContain("paid_ready_country_count");
    expect(workflow).not.toContain("scripts/publish-country-risk-object.ts USA CANONICAL");
    expect(runner).toContain('const COUNTRY_LIKE_SPECIALS = new Set(["PSE", "TWN"])');
    expect(runner).toContain('scope === "SOVEREIGN" || COUNTRY_LIKE_SPECIALS.has(iso3)');
    expect(runner).not.toContain('COUNTRY_LIKE_SPECIALS = new Set(["PSE", "TWN", "UNK"])');
  });

  it("prewarms a fresh D1 GRO on every canonical main advance before the exact-head final gate", () => {
    const workflow = read(".github/workflows/b2-country-gro-continuity.yml");
    expect(workflow).toContain("push:\n    branches: [main]");
    expect(workflow).toContain("Refresh the full country-like commercial subject universe");
    expect(workflow).toContain("hourly schedule remains the steady-state");
  });

  it("keeps GRO continuity on the authoritative database while bypassing restricted REST egress", () => {
    const workflow = read(".github/workflows/b2-country-gro-continuity.yml");
    const shim = read("scripts/lib/gri-db-client.mjs");
    expect(workflow).toContain("SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}");
    expect(workflow).toContain("GRI_DB_MODE: direct_postgres");
    expect(workflow).toContain("--experimental-loader=./scripts/lib/direct-postgres-supabase-loader.mjs");
    expect(workflow).toContain("bun scripts/refresh-global-canonical-risk-objects.ts");
    expect(workflow).toContain("node --import tsx scripts/ops/publish-b2-country-gro-continuity.ts");
    expect(shim).toContain("filter(column, operator, value)");
    expect(shim).toContain('op === "cs" || op === "not.cs"');
    expect(shim).toContain(" @> ");
    expect(shim).toContain('op === "not.cs" ? `NOT (${predicate})` : predicate');
  });

  it("derives the full D1 current index only from independently verified B2 continuity proof bytes", () => {
    const sync = read("scripts/ops/sync-global-current-country-gro-to-d1.ts");
    const workflow = read(".github/workflows/b2-country-gro-continuity.yml");
    expect(sync).toContain("country-gro/continuity-proof.json");
    expect(sync).toContain("GLOBAL_GRO_D1_PROOF_CARDINALITY_INVALID");
    expect(sync).toContain("GLOBAL_GRO_D1_ENVELOPE_HASH_INVALID");
    expect(sync).toContain("GLOBAL_GRO_D1_GENERIC_B2_HASH_INVALID");
    expect(sync).toContain("GLOBAL_GRO_D1_GENERIC_B2_RESTORE_INVALID");
    expect(sync).toContain("verifyCommercialRiskObjectArtifact");
    expect(sync).toContain("GLOBAL_GRO_D1_READY_FLOOR_BREACH");
    expect(sync).toContain("supabase_payload_used_for_d1_record: false");
    expect(sync).toContain("external_payment_performed: false");
    expect(sync).toContain("destructive_b2_change: false");
    expect(workflow).toContain("bun scripts/ops/sync-global-current-country-gro-to-d1.ts");
  });

  it("keeps production publication bounded and explicit", () => {
    const workflow = read(".github/workflows/b2-country-gro-continuity.yml");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("scripts/db/assert-authoritative-supabase.mjs");
    expect(workflow).toContain("publish-b2-country-gro-continuity.ts");
    expect(workflow).toContain("sync-global-current-country-gro-to-d1.ts");
    expect(workflow).toContain("Enforce #1414 195+ commercial GRO floor");
    expect(workflow).toContain('cron: "41 * * * *"');
  });
});
