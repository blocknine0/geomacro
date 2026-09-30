import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/ops/b2-compact-structured-event-payload.mjs", "utf8");
const workflow = readFileSync(".github/workflows/structured-event-b2-verified-compaction.yml", "utf8");
const structureFn = readFileSync("supabase/functions/live-structure-intelligence/index.ts", "utf8");
const riskContract = readFileSync("src/lib/risk-object-contract.ts", "utf8");

describe("structured-event verified B2 compaction", () => {
  it("requires B2 archive/readback/restore before changing the cold payload", () => {
    expect(script).toContain("await b2.put(archiveKey, compressed)");
    expect(script).toContain("await b2.get(archiveKey)");
    expect(script).toContain("STRUCTURED_EVENT_COMPACT_READBACK_HASH_INVALID");
    expect(script).toContain("STRUCTURED_EVENT_COMPACT_RESTORE_INVALID");
    expect(script).toContain("STRUCTURED_EVENT_COMPACT_SOURCE_CHANGED");
    expect(script.indexOf("await b2.put(archiveKey, compressed)")).toBeLessThan(script.indexOf('.update({ structured_payload: compact })'));
  });

  it("uses pointer-only v2 only beyond every current hot structured-event window", () => {
    expect(script).toContain("olderDays < 7");
    expect(structureFn).toContain("const RECENT_EVENT_HOURS = 72");
    expect(riskContract).toContain("export const COUNTRY_RISK_LOOKBACK_HOURS = 72");
    expect(script).toContain("pointerV2");
    expect(script).toContain("v: 2");
  });

  it("is quota-held to manual dispatch while B2 readback is denied", () => {
    expect(workflow).toContain("workflow_dispatch");
    expect(workflow).not.toContain("schedule:");
    expect(workflow).toContain("STRUCTURED_EVENT_COMPACT_OLDER_DAYS: ${{ inputs.older_days }}");
    expect(workflow).toContain("STRUCTURED_EVENT_COMPACT_LIMIT: ${{ inputs.limit }}");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(script).not.toMatch(/\.delete\s*\(/);
    expect(script).not.toContain("storage.objects");
  });
});
