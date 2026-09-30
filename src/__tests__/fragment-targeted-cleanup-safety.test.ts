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

  it("requires completeness and verified archive/source bytes before Storage API deletion", () => {
    const eligibilityGate = script.indexOf("if (!eligible) throw new Error");
    const sourceVerification = script.indexOf("await sourceBytes(manifest.sourcePath");
    const preparedProof = script.indexOf("await putVerifiedProof(preparedKey");
    const storageDelete = script.indexOf("await storage.remove([manifest.sourcePath])");
    expect(sourceVerification).toBeGreaterThan(-1);
    expect(eligibilityGate).toBeGreaterThan(sourceVerification);
    expect(preparedProof).toBeGreaterThan(eligibilityGate);
    expect(storageDelete).toBeGreaterThan(preparedProof);
  });

  it("records and verifies a final B2 deletion proof and never deletes storage.objects with SQL", () => {
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
