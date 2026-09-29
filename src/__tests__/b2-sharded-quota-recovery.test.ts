import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const observationWorker = read("scripts/ops/b2-archive-observation-bundle.mjs");
const observationWorkflow = read(".github/workflows/b2-observation-payload-maintenance.yml");
const groWorker = read("scripts/ops/b2-only-gro-externalize-canary.ts");
const groWorkflow = read(".github/workflows/b2-only-gro-externalize-canary.yml");
const candidateRpcs = read("scripts/ops/sql/b2-recovery-candidate-rpcs.sql");

const suffixMatrix = 'suffix: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f"]';

describe("sharded B2 quota recovery", () => {
  it("partitions observation candidates and verifies up to 100 members with one full B2 GET", () => {
    expect(observationWorker).toContain("OBS_ARCHIVE_SUFFIX");
    expect(observationWorker).toContain("/^[0-9a-f]$/");
    expect(observationWorker).toContain("geomacro_next_observation_archive_candidates");
    expect(observationWorker).toContain("p_suffix: suffix");
    expect(observationWorker).toContain("p_limit: limit");
    expect(observationWorker).toContain("geomacro_clear_verified_observation_bundle");
    expect(observationWorker).toContain('b2_full_gets: 1');
    expect(observationWorker).toContain("one-full-bundle-readback-before-atomic-cleanup");
    expect(candidateRpcs).toContain("live_external_observations_b2_archive_shard_idx");
    expect(candidateRpcs).toContain("right(lower(o.observation_id), 1) = p_suffix");
    expect(candidateRpcs).toContain("p_limit > 100");
    expect(candidateRpcs).toContain("geomacro_clear_verified_observation_bundle");
    expect(candidateRpcs).toContain("o.raw_payload = v_payload");
    expect(candidateRpcs).toContain("to service_role");
    expect(observationWorkflow).toContain(suffixMatrix);
    expect(observationWorkflow).toContain("max-parallel: 2");
    expect(observationWorkflow).toContain('OBS_BUNDLE_LIMIT: "100"');
    expect(observationWorkflow).toContain("fail-fast: false");
  });

  it("partitions GRO candidates by the same non-overlapping suffix rule with bounded B2 pressure", () => {
    expect(groWorker).toContain("GRO_ARCHIVE_SUFFIX");
    expect(groWorker).toContain("/^[0-9a-f]$/");
    expect(groWorker).toContain("geomacro_next_gro_archive_candidates");
    expect(groWorker).toContain("p_suffix: suffix");
    expect(groWorker).toContain("p_signing_key_id: activeSigningKeyId");
    expect(groWorker).toContain("endsWith(suffix)");
    expect(groWorker).toContain("b2_gets_per_object: 1");
    expect(candidateRpcs).toContain("geomacro_risk_objects_b2_archive_shard_idx");
    expect(candidateRpcs).toContain("right(lower(g.object_id), 1) = p_suffix");
    expect(candidateRpcs).toContain("p_limit > 100");
    expect(candidateRpcs).toContain("to service_role");
    expect(groWorkflow).toContain(suffixMatrix);
    expect(groWorkflow).toContain("max-parallel: 2");
    expect(groWorkflow).toContain("fail-fast: false");
  });

  it("preserves fail-closed verification before any observation cleanup", () => {
    expect(observationWorker).toContain("OBS_BUNDLE_COMPRESSED_HASH_MISMATCH");
    expect(observationWorker).toContain("OBS_BUNDLE_MEMBER_RESTORE_INVALID_");
    expect(observationWorker.indexOf("const readback = await archiveRead"))
      .toBeLessThan(observationWorker.indexOf("geomacro_clear_verified_observation_bundle"));
    expect(groWorker).toContain("B2_ONLY_GRO_READBACK_INVALID");
    expect(groWorker).toContain("B2_ONLY_GRO_ROLLBACK_FAILED");
  });
});
