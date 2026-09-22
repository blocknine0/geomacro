import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("global realtime intelligence 100 gate contract", () => {
  it("contains all hard serial gates", () => {
    const script = readFileSync("scripts/audit-global-realtime-intelligence-100.mjs", "utf8");
    for (const marker of [
      "CANONICAL_195_COUNTRIES",
      "RAW_SOURCE_MATRIX_195x3",
      "RAW_RUNTIME_FRESH_195x3",
      "NON_GDELT_RUNTIME_INDEPENDENCE_195x3",
      "GDELT_FIRST_BREAK_FRESH",
      "CORRIDOR_AND_HOT_TOPIC_FANOUT",
      "DIRECT_OPERATIONAL_SOURCES_100_FRESH",
      "SOURCE_CERTIFICATION_10_DIMENSIONS",
      "REALTIME_ORCHESTRATOR_CONTINUITY",
    ]) expect(script).toContain(marker);
    expect(script).toContain("writes_performed: false");
    expect(script).toContain("process.argv.includes(\"--strict\")");
    expect(script).toContain("live_strategic_corridor_catalog");
    expect(script).toContain("live_global_shock_taxonomy");
  });

  it("is wired to the production Supabase project and schedule", () => {
    const workflow = readFileSync(".github/workflows/global-realtime-intelligence-100-gate.yml", "utf8");
    expect(workflow).toContain("EXPECTED_SUPABASE_PROJECT_REF: ldpwajisioljyjtojvfx");
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("github.event.pull_request.head.sha");
    expect(workflow).toContain("github.event.workflow_run.head_sha");
    expect(workflow).toContain("github.event.workflow_run.head_branch == 'main'");
    expect(workflow).toContain("schedule:");
    expect(workflow).toContain("bun run realtime:intelligence:100 -- --strict");
  });
});
