import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { verifyPrivateScoringD1Checkpoint } from "../../scripts/lib/private-scoring-d1-checkpoint-proof.mjs";

const sha = "a".repeat(64);
const key = `geomacro-evidence/v1/private/restricted-current-scoring/${sha}.json.gz`;
const stamp = "2026-10-09T09:19:00.000Z";
const counts = { geopolitics: 1, macro: 2, rare_earth: 0 };
const cursor = {
  status: "verified_private_staging",
  b2_key: key,
  sha256: sha,
  classifier_version: "event-severity-v1.0.5",
  counts,
  publication_authorized: false,
};
function evidence(overrides: Record<string, unknown> = {}) {
  return {
    source_id: "orchestrator:private_stage",
    payload: {
      source: "geomacro_intelligence_orchestrator",
      task: "private_stage",
      cursor,
    },
    last_success_at: stamp,
    ...overrides,
  };
}
const expected = { b2Key: key, compressedSha256: sha, counts, lastSuccessAt: stamp };
describe("#1827 D1 independent compact private checkpoint verification", () => {
  it("accepts only identical readback after verified B2 full GET/gzip restore", () => {
    expect(verifyPrivateScoringD1Checkpoint(evidence(), expected)).toBe(true);
  });
  it("rejects missing rows, wrong pipeline or source, changed archive hash and publication authorization", () => {
    expect(() => verifyPrivateScoringD1Checkpoint(null, expected)).toThrow("READBACK_CONTRACT_INVALID");
    for (const sample of [
      evidence({ source_id: "orchestrator:public" }),
      evidence({ last_success_at: "2026-10-08T09:19:00.000Z" }),
      evidence({ payload: { ...evidence().payload, task: "public" } }),
      evidence({ payload: { ...evidence().payload, cursor: { ...cursor, publication_authorized: true } } }),
      evidence({ payload: { ...evidence().payload, cursor: { ...cursor, sha256: "b".repeat(64) } } }),
    ]) expect(() => verifyPrivateScoringD1Checkpoint(sample, expected))
      .toThrow("READBACK_CONTRACT_INVALID");
  });
  it("fails closed on per-domain count tampering or unexpected fourth category", () => {
    for (const altered of [
      { geopolitics: 0, macro: 2, rare_earth: 0 },
      { geopolitics: 1, macro: 3, rare_earth: 0 },
      { geopolitics: 1, macro: 2, rare_earth: 0, fake: 1 },
    ]) {
      expect(() => verifyPrivateScoringD1Checkpoint(evidence({
        payload: { ...evidence().payload, cursor: { ...cursor, counts: altered } },
      }), expected)).toThrow(/READBACK_COUNTS/);
    }
  });
  it("requires real primary D1 readback not just upsert acknowledgement; does not relax payment", () => {
    const script = readFileSync("scripts/ops/archive-restricted-private-scored-stage.mjs", "utf8");
    const d1 = readFileSync("scripts/lib/d1-control-plane-state.mjs", "utf8");
    expect(script).toContain('const checkpoint = (await control.loadRows()).get("private_stage");');
    expect(script).toContain("verifyPrivateScoringD1Checkpoint(checkpoint");
    expect(script).toContain("d1_checkpoint_readback_verified: true");
    expect(d1).toContain("SELECT scope,status,last_attempt_at,last_success_at,cursor,metadata_json,updated_at");
    expect(script).toContain("b2Receipt.full_body_readback_verified !== true");
    expect(script).toContain("public_published: false");
    expect(script).toContain("commercial_eligible: false");
    expect(script).toContain("supabase_writes: 0");
  });
});
