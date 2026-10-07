import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("B2 country GRO preservation fallback", () => {
  it("never manufactures freshness when a new canonical GRO is not verified", () => {
    const workflow = read(".github/workflows/b2-country-gro-continuity.yml");
    expect(workflow).toContain('echo "fresh=false" >> "$GITHUB_OUTPUT"');
    expect(workflow).toContain("steps.refresh.outputs.fresh != 'true'");
    expect(workflow).toContain("record-b2-country-gro-preservation-hold.ts");
    expect(workflow).toContain("FAIL_CLOSED_NO_B2_IO");
    expect(workflow).toContain("if: steps.refresh.outputs.fresh == 'true'");
  });

  it("holds the previous package without recurring B2 reads when the 195-country floor is not met", () => {
    const hold = read("scripts/ops/record-b2-country-gro-preservation-hold.ts");
    expect(hold).toContain('schema: "geomacro.country-gro-preservation-hold.v1"');
    expect(hold).toContain('action: "FAIL_CLOSED_NO_B2_IO"');
    expect(hold).toContain("previous_b2_package_mutated: false");
    expect(hold).toContain("previous_b2_package_reverified_this_run: false");
    expect(hold).toContain("b2_read_performed: false");
    expect(hold).toContain("b2_write_performed: false");
    expect(hold).toContain("freshness_advanced: false");
    expect(hold).toContain("d1_advanced: false");
    expect(hold).not.toContain("createB2Client");
    expect(hold).not.toContain("b2.get(");
    expect(hold).not.toContain("b2.put(");
  });

  it("keeps full B2 readback mandatory for a newly published package", () => {
    const publisher = read("scripts/ops/publish-b2-country-gro-continuity.ts");
    expect(publisher).toContain("await b2.put(key, packed)");
    expect(publisher).toContain("const readback = await b2.get(key)");
    expect(publisher).toContain("B2_COUNTRY_GRO_READBACK_HASH_INVALID");
    expect(publisher).toContain("const proofReadback = await b2.get(PROOF_KEY)");
    expect(publisher).toContain("B2_COUNTRY_GRO_PROOF_READBACK_INVALID");
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
