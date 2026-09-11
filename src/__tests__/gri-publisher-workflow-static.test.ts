import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/publish-gri.yml", "utf8");

describe("scheduled GRI publisher workflow", () => {
  it("uses the committed Bun lockfile instead of mutating dependencies with npm", () => {
    expect(workflow).toContain("oven-sh/setup-bun@v2");
    expect(workflow).toContain('bun-version: "1.4.2"');
    expect(workflow).toContain("bun install --frozen-lockfile --ignore-scripts");
    expect(workflow).not.toContain("npm install --no-save");
  });

  it("keeps the GRI v1.2 publish and independent verification sequence", () => {
    expect(workflow).toContain("node scripts/cluster-gri-stories-v12.js");
    expect(workflow).toContain("node scripts/compute-gri-v12.js");
    expect(workflow).toContain("node scripts/verify-gri-snapshot-v12.js");
  });
});
