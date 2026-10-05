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
    expect(verifier).toContain("sha256(compressed) !== expectedSha");
    expect(verifier).toContain('object?.verification?.status !== "VERIFIED"');
    expect(verifier).toContain('object?.commercial_eligibility?.status !== "VERIFIED"');
    expect(verifier).toContain("verifyRiskObjectSignature(object).valid");
    expect(verifier).toContain("wrote_new_snapshot: false");
    expect(verifier).toContain("freshness_advanced: false");
    expect(verifier).not.toContain("b2.put(");
    expect(verifier).not.toContain("verifyCommercialRiskObjectArtifact(");
  });

  it("never advances D1 from a preservation-only cycle", () => {
    const workflow = read(".github/workflows/b2-country-gro-continuity.yml");
    const syncMarker = "Sync independently verified current country GRO to D1";
    const syncIndex = workflow.indexOf(syncMarker);
    expect(syncIndex).toBeGreaterThanOrEqual(0);
    const syncBlock = workflow.slice(syncIndex, syncIndex + 260);
    expect(syncBlock).toContain("if: steps.refresh.outputs.fresh == 'true'");
  });
});
