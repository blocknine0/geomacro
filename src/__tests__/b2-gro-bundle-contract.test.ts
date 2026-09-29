import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("B2 GRO bundle externalization", () => {
  it("keeps signature verification, one bundle readback and atomic cleanup", () => {
    const worker = read("scripts/ops/b2-archive-gro-bundle.ts");
    expect(worker).toContain("verifyRiskObjectSignature");
    expect(worker).toContain('kind: "gro-bundle"');
    expect(worker).toContain("GRO_BUNDLE_COMPRESSED_HASH_MISMATCH");
    expect(worker).toContain("GRO_BUNDLE_MEMBER_RESTORE_INVALID_");
    expect(worker).toContain('db.rpc("geomacro_clear_verified_gro_bundle_v1"');
    expect(worker).toContain("objects_per_b2_get");
  });

  it("retains individual archive compatibility and bundle pointers", () => {
    const worker = read("scripts/ops/b2-archive-gro-bundle.ts");
    const migration = read("supabase/migrations/20260929041500_gro_bundle_externalization.sql");
    expect(worker).toContain("geomacro-evidence/v1/gro/${entry.object_id}.json.gz");
    expect(migration).toContain("archive_key='risk-object-archive/v1/' || v_id || '.json.gz'");
    expect(migration).toContain("archive_bundle_key=p_bundle_key");
    expect(migration).toContain("archive_bundle_sha256=p_bundle_sha256");
    expect(migration).toContain("g.payload=v_payload");
    expect(migration).toContain("g.expires_at < now() - interval '6 hours'");
  });

  it("runs bounded bundles with low parallelism", () => {
    const workflow = read(".github/workflows/b2-only-gro-externalize-canary.yml");
    expect(workflow).toContain('GRO_BUNDLE_LIMIT: "1"');
    expect(workflow).toContain('GRO_BUNDLE_LIMIT: "50"');
    expect(workflow).toContain("max-parallel: 2");
    expect(workflow).toContain("Non-transient GRO archive failure detected; refusing to retry.");
  });
});
