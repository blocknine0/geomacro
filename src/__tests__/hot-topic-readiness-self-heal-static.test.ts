import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/hot-topic-family-readiness.yml",
  "utf8",
);

describe("hot-topic readiness GDELT freshness self-heal", () => {
  it("serializes live readiness with the canonical intelligence orchestrator", () => {
    expect(workflow).toContain("group: geomacro-intelligence-orchestrator");
    expect(workflow).toContain("cancel-in-progress: false");
  });

  it("checks the authoritative project and the canonical GDELT cursor", () => {
    expect(workflow).toContain('!== "ldpwajisioljyjtojvfx"');
    expect(workflow).toContain('.eq("source_key", "gdelt_gal")');
    expect(workflow).toContain('.eq("stream_key", "global-relevant")');
    expect(workflow).toContain("ageSeconds <= 1200");
    expect(workflow).toContain('String(data?.status ?? "") === "healthy"');
    expect(workflow).toContain("Number(data?.consecutive_failures ?? 0) === 0");
  });

  it("uses the exact governed fresh-cycle implementation only when repair is required", () => {
    expect(workflow).toContain("node scripts/run-gdelt-gal-cycle.mjs");
    expect(workflow).toContain("LIVE_STRUCTURE_TOKEN");
    expect(workflow).toContain(
      "PASS: GDELT GAL FRESH CYCLE COMPLETE; CURSOR, FRAGMENT, STRUCTURE, RIGHTS AND HOT-TOPIC HEALTH VERIFIED",
    );
  });

  it("still requires a read-only healthy readiness proof after any repair", () => {
    expect(workflow).toContain(
      "bun scripts/audit-hot-topic-family-readiness.ts --require-pipeline-healthy --require-taxonomy-complete",
    );
    expect(workflow).toContain("jq -e '.writes_performed == false'");
    expect(workflow).toContain("jq -e '.source_pipeline.healthy == true'");
  });
});
