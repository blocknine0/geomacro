import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/ops/b2-archive-observation-provenance-canary.mjs", "utf8");
const workflow = readFileSync(".github/workflows/observation-provenance-b2-archive-canary.yml", "utf8");

describe("observation provenance B2 archive canary", () => {
  it("targets only old historical non-latest World Bank indicator rows", () => {
    expect(script).toContain('const SOURCE_ID = "world_bank_indicators"');
    expect(script).toContain('from("live_world_bank_indicator_latest")');
    expect(script).toContain('historical_non_latest_verified: true');
    expect(script).toContain('olderDays < 7');
  });

  it("verifies B2 full readback and JSON restore before writing proof", () => {
    expect(script).toContain("await b2.put(archiveKey, compressed)");
    expect(script).toContain("const readback = await b2.get(archiveKey)");
    expect(script).toContain("OBSERVATION_PROVENANCE_ARCHIVE_READBACK_HASH_INVALID");
    expect(script).toContain("OBSERVATION_PROVENANCE_ARCHIVE_RESTORE_INVALID");
    expect(script.indexOf("const readback = await b2.get(archiveKey)"))
      .toBeLessThan(script.indexOf("await b2.put(proofKey"));
  });

  it("rechecks latest status and exact source provenance without mutating Supabase", () => {
    expect(script).toContain("OBSERVATION_PROVENANCE_ARCHIVE_LATEST_STATUS_CHANGED");
    expect(script).toContain("OBSERVATION_PROVENANCE_ARCHIVE_SOURCE_CHANGED");
    expect(script).not.toContain(".update(");
    expect(script).not.toContain(".delete(");
    expect(script).not.toContain("storage.objects");
    expect(script).toContain("destructive_cleanup_performed: false");
  });

  it("is manual-only and serialized", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("schedule:");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("environment: production");
  });
});
