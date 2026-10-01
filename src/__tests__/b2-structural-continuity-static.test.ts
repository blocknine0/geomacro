import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("verified B2 structural serving continuity", () => {
  it("keeps historical Supabase primary and uses B2 only for outage continuity", () => {
    const source = read("src/lib/structural-context.server.ts");
    expect(source).toContain("const db = getHistoricalClient()");
    expect(source).toContain("if (!db)");
    expect(source).toContain("await loadB2StructuralContext(subject)");
    expect(source).toContain("curated historical query failed");
    expect(source).toContain("if (b2) return b2");
    expect(source).toContain("No commercially eligible structural observations were found");
  });

  it("discovers country keys cheaply and reads canonical commercial latest state country by country", () => {
    const publisher = read("scripts/ops/publish-b2-structural-serving-snapshot.ts");
    expect(publisher).toContain("discoverCountryCodes");
    expect(publisher).toContain('.select("country_iso3")');
    expect(publisher).toContain('.limit(1)');
    expect(publisher).toContain('.gt("country_iso3", after)');
    expect(publisher).toContain('.eq("commercial_eligibility_status", "VERIFIED")');
    expect(publisher).toContain('.eq("quality_status", "VERIFIED")');
    expect(publisher).toContain('.from("commercial_structural_country_latest")');
    expect(publisher).toContain('.from("commercial_structural_country_coverage_latest")');
    expect(publisher).toContain('.eq("country_iso3", country)');
    expect(publisher).toContain("B2_STRUCTURAL_COUNTRY_KEYSET_PROGRESS_INVALID");
    expect(publisher).not.toContain("raw_payload");
    expect(publisher).not.toContain("raw_hash");
  });

  it("never snapshots the cross-joined corridor view and keeps bounded per-country reads", () => {
    const publisher = read("scripts/ops/publish-b2-structural-serving-snapshot.ts");
    expect(publisher).not.toContain('.from("commercial_structural_corridor_latest")');
    expect(publisher).toContain("MAX_LATEST_PER_COUNTRY");
    expect(publisher).toContain("MAX_COVERAGE_PER_COUNTRY");
    expect(publisher).toContain("B2_STRUCTURAL_TRUNCATION_GUARD_country_latest_");
    expect(publisher).toContain("B2_STRUCTURAL_TRUNCATION_GUARD_country_coverage_");
  });

  it("requires full B2 readback and restore before publishing continuity proof", () => {
    const publisher = read("scripts/ops/publish-b2-structural-serving-snapshot.ts");
    expect(publisher).toContain("await b2.put(SNAPSHOT_KEY, packed)");
    expect(publisher).toContain("const readback = await b2.get(SNAPSHOT_KEY)");
    expect(publisher).toContain("B2_STRUCTURAL_READBACK_HASH_INVALID");
    expect(publisher).toContain("B2_STRUCTURAL_RESTORE_INVALID");
    expect(publisher).toContain("await b2.put(PROOF_KEY, proof)");
    expect(publisher).not.toContain(".delete(");
  });

  it("keeps private B2 credentials server-only and snapshot freshness bounded", () => {
    const reader = read("src/lib/b2-structural.server.ts");
    expect(reader).toContain("process.env.B2_KEY_ID");
    expect(reader).toContain("process.env.B2_APPLICATION_KEY");
    expect(reader).not.toContain("VITE_B2");
    expect(reader).toContain("STRUCTURAL_B2_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000");
    expect(reader).toContain('payload.source_project !== HISTORICAL_PROJECT_REF');
  });

  it("preserves the non-scoring structural methodology boundary", () => {
    const publisher = read("scripts/ops/publish-b2-structural-serving-snapshot.ts");
    const source = read("src/lib/structural-context.server.ts");
    expect(publisher).toContain("EVIDENCE_ONLY_NOT_IN_GRO_V02");
    expect(publisher).toContain("EVIDENCE_ONLY_NOT_IN_GRI_V1_2");
    expect(publisher).toContain("ENDPOINT_COMPOSED_V0_1");
    expect(publisher).toContain("NOT_MODELED");
    expect(source).toContain("ENDPOINT_COMPOSED_V0_1");
    expect(source).toContain("NOT_MODELED");
  });
});
