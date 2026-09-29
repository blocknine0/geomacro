import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Supabase free-tier B2-first storage contract", () => {
  const contract = read("scripts/ops/sql/geomacro-free-tier-budget-and-b2-raw-candidates.sql");
  const rawWorker = read("scripts/ops/b2-raw-storage-bundle-maintenance.mjs");
  const rawRestore = read("supabase/functions/raw-snapshot-read/index.ts");
  const workflow = read(".github/workflows/b2-raw-storage-maintenance.yml");
  const observationWorkflow = read(".github/workflows/b2-observation-payload-maintenance.yml");
  const observationWorker = read("scripts/ops/b2-archive-observation-bundle.mjs");
  const groLegacyWorkflow = read(".github/workflows/b2-only-gro-externalize-canary.yml");
  const groLegacyWorker = read("scripts/ops/b2-only-gro-externalize-canary.ts");
  const groBundleWorkflow = read(".github/workflows/b2-gro-bundle-first-batch.yml");
  const groBundleWorker = read("scripts/ops/b2-archive-gro-bundle.ts");
  const groRestore = read("supabase/functions/gro-archive-read/index.ts");
  const productionCoverageWorkflow = read(".github/workflows/global-production-coverage-gate.yml");
  const orchestratorWorkflow = read(".github/workflows/intelligence-orchestrator.yml");
  const autoIngestWorkflow = read(".github/workflows/auto-ingest-news.yml");
  const budget = read("scripts/ops/supabase-free-tier-budget.mjs");

  it("freezes bulk Supabase writes before the hard free-tier ceiling", () => {
    expect(contract).toContain("'target_bytes', 367001600");
    expect(contract).toContain("'warn_bytes', 419430400");
    expect(contract).toContain("'freeze_bytes', 471859200");
    expect(contract).toContain("'bulk_write_allowed'");
    expect(budget).toContain("compact_operational_control_plane");
    expect(budget).toContain("raw_archive_historical_large_payloads");
    expect(budget).toContain('process.env.GITHUB_WORKFLOW === "Auto Ingest News"');
    expect(budget).toContain("SUPABASE_FREE_TIER_BULK_WRITE_FROZEN");
    expect(autoIngestWorkflow).toContain('name: Auto Ingest News');
    expect(autoIngestWorkflow).toContain("supabase-free-tier-budget.mjs");
  });

  it("keeps raw cleanup on the Storage API and never SQL-deletes storage.objects", () => {
    expect(rawWorker).toContain("storage.remove(paths)");
    expect(rawWorker).toContain("geomacro_raw_storage_paths_present");
    expect(rawWorker).not.toMatch(/delete\s+from\s+storage\.objects/i);
    expect(contract).not.toMatch(/delete\s+from\s+storage\.objects/i);
  });

  it("uses one full B2 readback to verify raw Storage members before deletion", () => {
    expect(rawWorker).toContain("B2_RAW_BUNDLE_READBACK_HASH_INVALID");
    expect(rawWorker).toContain("B2_RAW_BUNDLE_MEMBER_RESTORE_INVALID_");
    expect(rawWorker).toContain("geomacro_mark_verified_raw_bundle");
    expect(rawWorker).toContain("b2_full_gets: 1");
    expect(rawWorker).toContain("raw_objects_per_b2_get");
    expect(rawWorker.indexOf("const readback = await archiveRead"))
      .toBeLessThan(rawWorker.indexOf("storage.remove(paths)"));
    expect(rawWorker.indexOf("geomacro_mark_verified_raw_bundle"))
      .toBeLessThan(rawWorker.indexOf("storage.remove(paths)"));
  });

  it("restores bundled raw snapshots from a DB pointer with one bundle GET", () => {
    expect(rawRestore).toContain("archive_bundle_key");
    expect(rawRestore).toContain("geomacro.raw-storage-bundle.v1");
    expect(rawRestore).toContain("RAW_BUNDLE_MEMBER_HASH_MISMATCH");
  });

  it("keeps heavy payload maintenance manual and bounded during quota recovery", () => {
    expect(observationWorkflow).toContain("workflow_dispatch:");
    expect(observationWorkflow).not.toContain("schedule:");
    expect(observationWorkflow).toContain('OBS_BUNDLE_LIMIT: "100"');
    expect(observationWorkflow).toContain('OBS_BUNDLE_ROUNDS: "4"');
    expect(observationWorkflow).toContain("cancel-in-progress: true");
    expect(observationWorkflow).toContain("Persistent free-tier statement timeout after verified observation progress");

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("schedule:");
    expect(workflow).toContain('B2_RAW_BUNDLE_LIMIT: "100"');
    expect(workflow).toContain('B2_RAW_BUNDLE_ROUNDS: "4"');
    expect(workflow).toContain("cancel-in-progress: true");
    expect(workflow).toContain("Persistent free-tier statement timeout after verified raw progress");

    expect(groBundleWorkflow).toContain("workflow_dispatch:");
    expect(groBundleWorkflow).not.toContain("schedule:");
    expect(groBundleWorkflow).toContain('GRO_BUNDLE_LIMIT: "25"');
    expect(groBundleWorkflow).toContain('GRO_BUNDLE_ROUNDS: "4"');
  });

  it("keeps all destructive fanouts canary-gated and serialized against free-tier DB pressure", () => {
    expect(workflow).toContain("max-parallel: 1");
    expect(workflow).toContain("fail-fast: false");
    expect(workflow).toContain("b2_canary:");
    expect(workflow).toContain("needs: b2_canary");
    expect(workflow).toContain("needs.b2_canary.result == 'success'");
    expect(workflow).toContain('B2_RAW_BUNDLE_LIMIT: "1"');

    expect(observationWorkflow).toContain("max-parallel: 1");
    expect(observationWorkflow).toContain("fail-fast: false");
    expect(observationWorkflow).toContain("b2_canary:");
    expect(observationWorkflow).toContain("needs: b2_canary");
    expect(observationWorkflow).toContain("needs.b2_canary.result == 'success'");
    expect(observationWorkflow).toContain('OBS_BUNDLE_LIMIT: "1"');

    expect(groBundleWorkflow).toContain("max-parallel: 1");
    expect(groBundleWorkflow).toContain("fail-fast: false");
  });

  it("preserves observation and GRO fail-closed verification before cleanup", () => {
    expect(observationWorker).toContain("OBS_BUNDLE_COMPRESSED_HASH_MISMATCH");
    expect(observationWorker).toContain("OBS_BUNDLE_MEMBER_RESTORE_INVALID_");
    expect(observationWorker).toContain("b2_full_gets: 1");

    expect(groLegacyWorker).toContain("B2_ONLY_GRO_READBACK_INVALID");
    expect(groBundleWorker).toContain("GRO_BUNDLE_COMPRESSED_HASH_MISMATCH");
    expect(groBundleWorker).toContain("GRO_BUNDLE_MEMBER_RESTORE_INVALID_");
    expect(groBundleWorker).toContain("bundle_native_restore: true");
    expect(groRestore).toContain("archive_bundle_key");
    expect(groRestore).toContain("GRO_BUNDLE_MEMBER_HASH_INVALID");
  });

  it("never auto-triggers heavy production coverage or intelligence refresh while frozen", () => {
    expect(productionCoverageWorkflow).toContain("workflow_dispatch:");
    expect(productionCoverageWorkflow).not.toContain("branches: [main]");
    expect(productionCoverageWorkflow).toContain("supabase-free-tier-budget.mjs --require-bulk-write");
    expect(orchestratorWorkflow).toContain("workflow_dispatch:");
    expect(orchestratorWorkflow).not.toContain("schedule:");
    expect(orchestratorWorkflow).toContain("supabase-free-tier-budget.mjs --require-bulk-write");
    expect(autoIngestWorkflow).toContain('cron: "0 */2 * * *"');
    expect(budget).toContain('process.env.GITHUB_WORKFLOW === "Auto Ingest News"');
  });
});
