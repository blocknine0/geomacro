import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("global production coverage gate semantics", () => {
  it("keeps structural global coverage separate from commercial source certification", () => {
    const script = read("scripts/audit-global-production-coverage.mjs");
    expect(script).toContain("ready_for_global_coverage_claim");
    expect(script).toContain("commercial_source_network_ready");
    expect(script).toContain("result.ready_for_global_coverage_claim =");
    expect(script).toContain("result.ready_for_global_production_claim =");
    expect(script).toContain("Commercial source certification remains a separate fail-closed gate");
    expect(script).toContain('process.argv.includes("--strict") && !result.ready_for_global_coverage_claim');
  });

  it("does not make strict structural coverage depend on commercial certification", () => {
    const script = read("scripts/audit-global-production-coverage.mjs");
    const strictIndex = script.indexOf('if (process.argv.includes("--strict") && !result.ready_for_global_coverage_claim)');
    expect(strictIndex).toBeGreaterThan(0);
    const strictBlock = script.slice(strictIndex, strictIndex + 500);
    expect(strictBlock).not.toContain("source_network_100_complete");
    expect(strictBlock).not.toContain("source_network_launch_complete");
  });
});
