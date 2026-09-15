import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const engine = read("scripts/lib/gri-engine-v12.js");
const compute = read("scripts/compute-gri-v12.js");
const replay = read("scripts/replay-gri-history-v12.js");
const proofData = read("src/lib/gri-proof-data.ts");

describe("current GRI v1.2 source labels", () => {
  it("keeps the canonical v1.2 engine failure label aligned with the methodology", () => {
    expect(engine).toContain('GRI_METHOD_VERSION = "gri-v1.2.0"');
    expect(engine).toContain("GRI v1.2 fail-closed input rejection:");
    expect(engine).not.toContain("GRI v1.1 fail-closed input rejection:");
  });

  it("keeps current proof and provenance errors labelled v1.2", () => {
    expect(proofData).toContain("current v1.2 proof contract.");
    expect(proofData).toContain("current v1.2 provenance contract.");
    expect(proofData).not.toContain("current v1.1 proof contract.");
    expect(proofData).not.toContain("current v1.1 provenance contract.");
  });

  it("keeps current compute and replay commentary labelled v1.2", () => {
    expect(compute).toContain("complete v1.2 input/story/weight/proof path");
    expect(compute).not.toContain("complete v1.1 input/story/weight/proof path");

    expect(replay).toContain("Replay v1.2 deliberately uses");
    expect(replay).not.toContain("Replay v1.1 deliberately uses");
  });
});
