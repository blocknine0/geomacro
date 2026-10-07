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

  it("reverifies the preserved B2 package without writes or current-deliverability relabeling", () => {
    const verifier = read("scripts/ops/verify-b2-country-gro-preservation.ts");
    expect(verifier).toContain("continuity-proof.json");
    expect(verifier).toContain("sha256(compressed) !== entry.sha256");
    expect(verifier).toContain("proof_entries_validated");
    expect(verifier).toContain("deterministic_sample_country");
    expect(verifier).toContain("full_package_readback_reused_from_publication_proof");
    expect(verifier).toContain('object?.verification?.status !== "VERIFIED"');
    expect(verifier).toContain('object?.commercial_eligibility?.status !== "VERIFIED"');
    expect(verifier).toContain("verifyRiskObjectSignature(object).valid");
    expect(verifier).toContain("wrote_new_snapshot: false");
    expect(verifier).toContain("freshness_advanced: false");
    expect(verifier).not.toContain("b2.put(");
    expect(verifier).not.toContain("verifyCommercialRiskObjectArtifact(");
  });

  it("bounds no-mutation preservation to proof plus one deterministic pair", () => {
    const workflow = read(".github/workflows/b2-country-gro-continuity.yml");
    const verifier = read("scripts/ops/verify-b2-country-gro-preservation.ts");
    expect(workflow).toContain('B2_REQUEST_BUDGET: "4"');
    expect(verifier).toContain("const sampleCountry = [...latestByCountry.keys()].sort()[0]");
    expect(verifier).toContain("await verifySample(sampleLatest)");
    expect(verifier).toContain("await verifySample(sampleById)");
    expect(verifier).toContain("b2_objects_reverified: 3");
    expect(verifier).not.toContain("for (const entry of proof.entries) {\n  const compressed = await b2.get");
  });

    it("never advances D1 from a preservation-only cycle", () => {
    const workflow = read(".github/workflows/b2-country-gro-continuity.yml");
    const syncMarker = "Sync all independently verified current country GROs to D1";
    const syncIndex = workflow.indexOf(syncMarker);
    expect(syncIndex).toBeGreaterThanOrEqual(0);
    const syncBlock = workflow.slice(syncIndex, syncIndex + 420);
    expect(syncBlock).toContain("if: steps.refresh.outputs.fresh == 'true'");
  });
});
