import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/structured-evidence-b2-delete-batch.yml",
  "utf8",
);

describe("structured evidence verified delete batch", () => {
  it("is serialized, capped at ten rows, and scheduled every fifteen minutes", () => {
    expect(workflow).toContain("workflow_dispatch");
    expect(workflow).toContain("schedule:");
    expect(workflow).toContain('cron: "7,22,37,52 * * * *"');
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain('test "$STRUCTURED_EVIDENCE_DELETE_LIMIT" -le 10');
    expect(workflow).toContain('seq 1 "$STRUCTURED_EVIDENCE_DELETE_LIMIT"');
  });

  it("uses explicit safe defaults for scheduled runs and keeps manual inputs", () => {
    expect(workflow).toContain("github.event_name == 'schedule' && '7' || inputs.older_days");
    expect(workflow).toContain("github.event_name == 'schedule' && '10' || inputs.limit");
    expect(workflow).toContain('default: "7"');
    expect(workflow).toContain('default: "10"');
  });

  it("reuses the already verified one-row canary for every batch iteration", () => {
    expect(workflow).toContain("node scripts/ops/b2-delete-structured-evidence-canary.mjs");
    expect(workflow).toContain("set -euo pipefail");
    expect(workflow).toContain("environment: production");
  });

  it("removes the completed temporary one-shot triggers from the target branch", () => {
    expect(() => readFileSync(
      ".github/workflows/structured-evidence-b2-delete-canary-once.yml",
      "utf8",
    )).toThrow();
  });
});
