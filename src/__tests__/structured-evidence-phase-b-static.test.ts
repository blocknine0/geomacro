import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/ops/b2-delete-verified-structured-evidence-bundles.mjs", "utf8");
const workflow = readFileSync(".github/workflows/structured-evidence-verified-delete-phase-b.yml", "utf8");
const migration = readFileSync("supabase/migrations/20261001045500_structured_evidence_verified_delete_phase_b.sql", "utf8");

describe("structured evidence verified delete Phase B", () => {
  it("requires explicit manual owner acknowledgement and stays bounded", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("schedule:");
    expect(workflow).not.toContain("push:");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("I_ACCEPT_VERIFIED_EVIDENCE_COLD_DELETE");
    expect(workflow).toContain('B2_REQUEST_BUDGET: "30"');
    expect(workflow).toContain('STRUCTURED_EVIDENCE_PHASE_B_BATCH_LIMIT: "500"');
    expect(workflow).toContain('STRUCTURED_EVIDENCE_PHASE_B_ROUNDS: "10"');
    expect(workflow).toContain("persist-credentials: false");
  });

  it("verifies the archived B2 bundle before delete and again before finalize", () => {
    const firstGet = script.indexOf("const firstReadback = await b2.get(bundleKey)");
    const deleteCall = script.indexOf("await deleteExactEvidence(candidates)");
    const secondGet = script.indexOf("const secondReadback = await b2.get(bundleKey)");
    const finalizeRpc = script.indexOf('db.rpc("geomacro_finalize_verified_structured_evidence"');
    expect(firstGet).toBeGreaterThanOrEqual(0);
    expect(deleteCall).toBeGreaterThan(firstGet);
    expect(secondGet).toBeGreaterThan(deleteCall);
    expect(finalizeRpc).toBeGreaterThan(secondGet);
    expect(script).toContain("verifyArchiveBundle(firstReadback, candidates)");
    expect(script).toContain("verifyArchiveBundle(secondReadback, candidates)");
  });

  it("uses application-side exact-pair deletion and exact rollback", () => {
    expect(script).toContain('.delete().or(filter).select("event_id,fingerprint")');
    expect(script).toContain("await restoreEvidence(items)");
    expect(script).toContain("await removeOwnedBridges(insertedBridges)");
    expect(script).toContain("STRUCTURED_EVIDENCE_PHASE_B_ROLLBACK_RIGHTS_FAILED");
    expect(migration).not.toMatch(/delete\s+from\s+public\.live_structured_event_evidence/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.live_structured_event_archived_sources/i);
  });

  it("uses semantic canonical equality for JSONB rows while keeping B2 member hashes authoritative", () => {
    expect(script).toContain("function stableJson(value)");
    expect(script).toContain("const sameJson = (a, b) => stableJson(a) === stableJson(b)");
    expect(script).toContain("rowHash(member.row) !== item.row_sha256");
    expect(script).not.toContain("rowHash(item.row_json) !== item.row_sha256");
    expect(script).toContain("!sameJson(member.row, item.row_json)");
    expect(script).toContain("!sameJson(row, wanted.row_json)");
  });

  it("preserves rights before delete and compacts index only after verification", () => {
    expect(script).toContain("const beforeRights = await rightsSnapshot(candidates)");
    expect(script).toContain("STRUCTURED_EVIDENCE_PHASE_B_DELETE_RIGHTS_CHANGED");
    expect(migration).toContain("geomacro_finalize_verified_structured_evidence");
    expect(migration).toContain("'t', 'b2-evidence-bundle'");
    expect(migration).toContain("STRUCTURED_EVIDENCE_FINALIZE_SOURCE_STILL_PRESENT");
  });

  it("never touches Supabase Storage object deletion", () => {
    expect(script).not.toContain("storage.remove");
    expect(script).not.toContain("storage.objects");
    expect(migration).not.toContain("storage.objects");
  });

  it("keeps helper RPCs service-role only", () => {
    expect(migration).toContain("revoke all on function public.geomacro_count_structured_evidence_present(jsonb) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.geomacro_count_structured_evidence_present(jsonb) to service_role");
    expect(migration).toContain("grant execute on function public.geomacro_finalize_verified_structured_evidence(jsonb) to service_role");
    expect(migration).not.toContain("geomacro_delete_verified_structured_evidence");
    expect(migration).not.toContain("geomacro_restore_verified_structured_evidence");
  });
});
