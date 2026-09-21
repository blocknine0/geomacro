import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/gri-governance.yml", "utf8");
const publishJob =
  workflow.match(/^  publish:\n([\s\S]*?)(?=\n  [a-z0-9_-]+:\n|\\s*$)/m)?.[0] ?? "";

describe("scheduled GRI publisher workflow", () => {
  it("publishes often enough to stay inside the three-hour public proof freshness SLO", () => {
    expect(workflow).toContain('cron: "50 */2 * * *"');
  });

  it("uses the committed Bun lockfile instead of mutating dependencies with npm", () => {
    expect(workflow).toMatch(/oven-sh\/setup-bun@[0-9a-f]{40}/);
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
