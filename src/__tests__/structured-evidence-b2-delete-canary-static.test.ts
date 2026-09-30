import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync(
  "scripts/ops/b2-delete-structured-evidence-canary.mjs",
  "utf8",
);
const workflow = readFileSync(
  ".github/workflows/structured-evidence-b2-delete-canary.yml",
  "utf8",
);

describe("structured evidence B2 delete canary", () => {
  it("is one-row, seven-day minimum, pointer-v2 only", () => {
    expect(script).toContain("olderDays < 7");
    expect(script).toContain("row?.structured_payload?._archive?.v === 2");
    expect(script).toContain('.limit(1)');
  });

  it("verifies B2 and source identity before deleting", () => {
    expect(script).toContain("await b2.put(archiveKey, compressed)");
    expect(script).toContain("await restoreArchive(pointer, row.event_id, row.fingerprint)");
    expect(script).toContain("STRUCTURED_EVIDENCE_DELETE_SOURCE_CHANGED");
    expect(script.indexOf("await restoreArchive(pointer, row.event_id, row.fingerprint)")).toBeLessThan(
      script.indexOf('.delete().eq("event_id", row.event_id)'),
    );
  });

  it("requires the archived-source rights bridge and exact rights parity", () => {
    expect(script).toContain("live_structured_event_archived_sources");
    expect(script).toContain("STRUCTURED_EVIDENCE_DELETE_RIGHTS_BRIDGE_UNAVAILABLE");
    expect(script).toContain("STRUCTURED_EVIDENCE_DELETE_RIGHTS_CHANGED_AFTER_BRIDGE");
    expect(script).toContain("STRUCTURED_EVIDENCE_DELETE_RIGHTS_CHANGED_AFTER_DELETE");
    expect(script).toContain("archived_source_rights_preserved: true");
  });

  it("rolls back the exact evidence row and bridge on any post-mutation failure", () => {
    expect(script).toContain('from("live_structured_event_evidence").insert(row)');
    expect(script).toContain("STRUCTURED_EVIDENCE_DELETE_ROLLBACK_SOURCE_VERIFY_FAILED");
    expect(script).toContain("STRUCTURED_EVIDENCE_DELETE_ROLLBACK_RIGHTS_VERIFY_FAILED");
    expect(script).toContain("STRUCTURED_EVIDENCE_DELETE_ROLLBACK_FAILED");
  });

  it("is manual-only, serialized, and never touches storage.objects", () => {
    expect(script).not.toContain("storage.objects");
    expect(workflow).toContain("workflow_dispatch");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("environment: production");
    expect(workflow).not.toContain("schedule:");
  });
});
