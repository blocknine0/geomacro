import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("adaptive raw storage bundle v2 integration", () => {
  const codec = read("scripts/ops/raw-storage-bundle-codec.mjs");
  const maintenance = read("scripts/ops/b2-raw-storage-bundle-maintenance.mjs");
  const ingestOffload = read("scripts/ops/b2-country-ingest-offload.mjs");
  const reader = read("supabase/functions/raw-snapshot-read/index.ts");
  const orphan = read("scripts/ops/b2-raw-bundle-orphan-cleanup.mjs");

  it("keeps legacy v1 readable while allowing single-compression v2", () => {
    expect(codec).toContain('RAW_STORAGE_BUNDLE_V1 = "geomacro.raw-storage-bundle.v1"');
    expect(codec).toContain('RAW_STORAGE_BUNDLE_V2 = "geomacro.raw-storage-bundle.v2"');
    expect(reader).toContain('"geomacro.raw-storage-bundle.v1", "geomacro.raw-storage-bundle.v2"');
    expect(reader).toContain('bundle.storage_encoding !== "single-gzip-raw-members"');
    expect(reader).toContain("entry.source_compressed_sha256 !== row.archive_member_sha256");
    expect(reader).toContain("RAW_BUNDLE_MEMBER_HASH_MISMATCH");
  });

  it("selects v2 only when it is smaller than the v1 baseline", () => {
    expect(codec).toContain("const useV2 = v2Packed.length < v1Packed.length");
    expect(codec).toContain("bytes_saved_vs_v1");
    expect(codec).toContain("saving_ratio_vs_v1");
    for (const worker of [maintenance, ingestOffload]) {
      expect(worker).toContain("packAdaptiveRawStorageBundle");
      expect(worker).toContain("baseline_v1_bytes");
      expect(worker).toContain("candidate_v2_bytes");
      expect(worker).toContain("bytes_saved_vs_v1");
    }
  });

  it("preserves full B2 readback and exact payload verification before source deletion", () => {
    expect(maintenance.indexOf("verifyRawStorageBundle"))
      .toBeLessThan(maintenance.indexOf("storage.remove(paths)"));
    expect(ingestOffload.indexOf("verifyRawStorageBundle"))
      .toBeLessThan(ingestOffload.indexOf("storage.remove(paths)"));
    expect(orphan).toContain("verifyRawStorageBundle");
    expect(orphan).toContain("B2_RAW_ORPHAN_SOURCE_GZIP_HASH_MISMATCH_");
    expect(orphan).toContain("sourcePayload.equals(payload)");
    expect(orphan.indexOf("sourcePayload.equals(payload)"))
      .toBeLessThan(orphan.indexOf("storage.remove(paths)"));
  });

  it("keeps destructive cleanup on the Storage API and never SQL-deletes storage.objects", () => {
    for (const worker of [maintenance, ingestOffload, orphan]) {
      expect(worker).toContain("storage.remove(paths)");
      expect(worker).not.toMatch(/delete\s+from\s+storage\.objects/i);
    }
  });
});
