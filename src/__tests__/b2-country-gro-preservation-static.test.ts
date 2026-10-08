import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("country GRO cold-archive preservation boundary", () => {
  it("never manufactures or advances hot freshness when a fresh canonical set is not verified", () => {
    const workflow = read(".github/workflows/b2-country-gro-continuity.yml");
    expect(workflow).toContain('echo "fresh=false" >> "$GITHUB_OUTPUT"');
    expect(workflow).toContain("if: steps.refresh.outputs.fresh == 'true'");
    expect(workflow).toContain("Publish one bundled cold archive and verified D1 hot GRO set");
    expect(workflow).not.toContain("steps.refresh.outputs.fresh != 'true'");
    expect(workflow).not.toContain("verify-b2-country-gro-preservation.ts");
  });

  it("retains the legacy no-mutation verifier as recovery tooling only", () => {
    const verifier = read("scripts/ops/verify-b2-country-gro-preservation.ts");
    expect(verifier).toContain("continuity-proof.json");
    expect(verifier).toContain("sha256(compressed) !== entry.sha256");
    expect(verifier).toContain("verifyRiskObjectSignature(object).valid");
    expect(verifier).toContain("wrote_new_snapshot: false");
    expect(verifier).toContain("freshness_advanced: false");
    expect(verifier).not.toContain("b2.put(");
  });

  it("uses only two bounded cold-archive reads when audit capacity exists", () => {
    const workflow = read(".github/workflows/b2-country-gro-continuity.yml");
    const audit = read("scripts/ops/verify-country-gro-cold-bundle.ts");
    expect(workflow).toContain('B2_REQUEST_BUDGET: "4"');
    expect(audit).toContain("await b2.get(PROOF_KEY)");
    expect(audit).toContain("await b2.get(String(proof.bundle_key))");
    expect(audit).toContain("b2_reads:2");
    expect(audit).toContain("archive_readback_verified:true");
  });

  it("defers only the classified B2 download-cap audit while preserving verified hot serving", () => {
    const workflow = read(".github/workflows/b2-country-gro-continuity.yml");
    expect(workflow).toContain("B2_DOWNLOAD_CAP_EXCEEDED");
    expect(workflow).toContain('"hot_serving_blocked":false');
    expect(workflow).toContain('"archive_readback_verified":false');
    expect(workflow).toContain('exit "$rc"');
  });
});
