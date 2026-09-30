import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const script = readFileSync(join(root, "scripts/ops/b2-fragment-targeted-cleanup.mjs"), "utf8");
const workflow = readFileSync(join(root, ".github/workflows/fragment-b2-targeted-cleanup.yml"), "utf8");

describe("targeted fragment cleanup safety", () => {
  it("defaults destructive cleanup off and binds work to an exact fragment id", () => {
    expect(script).toContain('B2_FRAGMENT_TARGET_DELETE ?? "0"');
    expect(script).toContain("B2_FRAGMENT_TARGET_ID");
    expect(script).toContain('.eq("id", fragmentId)');
  });

  it("requires completeness and verified source bytes before a normal Storage API deletion", () => {
    const eligibilityGate = script.indexOf("if (!eligible) throw new Error");
    const normalPathMarker = script.indexOf("Normal destructive path");
    const sourceVerification = script.indexOf("await sourceBytes(manifest.sourcePath", normalPathMarker);
    const preparedProof = script.indexOf("await putVerifiedProof(preparedKey", normalPathMarker);
    const storageDelete = script.indexOf("await storage.remove([manifest.sourcePath])", normalPathMarker);
    expect(eligibilityGate).toBeGreaterThan(-1);
    expect(sourceVerification).toBeGreaterThan(eligibilityGate);
    expect(preparedProof).toBeGreaterThan(sourceVerification);
    expect(storageDelete).toBeGreaterThan(preparedProof);
  });

  it("verifies deletion absence through the Storage object-info API rather than a potentially stale object download", () => {
    expect(script).toContain("/storage/v1/object/info/");
    expect(script).toContain("await waitForStorageAbsence(manifest.sourcePath)");
    const deleteIndex = script.indexOf("await storage.remove([manifest.sourcePath])");
    const absenceIndex = script.indexOf("await waitForStorageAbsence(manifest.sourcePath)");
    expect(absenceIndex).toBeGreaterThan(deleteIndex);
  });

  it("only reconciles an already-absent source when the exact prepared B2 proof still matches current verified state", () => {
    const absentBranch = script.indexOf("if (!sourceState.exists)");
    const preparedRead = script.indexOf("await readPreparedProof(preparedKey", absentBranch);
    const finalize = script.indexOf("await finalizeDeletion(manifest, archive, handled, preparedKey, true)", absentBranch);
    expect(preparedRead).toBeGreaterThan(absentBranch);
    expect(finalize).toBeGreaterThan(preparedRead);
    expect(script).toContain("B2_FRAGMENT_TARGET_PREPARED_PROOF_MISMATCH");
  });

  it("records and readback-verifies a final B2 deletion proof and never deletes storage.objects with SQL", () => {
    expect(script).toContain("live-fragments-deleted/${fragmentId}.json");
    expect(script).toContain("await putVerifiedProof(deletionProofKey");
    expect(script).toContain('db.rpc("geomacro_mark_live_fragment_source_deleted"');
    expect(script).not.toContain('from("storage.objects")');
    expect(script).not.toMatch(/delete\s+from\s+storage\.objects/i);
  });

  it("keeps the destructive workflow manual and explicitly confirmed", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("DELETE_VERIFIED_FRAGMENT_SOURCE");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).not.toMatch(/^\s*schedule:/m);
  });
});
