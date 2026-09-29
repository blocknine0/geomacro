import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("scripts/ops/b2-country-ingest-offload.mjs", "utf8");

describe("B2 post-ingest fragment immutability", () => {
  it("never mutates or deletes live_fragment_manifest rows", () => {
    expect(source).not.toContain('.from("live_fragment_manifest")\n      .update(');
    expect(source).not.toContain('.from("live_fragment_manifest")\n      .delete(');
    expect(source).toContain("retained_in_supabase_until_immutable_archive_resolver_exists");
  });

  it("still keeps raw B2 verification before source removal", () => {
    expect(source.indexOf("const readback = await b2.get(bundleKey)"))
      .toBeLessThan(source.indexOf('db.rpc("geomacro_mark_verified_raw_bundle"'));
    expect(source.indexOf('db.rpc("geomacro_mark_verified_raw_bundle"'))
      .toBeLessThan(source.indexOf("storage.remove(paths)"));
  });
});
