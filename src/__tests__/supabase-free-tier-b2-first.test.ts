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
  const groWorkflow = read(".github/workflows/b2-only-gro-externalize-canary.yml");
  const groWorker = read("scripts/ops/b2-only-gro-externalize-canary.ts");
  const productionCoverageWorkflow = read(".github/workflows/global-production-coverage-gate.yml");
  const orchestratorWorkflow = read(".github/workflows/intelligence-orchestrator.yml");
  const budget = read("scripts/ops/supabase-free-tier-budget.mjs");

  it("freezes bulk Supabase writes before the hard free-tier ceiling", () => {
    expect(contract).toContain("'target_bytes', 367001600");
    expect(contract).toContain("'warn_bytes', 419430400");
    expect(contract).toContain("'freeze_bytes', 471859200");
    expect(contract).toContain("'bulk_write_allowed'");
    expect(budget).toContain("compact_operational_control_plane");
    expect(budget).toContain("raw_archive_historical_large_payloads");
  });

  it("keeps raw cleanup on the Storage API and never SQL-deletes storage.objects", () => {
    expect(rawWorker).toContain("storage.remove(paths)");
    expect(rawWorker).toContain("geomacro_raw_storage_paths_present");
    expect(rawWorker).not.toMatch(/delete\s+from\s+storage\.objects/i);
    expect(contract).not.toMatch(/delete\s+from\s+storage\.objects/i);
  });

  it("uses one full B2 readback to verify up to 100 raw Storage members before deletion", () => {
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
    expect(rawRestore).toContain("archiveKey = `geomacro-evidence/v1/${row.object_path}`");
  });

  it("runs observation and raw bundle recovery hourly while GRO remains manually held", () => {
    expect(observationWorkflow).toContain('cron: "17 * * * *"');
    expect(observationWorkflow).toContain('OBS_BUNDLE_LIMIT: "25"');
    expect(workflow).toContain('cron: "37 * * * *"');
    expect(workflow).toContain('B2_RAW_BUNDLE_LIMIT: "25"');
    expect(workflow).toContain("never SQL-delete storage.objects");
    expect(groWorkflow).toContain("workflow_dispatch");
    expect(groWorkflow).not.toContain("schedule:");
  });

  it("keeps both bundle fanouts bounded and sharded", () => {
    for (const source of [workflow, observationWorkflow]) {
      expect(source).toContain("max-parallel: 1");
      expect(source).not.toContain("  push:");
      expect(source).toContain("fail-fast: false");
      expect(source).toContain("b2_canary:");
      expect(source).toContain("needs: b2_canary");
      expect(source).toContain("needs.b2_canary.result == 'success'");
    }
    expect(workflow).toContain("B2_RAW_MAINTENANCE_SUFFIX");
    expect(contract).toContain("geomacro_next_raw_storage_candidates_shard");
    expect(contract).toContain("live_raw_source_snapshots_b2_archive_shard_idx");
    expect(workflow).toContain('B2_RAW_BUNDLE_LIMIT: "1"');
    expect(observationWorkflow).toContain('OBS_BUNDLE_LIMIT: "1"');
  });

  it("uses one full B2 GET to verify and atomically clear an observation bundle", () => {
    expect(observationWorker).toContain("geomacro_clear_verified_observation_bundle_v2");
    expect(observationWorker).toContain("OBS_BUNDLE_COMPRESSED_HASH_MISMATCH");
    expect(observationWorker).toContain("OBS_BUNDLE_MEMBER_RESTORE_INVALID_");
    expect(observationWorker).toContain("b2_full_gets: 1");
  });

  it("retains GRO restore verification before payload cleanup", () => {
    expect(groWorkflow).toContain("max-parallel: 2");
    expect(groWorker).toContain("B2_ONLY_GRO_READBACK_INVALID");
    expect(groWorker).toContain("b2_gets_per_object: 1");
    expect(groWorker.indexOf("const readback = await archiveRead"))
      .toBeLessThan(groWorker.indexOf(".update({ payload: null"));
  });

  it("never auto-triggers the heavy production coverage refresh and requires free-tier headroom", () => {
    expect(productionCoverageWorkflow).toContain("workflow_dispatch:");
    expect(productionCoverageWorkflow).not.toContain("branches: [main]");
    expect(productionCoverageWorkflow).not.toContain('supabase/migrations/**');
    expect(productionCoverageWorkflow).toContain("supabase-free-tier-budget.mjs --require-bulk-write");
  });

  it("keeps the manual intelligence orchestrator fail-closed while Supabase is frozen", () => {
    expect(orchestratorWorkflow).toContain("workflow_dispatch:");
    expect(orchestratorWorkflow).not.toContain("schedule:");
    expect(orchestratorWorkflow).toContain("supabase-free-tier-budget.mjs --require-bulk-write");
  });
});
