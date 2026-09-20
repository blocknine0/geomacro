import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("website lock governance", () => {
  it("keeps the lock workflow immutable at the action and credential boundary without baseline self-locking", () => {
    const workflow = read(".github/workflows/website-lock.yml");
    const verifier = read("scripts/ops/verify-website-lock.mjs");

    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).toMatch(/uses: actions\/checkout@[0-9a-f]{40}/);
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain("node scripts/ops/verify-website-lock.mjs");
    expect(workflow).toContain("Website lock self-test failed");

    expect(verifier).toContain(
      "Baseline-locking the verifier/workflow itself would make ordinary security maintenance self-deadlocking",
    );
    expect(verifier).not.toContain("lockInfrastructure.has(path)");
  });

  it("keeps the published presentation baseline fail-closed", () => {
    const config = JSON.parse(read("config/website-lock.json"));
    expect(config.locked).toBe(true);
    expect(config.baseline_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(config.published_source_sha).toMatch(/^[0-9a-f]{40}$/);
  });
});
