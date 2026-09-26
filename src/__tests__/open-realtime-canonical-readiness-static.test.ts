import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const drain = readFileSync("scripts/drain-live-structure.mjs", "utf8");
const workflow = readFileSync(
  ".github/workflows/global-production-coverage-gate.yml",
  "utf8",
);

describe("reviewed open realtime evidence canonical readiness path", () => {
  it("drains fragment ids emitted by the open realtime mesh", () => {
    expect(drain).toContain("Array.isArray(raw?.sources)");
    expect(drain).toContain("source?.fragment_id");
    expect(drain).toContain("fragmentIdsFromFilePayload(raw)");
  });

  it("refreshes and structures reviewed open sources before sovereign CANONICAL objects", () => {
    const openRealtime = workflow.indexOf(
      "- name: Refresh reviewed open realtime evidence before sovereign CANONICAL refresh",
    );
    const canonical = workflow.indexOf(
      "- name: Refresh every enabled sovereign CANONICAL Risk Object",
    );

    expect(openRealtime).toBeGreaterThan(-1);
    expect(canonical).toBeGreaterThan(-1);
    expect(openRealtime).toBeLessThan(canonical);
    expect(workflow).toContain("bun scripts/sync-open-live-source-mesh.mjs");
    expect(workflow).toContain("node scripts/drain-live-structure.mjs --fragment-ids-file");
    expect(workflow).toContain("node scripts/reconcile-structured-event-commercial-rights.mjs");
  });

  it("admits only reviewed USGS and GDACS policy states into this readiness refresh", () => {
    expect(workflow).toContain('["usgs_earthquakes", "COMMERCIAL_OK"]');
    expect(workflow).toContain('["gdacs_global_disasters", "DERIVED_ONLY"]');
    expect(workflow).toContain("OPEN_REALTIME_SOURCE_POLICY_NOT_READY");
    expect(workflow).toContain("usgs_earthquakes,gdacs_global_disasters");
    expect(workflow).toContain('select(.source_key == "nasa_firms_fire" or .source_key == "reliefweb_reports")');
    expect(workflow).toContain('all(. == "skipped")');
  });

  it("preserves fail-closed commercial and payment boundaries", () => {
    expect(workflow).toContain('GLOBAL_CANONICAL_MIN_READY: "100"');
    expect(workflow).toContain('GLOBAL_CANONICAL_MIN_SOVEREIGN_DENOMINATOR: "190"');
    expect(workflow).toContain(".boundaries.payment_not_performed_by_refresh == true");
    expect(workflow).toContain(".boundaries.raw_source_material_emitted == false");
    expect(workflow).toContain(".boundaries.execution_authorized == false");
  });
});
