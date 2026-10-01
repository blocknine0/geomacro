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
    const deleteRpc = script.indexOf('db.rpc("geomacro_delete_verified_structured_evidence"');
    const secondGet = script.indexOf("const secondReadback = await b2.get(bundleKey)");
    const finalizeRpc = script.indexOf('db.rpc("geomacro_finalize_verified_structured_evidence"');
    expect(firstGet).toBeGreaterThanOrEqual(0);
    expect(deleteRpc).toBeGreaterThan(firstGet);
    expect(secondGet).toBeGreaterThan(deleteRpc);
    expect(finalizeRpc).toBeGreaterThan(secondGet);
    expect(script).toContain("verifyArchiveBundle(firstReadback, candidates)");
    expect(script).toContain("verifyArchiveBundle(secondReadback, candidates)");
  });

  it("retains an exact rollback path until finalization", () => {
    expect(script).toContain('db.rpc("geomacro_restore_verified_structured_evidence"');
    expect(script).toContain("await rollback(rpcItems, insertedBridges)");
    expect(migration).toContain("to_jsonb(e) = a.row_json");
    expect(migration).toContain("STRUCTURED_EVIDENCE_DELETE_RIGHTS_CHANGED");
    expect(migration).toContain("STRUCTURED_EVIDENCE_RESTORE_RIGHTS_CHANGED");
  });

  it("preserves source identity and compacts index payload only after verified deletion", () => {
    expect(migration).toContain("live_structured_event_archived_sources");
    expect(migration).toContain("geomacro_finalize_verified_structured_evidence");
    expect(migration).toContain("'t', 'b2-evidence-bundle'");
    expect(migration).toContain("STRUCTURED_EVIDENCE_FINALIZE_SOURCE_STILL_PRESENT");
  });

  it("never touches Supabase Storage deletion paths", () => {
    expect(script).not.toContain("storage.remove");
    expect(script).not.toContain("storage.objects");
    expect(migration).not.toContain("storage.objects");
  });

  it("keeps all Phase B RPCs service-role only", () => {
    expect(migration).toContain("revoke all on function public.geomacro_delete_verified_structured_evidence(jsonb) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.geomacro_delete_verified_structured_evidence(jsonb) to service_role");
    expect(migration).toContain("grant execute on function public.geomacro_restore_verified_structured_evidence(jsonb, jsonb) to service_role");
    expect(migration).toContain("grant execute on function public.geomacro_finalize_verified_structured_evidence(jsonb) to service_role");
  });
});
