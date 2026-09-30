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

describe("structured-event verified B2 compaction", () => {
  it("requires B2 archive/readback/restore before changing the hot payload", () => {
    expect(script).toContain("await b2.put(archiveKey, compressed)");
    expect(script).toContain("const readback = await b2.get(archiveKey)");
    expect(script).toContain("STRUCTURED_EVENT_COMPACT_READBACK_HASH_INVALID");
    expect(script).toContain("STRUCTURED_EVENT_COMPACT_RESTORE_INVALID");
    expect(script).toContain("STRUCTURED_EVENT_COMPACT_SOURCE_CHANGED");
    expect(script.indexOf("const readback = await b2.get(archiveKey)")).toBeLessThan(
      script.indexOf('.update({ structured_payload: compact })'),
    );
  });

  it("retains the hot fields used by current story continuation and country risk", () => {
    for (const key of [
      "structure_version",
      "country_version",
      "story_version",
      "scoring_version",
      "relevance_version",
      "event_label",
      "primary_country_name",
      "source_domains",
      "source_families",
      "cluster_tokens",
      "why_it_matters",
      "risk_channels",
      "severity",
      "confidence",
      "direction",
    ]) {
      expect(script).toContain(`\"${key}\"`);
    }
    expect(script).toContain("geomacro.structured-event-cold-pointer.v1");
  });

  it("rolls back the original payload if post-update restore fails", () => {
    expect(script).toContain("STRUCTURED_EVENT_COMPACT_POST_UPDATE_ARCHIVE_HASH_INVALID");
    expect(script).toContain("STRUCTURED_EVENT_COMPACT_POST_UPDATE_RESTORE_INVALID");
    expect(script).toContain('.update({ structured_payload: payload })');
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
