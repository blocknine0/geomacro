import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("B2 country ingest offload retention window", () => {
  it("covers the complete recent window up to the 72h old-drain boundary", () => {
    const script = read("scripts/ops/b2-country-ingest-offload.mjs");
    const workflow = read(".github/workflows/b2-country-ingest-offload.yml");
    expect(script).toContain("Math.min(72");
    expect(script).toContain("B2_INGEST_LOOKBACK_HOURS ?? 72");
    expect(workflow).toContain('B2_INGEST_LOOKBACK_HOURS: "72"');
    expect(workflow).not.toContain('B2_INGEST_LOOKBACK_HOURS: "6"');
  });

  it("keeps verified readback before pointer update and source deletion", () => {
    const script = read("scripts/ops/b2-country-ingest-offload.mjs");
    expect(script.indexOf("const readback = await b2.get(bundleKey)"))
      .toBeLessThan(script.indexOf('db.rpc("geomacro_mark_verified_raw_bundle"'));
    expect(script.indexOf('db.rpc("geomacro_mark_verified_raw_bundle"'))
      .toBeLessThan(script.indexOf("storage.remove(paths)"));
  });
});
