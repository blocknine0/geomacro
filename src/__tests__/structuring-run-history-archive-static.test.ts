import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/ops/b2-archive-structuring-run-history.mjs", "utf8");
const workflow = readFileSync(".github/workflows/one-time-b2-structuring-run-history-recovery.yml", "utf8");

describe("verified B2 structuring-run history recovery", () => {
  it("is fixed to production, old terminal history, and bounded batches", () => {
    expect(script).toContain('const PROJECT_URL = "https://ldpwajisioljyjtojvfx.supabase.co"');
    expect(script).toContain('new Set(["empty", "succeeded", "failed"])');
    expect(script).toContain("olderHours < 72");
    expect(script).toContain("limit > 500");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain('STRUCTURING_RUN_ARCHIVE_OLDER_HOURS: "72"');
    expect(workflow).toContain('STRUCTURING_RUN_ARCHIVE_LIMIT: "500"');
  });

  it("requires B2 restore verification before and after exact source deletion", () => {
    const firstRead = script.indexOf("const firstReadback = await b2.get(bundleKey)");
    const deletion = script.indexOf('.delete().in("id", chunkIds).select("*")');
    const secondRead = script.indexOf("const secondReadback = await b2.get(bundleKey)");
    expect(firstRead).toBeGreaterThanOrEqual(0);
    expect(deletion).toBeGreaterThan(firstRead);
    expect(secondRead).toBeGreaterThan(deletion);
    expect(script).toContain("exact_source_recheck_verified: true");
    expect(script).toContain("full_b2_readback_verified_after_delete: true");
  });

  it("rolls back deleted rows on every post-mutation failure", () => {
    expect(script).toContain("const deletedRows = []");
    expect(script).toContain("deletedRows.push(row)");
    expect(script).toContain("await restoreDeleted(deletedRows)");
    expect(script).toContain("STRUCTURING_RUN_ARCHIVE_ROLLBACK_FATAL");
  });

  it("never touches canonical intelligence or Supabase Storage metadata", () => {
    expect(script).toContain('.from("live_structuring_runs")');
    expect(script).not.toContain("live_external_observations");
    expect(script).not.toContain("live_structured_events");
    expect(script).not.toContain("geomacro_risk_objects");
    expect(script).not.toContain("storage.objects");
    expect(script).not.toContain("live_source_certification_queue");
  });
});
