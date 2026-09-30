import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runtime = readFileSync(
  "supabase/functions/live-structure-intelligence/index.ts",
  "utf8",
);
const resolverMigration = readFileSync(
  "supabase/migrations/20260930114500_resolved_live_fragment_locations.sql",
  "utf8",
);

describe("fragment B2 runtime resolver", () => {
  it("selects effective fragment locations instead of immutable source locations", () => {
    const resolverReads = runtime.match(/resolved_live_fragment_locations/g) ?? [];
    expect(resolverReads.length).toBeGreaterThanOrEqual(2);
    expect(runtime).toContain("object_path:resolved_object_path");
    expect(runtime).toContain("storage_bucket:resolved_storage_bucket");
  });

  it("routes source-deleted fragments to the verified private archive", () => {
    expect(resolverMigration).toContain("when a.source_deleted_at is not null then a.archive_bucket");
    expect(resolverMigration).toContain("when a.source_deleted_at is not null then a.archive_object_path");
    expect(runtime).toContain('manifest.storage_bucket === "geomacro-private-archive"');
    expect(runtime).toContain("downloadVerifiedB2Fragment(manifest.object_path, manifest.compressed_sha256)");
  });

  it("accepts only the supported live and legacy fragment archive namespaces", () => {
    expect(runtime).toContain("(?:live|fragments)\\/v1");
    expect(runtime).toContain("B2_FRAGMENT_POINTER_INVALID");
    expect(runtime).toContain("B2_FRAGMENT_HASH_MISMATCH");
  });
});
