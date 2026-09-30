import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/ops/b2-archive-structured-event-canary.mjs", "utf8");
const workflow = readFileSync(".github/workflows/structured-event-b2-archive-canary.yml", "utf8");

describe("structured-event B2 archive canary", () => {
  it("is archive-only and requires full B2 restore verification", () => {
    expect(script).toContain("await b2.put(archiveKey, compressed)");
    expect(script).toContain("const readback = await b2.get(archiveKey)");
    expect(script).toContain("STRUCTURED_EVENT_ARCHIVE_READBACK_HASH_INVALID");
    expect(script).toContain("STRUCTURED_EVENT_ARCHIVE_RESTORE_INVALID");
    expect(script).toContain("destructive_cleanup_performed: false");
    expect(script).not.toMatch(/\.delete\s*\(/);
    expect(script).not.toContain("structured_payload: null");
    expect(script).not.toContain("structured_payload: {}");
    expect(script).not.toContain("storage.objects");
  });

  it("remains manual, serialized, and bounded to one event", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("schedule:");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(script).toContain(".limit(1)");
    expect(script).toContain("olderDays < 7");
  });
});
