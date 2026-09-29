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
    const reader = read("supabase/functions/gro-archive-read/index.ts");
    const migration = read("supabase/migrations/20260929041500_gro_bundle_externalization.sql");
    expect(worker).toContain("geomacro-evidence/v1/gro/${entry.object_id}.json.gz");
    expect(migration).toContain("archive_key='risk-object-archive/v1/' || v_id || '.json.gz'");
    expect(migration).toContain("archive_bundle_key=p_bundle_key");
    expect(migration).toContain("archive_bundle_sha256=p_bundle_sha256");
    expect(migration).toContain("g.payload=v_payload");
    expect(migration).toContain("g.expires_at < now() - interval '6 hours'");
    expect(worker).toContain("archive_gzip_b64: memberGzip.toString");
    expect(reader).toContain("member.archive_gzip_b64");
    expect(reader).toContain("member.archive_sha256 !== row.archive_sha256");
    expect(reader).toContain("GRO_BUNDLE_MEMBER_HASH_INVALID");
  });

  it("reads bulk bundles directly from B2 while the one-object canary tests the Edge bridge", () => {
    for (const [path, flag] of [
      ["scripts/ops/b2-archive-gro-bundle.ts", "GRO_BUNDLE_LIMIT"],
      ["scripts/ops/b2-archive-observation-bundle.mjs", "OBS_BUNDLE_LIMIT"],
      ["scripts/ops/b2-raw-storage-bundle-maintenance.mjs", "B2_RAW_BUNDLE_LIMIT"],
    ]) {
      const worker = read(path);
      expect(worker).toContain(flag);
      expect(worker).toContain("if (limit > 1)");
      expect(worker).toMatch(/const bytes = await b2\.get\(/);
      expect(worker).toContain("/functions/v1/archive-verify-read");
      expect(worker.indexOf("const readback = await archiveRead"))
        .toBeLessThan(worker.indexOf("BUNDLE_COMPRESSED_HASH_MISMATCH") > 0
          ? worker.indexOf("BUNDLE_COMPRESSED_HASH_MISMATCH")
          : worker.indexOf("B2_RAW_BUNDLE_READBACK_HASH_INVALID"));
    }
  });

  it("runs bounded bundles with low parallelism", () => {
    const workflow = read(".github/workflows/b2-only-gro-externalize-canary.yml");
    expect(workflow).toContain('GRO_BUNDLE_LIMIT: "1"');
    expect(workflow).toContain('GRO_BUNDLE_LIMIT: "50"');
    expect(workflow).toContain("max-parallel: 2");
    expect(workflow).toContain("Non-transient GRO archive failure detected; refusing to retry.");
  });
});
