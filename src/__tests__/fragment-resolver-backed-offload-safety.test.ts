import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync(
  "scripts/ops/b2-fragment-resolver-backed-offload.mjs",
  "utf8",
);
const workflow = readFileSync(
  ".github/workflows/fragment-b2-resolver-backed-offload.yml",
  "utf8",
);

describe("resolver-backed fragment offload safety", () => {
  it("defaults destructive offload off and requires an exact confirmation", () => {
    expect(script).toContain('B2_FRAGMENT_RESOLVER_DELETE ?? "0"');
    expect(script).toContain("DELETE_VERIFIED_SOURCE_USING_B2_RESOLVER");
    expect(script).toContain("B2_FRAGMENT_RESOLVER_DELETE_CONFIRMATION_REQUIRED");
    expect(script).toContain("B2_FRAGMENT_TARGET_ID");
  });

  it("verifies source bytes, B2 readback, resolver source route and prepared proof before Storage API removal", () => {
    const sourceHash = script.indexOf("await sourceBytes(manifest.sourcePath");
    const archiveReadback = script.indexOf("const readback = await b2.get(archiveKey)");
    const resolverCheck = script.lastIndexOf("await verifyResolver(manifest, archive, false)");
    const preparedProof = script.lastIndexOf("await putVerifiedProof(preparedKey");
    const storageDelete = script.indexOf("await storage.remove([manifest.sourcePath])");
    expect(sourceHash).toBeGreaterThan(-1);
    expect(archiveReadback).toBeGreaterThan(-1);
    expect(resolverCheck).toBeGreaterThan(-1);
    expect(preparedProof).toBeGreaterThan(resolverCheck);
    expect(storageDelete).toBeGreaterThan(preparedProof);
  });

  it("marks deletion only after source absence and then verifies the resolver points at B2", () => {
    const absence = script.indexOf("await waitForStorageAbsence(manifest.sourcePath)");
    const mark = script.indexOf('db.rpc("geomacro_mark_live_fragment_source_deleted"');
    const finalResolver = script.indexOf("await verifyResolver(manifest, { ...archive");
    expect(absence).toBeGreaterThan(-1);
    expect(mark).toBeGreaterThan(-1);
    expect(finalResolver).toBeGreaterThan(mark);
    expect(script).toContain('deletion_mode: "resolver_backed_cold_offload"');
  });

  it("never deletes storage.objects with SQL", () => {
    expect(script).not.toContain('from("storage.objects")');
    expect(script).not.toMatch(/delete\s+from\s+storage\.objects/i);
  });

  it("keeps the permanent destructive workflow manual, production-scoped and confirmed", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("DELETE_VERIFIED_SOURCE_USING_B2_RESOLVER");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).not.toMatch(/^\s*schedule:/m);
  });
});
