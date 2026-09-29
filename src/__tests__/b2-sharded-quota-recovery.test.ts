import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const observationWorker = read("scripts/ops/b2-archive-observation-bundle.mjs");
const observationWorkflow = read(".github/workflows/b2-observation-payload-maintenance.yml");
const rawWorkflow = read(".github/workflows/b2-raw-storage-maintenance.yml");
const groWorker = read("scripts/ops/b2-only-gro-externalize-canary.ts");
const groWorkflow = read(".github/workflows/b2-only-gro-externalize-canary.yml");
const groBundleWorkflow = read(".github/workflows/b2-gro-bundle-first-batch.yml");
const candidateRpcs = read("scripts/ops/sql/b2-recovery-candidate-rpcs.sql");

const suffixMatrix = 'suffix: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f"]';

describe("sharded B2 quota recovery", () => {
  it("partitions observation candidates and serializes verified recovery on the free tier", () => {
    expect(observationWorker).toContain("OBS_ARCHIVE_SUFFIX");
    expect(observationWorker).toContain("geomacro_next_observation_archive_candidates");
    expect(observationWorker).toContain('b2_full_gets: 1');
    expect(observationWorker).toContain("one-full-bundle-readback-before-atomic-cleanup");
    expect(candidateRpcs).toContain("live_external_observations_b2_archive_shard_idx");
    expect(candidateRpcs).toContain("right(lower(o.observation_id), 1) = p_suffix");
    expect(observationWorkflow).toContain(suffixMatrix);
    expect(observationWorkflow).toContain("max-parallel: 1");
    expect(observationWorkflow).toContain('OBS_BUNDLE_LIMIT: "100"');
    expect(observationWorkflow).toContain('OBS_BUNDLE_ROUNDS: "4"');
    expect(observationWorkflow).toContain("cancel-in-progress: true");
    expect(observationWorkflow).toContain("Persistent free-tier statement timeout after verified observation progress");
  });

  it("serializes raw Storage pruning and preserves canary-first cleanup", () => {
    expect(rawWorkflow).toContain(suffixMatrix);
    expect(rawWorkflow).toContain("max-parallel: 1");
    expect(rawWorkflow).toContain('B2_RAW_BUNDLE_LIMIT: "100"');
    expect(rawWorkflow).toContain('B2_RAW_BUNDLE_ROUNDS: "4"');
    expect(rawWorkflow).toContain("needs: b2_canary");
    expect(rawWorkflow).toContain("cancel-in-progress: true");
    expect(rawWorkflow).toContain("Persistent free-tier statement timeout after verified raw progress");
  });

  it("partitions GRO candidates with serialized free-tier pressure", () => {
    expect(groWorker).toContain("GRO_ARCHIVE_SUFFIX");
    expect(groWorker).toContain("geomacro_next_gro_archive_candidates");
    expect(candidateRpcs).toContain("geomacro_risk_objects_b2_archive_shard_idx");
    expect(candidateRpcs).toContain("right(lower(g.object_id), 1) = p_suffix");
    expect(groWorkflow).toContain(suffixMatrix);
    expect(groBundleWorkflow).toContain(suffixMatrix);
    expect(groBundleWorkflow).toContain("max-parallel: 1");
    expect(groBundleWorkflow).toContain('GRO_BUNDLE_LIMIT: "25"');
    expect(groBundleWorkflow).toContain("Persistent free-tier statement timeout after verified progress");
  });

  it("preserves fail-closed verification before observation cleanup", () => {
    expect(observationWorker).toContain("OBS_BUNDLE_COMPRESSED_HASH_MISMATCH");
    expect(observationWorker).toContain("OBS_BUNDLE_MEMBER_RESTORE_INVALID_");
    expect(observationWorker.indexOf("const readback = await archiveRead"))
      .toBeLessThan(observationWorker.indexOf("geomacro_clear_verified_observation_bundle"));
    expect(groWorker).toContain("B2_ONLY_GRO_READBACK_INVALID");
  });
});
