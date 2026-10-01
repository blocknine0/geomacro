import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/ops/b2-country-ingest-offload.mjs", "utf8");
const workflow = readFileSync(".github/workflows/b2-historical-raw-drain.yml", "utf8");

describe("historical raw B2 drain", () => {
  it("is manual-only, production-scoped and request-budgeted", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("schedule:");
    expect(workflow).not.toContain("push:");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain('B2_REQUEST_BUDGET: "100"');
    expect(workflow).toContain('B2_INGEST_HISTORICAL_DRAIN: "1"');
    expect(workflow).toContain('B2_INGEST_RAW_BUNDLE_LIMIT: "50"');
    expect(workflow).toContain('B2_INGEST_RAW_ROUNDS: "20"');
    expect(workflow).toContain("persist-credentials: false");
  });

  it("keeps recent and historical candidate windows mutually exclusive", () => {
    expect(script).toContain('B2_INGEST_HISTORICAL_DRAIN ?? "0"');
    expect(script).toContain('? query.lt("fetched_at", cutoff)');
    expect(script).toContain(': query.gte("fetched_at", cutoff)');
    expect(script).toContain('.lte("fetched_at", settleBefore)');
  });

  it("preflights B2 read capability before any new bundle write", () => {
    const preflight = script.indexOf("const preflight = await b2.getOptional(preflightKey)");
    const put = script.indexOf("await b2.put(bundleKey, packed)");
    expect(preflight).toBeGreaterThanOrEqual(0);
    expect(put).toBeGreaterThan(preflight);
    expect(script).toContain("B2_RECENT_RAW_READ_PREFLIGHT_COLLISION");
  });

  it("keeps full readback before pointer update and Storage API deletion", () => {
    const get = script.indexOf("const readback = await b2.get(bundleKey)");
    const mark = script.indexOf('db.rpc("geomacro_mark_verified_raw_bundle"');
    const remove = script.indexOf("storage.remove(paths)");
    expect(get).toBeGreaterThanOrEqual(0);
    expect(mark).toBeGreaterThan(get);
    expect(remove).toBeGreaterThan(mark);
    expect(script).toContain('db.rpc("geomacro_raw_storage_paths_present"');
    expect(script).not.toContain("storage.objects");
  });
});
