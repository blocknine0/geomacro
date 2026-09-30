import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync(
  "scripts/ops/b2-archive-structured-evidence-canary.mjs",
  "utf8",
);
const workflow = readFileSync(
  ".github/workflows/structured-evidence-b2-archive-canary.yml",
  "utf8",
);

describe("structured evidence B2 archive canary", () => {
  it("archives only evidence whose parent event is already cold pointer v2", () => {
    expect(script).toContain('row?.structured_payload?._archive?.v === 2');
    expect(script).toContain("olderDays < 7");
    expect(script).toContain('.lt("last_seen_at", cutoff)');
    expect(script).toContain('.lt("created_at", cutoff)');
  });

  it("requires full B2 readback and exact JSON restore", () => {
    expect(script).toContain("await b2.put(archiveKey, compressed)");
    expect(script).toContain("const readback = await b2.get(archiveKey)");
    expect(script).toContain("STRUCTURED_EVIDENCE_READBACK_HASH_INVALID");
    expect(script).toContain("STRUCTURED_EVIDENCE_RESTORE_INVALID");
    expect(script).toContain("STRUCTURED_EVIDENCE_SOURCE_CHANGED");
  });

  it("is exactly one-row, non-destructive, manual-only, and serialized", () => {
    expect(script).toContain('.limit(1)');
    expect(script).not.toMatch(/\.delete\s*\(/);
    expect(script).not.toMatch(/\.update\s*\(/);
    expect(script).not.toContain("storage.objects");
    expect(script).toContain("destructive_cleanup_performed: false");
    expect(workflow).toContain("workflow_dispatch");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("environment: production");
    expect(workflow).not.toContain("schedule:");
  });
});
