import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/structured-evidence-b2-delete-batch.yml",
  "utf8",
);

describe("structured evidence verified delete batch", () => {
  it("is serialized, capped at ten rows, and manual-only during B2 AccessDenied hold", () => {
    expect(workflow).toContain("workflow_dispatch");
    expect(workflow).not.toContain("schedule:");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain('test "$STRUCTURED_EVIDENCE_DELETE_LIMIT" -le 10');
    expect(workflow).toContain('seq 1 "$STRUCTURED_EVIDENCE_DELETE_LIMIT"');
  });

  it("keeps explicit safe manual defaults", () => {
    expect(workflow).toContain("STRUCTURED_EVIDENCE_DELETE_OLDER_DAYS: ${{ inputs.older_days }}");
    expect(workflow).toContain("STRUCTURED_EVIDENCE_DELETE_LIMIT: ${{ inputs.limit }}");
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
