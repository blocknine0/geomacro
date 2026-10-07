import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("B2 country GRO preservation fallback", () => {
  it("never manufactures freshness when a new canonical GRO is not verified", () => {
    const workflow = read(".github/workflows/b2-country-gro-continuity.yml");
    expect(workflow).toContain('echo "fresh=false" >> "$GITHUB_OUTPUT"');
    expect(workflow).toContain("steps.refresh.outputs.fresh != 'true'");
    expect(workflow).toContain("bun scripts/ops/verify-b2-country-gro-preservation.ts");
    expect(workflow).toContain("without advancing freshness");
    expect(workflow).toContain("if: steps.refresh.outputs.fresh == 'true'");
  });

  it("verifies bundle v2 with two B2 reads and never relabels preserved freshness", () => {
    const verifier = read("scripts/ops/verify-b2-country-gro-preservation.ts");
    expect(verifier).toContain('BUNDLE_PROOF_SCHEMA = "geomacro.country-gro-continuity-proof.v2"');
    expect(verifier).toContain('BUNDLE_SCHEMA = "geomacro.country-gro-bundle.v2"');
    expect(verifier).toContain("const packed = await b2.get(bundleKey)");
    expect(verifier).toContain("sha256(packed) !== bundleSha");
    expect(verifier).toContain("sha256(canonicalRiskObjectJson(object)) !== recordSha");
    expect(verifier).toContain("verifyRiskObjectSignature(object).valid");
    expect(verifier).toContain('auditMode = "single-bundle-full-member-integrity"');
    expect(verifier).toContain("max_b2_gets_per_preservation_cycle: proof.schema === LEGACY_PROOF_SCHEMA ? 3 : 2");
    expect(verifier).toContain("wrote_new_snapshot: false");
    expect(verifier).toContain("freshness_advanced: false");
    expect(verifier).not.toContain("b2.put(");
    expect(verifier).not.toContain("verifyCommercialRiskObjectArtifact(");
  });

  it("bounds legacy-v1 preservation to one rotating latest/by-id pair", () => {
    const verifier = read("scripts/ops/verify-b2-country-gro-preservation.ts");
    expect(verifier).toContain("const hourNumber = Math.floor(Date.now() / 3_600_000)");
    expect(verifier).toContain("const latest = latestEntries[hourNumber % latestEntries.length]");
    expect(verifier).toContain("const sample = [latest, byId]");
    expect(verifier).toContain('auditMode = "rotating-bounded-legacy-pair"');
    expect(verifier).not.toContain("for (const entry of proof.entries)");
  });

  it("never advances D1 from a preservation-only cycle", () => {
    const workflow = read(".github/workflows/b2-country-gro-continuity.yml");
    const syncMarker = "Sync all independently verified current country GROs to D1";
    const syncIndex = workflow.indexOf(syncMarker);
    expect(syncIndex).toBeGreaterThanOrEqual(0);
    const syncBlock = workflow.slice(syncIndex, syncIndex + 900);
    expect(syncBlock).toContain("if: steps.refresh.outputs.fresh == 'true'");
  });
});
