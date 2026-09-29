import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("B2 bundle read bridge", () => {
  it("accepts raw, observation, and GRO bundles without widening access", () => {
    const bridge = read("supabase/functions/archive-verify-read/index.ts");
    const raw = read("scripts/ops/b2-raw-storage-bundle-maintenance.mjs");

    for (const kind of ["raw-bundle", "observation-bundle", "gro-bundle"]) {
      expect(bridge).toContain(`kind === "${kind}"`);
    }
    expect(raw).toContain('kind: "raw-bundle"');
    expect(bridge).toContain('role !== "service_role"');
    expect(bridge).toContain("bundleId.test(id)");
  });
});
