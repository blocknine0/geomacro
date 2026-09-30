import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync(
  "scripts/ops/b2-compact-structured-event-payload.mjs",
  "utf8",
);
const workflow = readFileSync(
  ".github/workflows/structured-event-b2-verified-compaction.yml",
  "utf8",
);
const structureFn = readFileSync(
  "supabase/functions/live-structure-intelligence/index.ts",
  "utf8",
);
const riskContract = readFileSync(
  "src/lib/risk-object-contract.ts",
  "utf8",
);

describe("structured-event verified B2 compaction", () => {
  it("requires B2 archive/readback/restore before changing the cold payload", () => {
    expect(script).toContain("await b2.put(archiveKey, compressed)");
    expect(script).toContain("await b2.get(archiveKey)");
    expect(script).toContain("STRUCTURED_EVENT_COMPACT_READBACK_HASH_INVALID");
    expect(script).toContain("STRUCTURED_EVENT_COMPACT_RESTORE_INVALID");
    expect(script).toContain("STRUCTURED_EVENT_COMPACT_SOURCE_CHANGED");
    expect(script.indexOf("await b2.put(archiveKey, compressed)")).toBeLessThan(
      script.indexOf('.update({ structured_payload: compact })'),
    );
  });

  it("uses pointer-only v2 only beyond every current hot structured-event window", () => {
    expect(script).toContain("olderDays < 7");
    expect(structureFn).toContain("const RECENT_EVENT_HOURS = 72");
    expect(structureFn).toContain('"last_seen_at",\n        cutoff');
    expect(riskContract).toContain("export const COUNTRY_RISK_LOOKBACK_HOURS = 72");
    expect(script).toContain("pointerV2");
    expect(script).toContain("v: 2");
    expect(script).not.toContain("const HOT_KEYS");
  });

  it("can safely shrink an already-compacted v1 row by restoring the original first", () => {
    expect(script).toContain('pointer.schema === "geomacro.structured-event-cold-pointer.v1"');
    expect(script).toContain("existingPointer?.version === 1");
    expect(script).toContain("const restored = await restoreArchive(existingPointer, row.id)");
    expect(script).toContain("payload = restored.restoredPayload");
  });

  it("rolls back the exact prior hot payload if post-update restore fails", () => {
    expect(script).toContain("await restoreArchive({ key: archiveKey, archiveSha256, payloadSha256 }, row.id)");
    expect(script).toContain('.update({ structured_payload: currentPayload })');
    expect(script).toContain("STRUCTURED_EVENT_COMPACT_ROLLBACK_FAILED");
  });

  it("is bounded, manual-only, serialized, and never deletes rows or storage objects", () => {
    expect(script).toContain("limit > 10");
    expect(script).toContain("olderDays < 7");
    expect(script).not.toMatch(/\.delete\s*\(/);
    expect(script).not.toContain("storage.objects");
    expect(workflow).toContain("workflow_dispatch");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("environment: production");
    expect(workflow).not.toContain("schedule:");
  });
});
