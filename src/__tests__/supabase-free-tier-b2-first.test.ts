import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Supabase free-tier B2-first storage contract", () => {
  const contract = read("scripts/ops/sql/geomacro-free-tier-budget-and-b2-raw-candidates.sql");
  const worker = read("scripts/ops/b2-raw-storage-maintenance.mjs");
  const workflow = read(".github/workflows/b2-raw-storage-maintenance.yml");
  const observationWorkflow = read(".github/workflows/b2-observation-payload-maintenance.yml");
  const observationWorker = read("scripts/ops/b2-archive-observation-payload-batch.mjs");
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

  it("keeps storage cleanup on the Storage API and never SQL-deletes storage.objects", () => {
    expect(worker).toContain('storage.remove([path])');
    expect(worker).toContain("geomacro_raw_storage_paths_present");
    expect(worker).not.toMatch(/delete\s+from\s+storage\.objects/i);
    expect(contract).not.toMatch(/delete\s+from\s+storage\.objects/i);
  });

  it("requires a full B2 archive readback and restore before raw Storage cleanup", () => {
    expect(worker).toContain("B2_RAW_ARCHIVE_READBACK_INVALID");
    expect(worker).toContain("geomacro.archive-proof.v1");
    expect(worker).toContain("geomacro.archive-source-deletion.v1");
    expect(worker).toContain("b2_gets_per_object: 1");
    expect(worker.indexOf("const readback = await archiveRead"))
      .toBeLessThan(worker.indexOf("storage.remove([path])"));
    expect(worker).toContain("supabase_source_absent: true");
  });

  it("holds automatic B2 reads while the provider download budget is exhausted", () => {
    for (const source of [workflow, observationWorkflow, groWorkflow]) {
      expect(source).toContain("workflow_dispatch");
      expect(source).not.toContain("schedule:");
      expect(source).not.toContain("branches: [main]");
      expect(source).toContain("never bypass readback");
    }
  });

  it("retains bounded sharded raw maintenance for manual verified recovery", () => {
    expect(workflow).toContain('B2_RAW_MAINTENANCE_LIMIT: "2"');
    expect(workflow).toContain("B2_RAW_MAINTENANCE_SUFFIX");
    expect(workflow).toContain("max-parallel: 2");
    expect(contract).toContain("geomacro_next_raw_storage_candidates_shard");
    expect(contract).toContain("live_raw_source_snapshots_b2_archive_shard_idx");
    expect(workflow).toContain("B2_APPLICATION_KEY");
    expect(workflow).toContain("environment: production");
  });

  it("retains verified observation externalization with one B2 GET per cleanup", () => {
    expect(observationWorkflow).toContain('OBS_ARCHIVE_LIMIT: "2"');
    expect(observationWorkflow).toContain("max-parallel: 2");
    expect(observationWorker).toContain(".update({ raw_payload: null })");
    expect(observationWorker).toContain("OBS_ARCHIVE_READBACK_INVALID");
    expect(observationWorker).toContain("b2_gets_per_object: 1");
    expect(observationWorker).toContain("source_row_retained: true");
  });

  it("retains GRO restore verification before payload cleanup", () => {
    expect(groWorkflow).toContain("max-parallel: 2");
    expect(groWorker).toContain("B2_ONLY_GRO_READBACK_INVALID");
    expect(groWorker).toContain("b2_gets_per_object: 1");
    expect(groWorker.indexOf("const readback = await archiveRead"))
      .toBeLessThan(groWorker.indexOf(".update({ payload: null"));
  });

  it("gates every sharded B2 fanout behind a single verified canary", () => {
    for (const source of [workflow, observationWorkflow, groWorkflow]) {
      expect(source).toContain("b2_canary:");
      expect(source).toContain("needs: b2_canary");
      expect(source).toContain("needs.b2_canary.result == 'success'");
    }
    expect(workflow).toContain('B2_RAW_MAINTENANCE_LIMIT: "1"');
    expect(observationWorkflow).toContain('OBS_ARCHIVE_LIMIT: "1"');
    expect(groWorkflow).toContain('GRO_ARCHIVE_SUFFIX: "0"');
  });

  it("never auto-triggers the heavy production coverage refresh and requires free-tier headroom", () => {
    expect(productionCoverageWorkflow).toContain("workflow_dispatch:");
    expect(productionCoverageWorkflow).not.toContain("branches: [main]");
    expect(productionCoverageWorkflow).not.toContain('supabase/migrations/**');
    expect(productionCoverageWorkflow).toContain("supabase-free-tier-budget.mjs --require-bulk-write");
    expect(productionCoverageWorkflow.indexOf("supabase-free-tier-budget.mjs --require-bulk-write"))
      .toBeLessThan(productionCoverageWorkflow.indexOf("ingest-world-bank-live.mjs"));
  });

  it("keeps the manual intelligence orchestrator fail-closed while Supabase is frozen", () => {
    expect(orchestratorWorkflow).toContain("workflow_dispatch:");
    expect(orchestratorWorkflow).not.toContain("schedule:");
    expect(orchestratorWorkflow).toContain("supabase-free-tier-budget.mjs --require-bulk-write");
    expect(orchestratorWorkflow.indexOf("supabase-free-tier-budget.mjs --require-bulk-write"))
      .toBeLessThan(orchestratorWorkflow.indexOf("Run due intelligence tasks serially"));
  });
});
