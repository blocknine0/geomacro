import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/global-realtime-source-proof.yml", "utf8");

describe("Global Realtime Source Proof change scoping", () => {
  it("always proves direct-Postgres transport and restricted scheduler policy", () => {
    expect(workflow).toContain("Verify canonical direct-Postgres RSS corroboration transport");
    expect(workflow).toContain("Verify restricted-mode scheduler contract");
    expect(workflow).toContain("GEOMACRO_SUPABASE_RESTRICTED_MODE=true");
    expect(workflow).toContain("D1_ONLY_FREEZE_STILL_PRESENT");
    expect(workflow).toContain("SAFE_TASK_NOT_CLASSIFIED");
    expect(workflow).toContain("UNSAFE_TASK_CLASSIFIED");
    expect(workflow).toContain('const safe = ["phase_a_heartbeat", "gdelt_gal"]');
    expect(workflow).toContain('["production_readiness", "gdelt_v2", "current_scoring", "rss_live", "country_raw_mesh", "open_realtime_mesh", "realtime_fanout", "news_ingest"]');
    expect(workflow).toContain("GDELT_GAL_RESTRICTED_BOUNDARY_MISSING");
    expect(workflow).toContain('"scripts/run-gdelt-gal-cycle.mjs"');
    expect(workflow).toContain('workflow.includes("GRI_DB_MODE: direct_postgres")');
    expect(workflow).toContain('workflow.includes("B2_GDELT_PRIMARY: \\"1\\\"")');
  });

  it("runs the bounded source heartbeat on exact head without enabling raw writers", () => {
    expect(workflow).toContain("Run bounded source heartbeat on exact PR head");
    expect(workflow).toContain("RUN_BOUNDED_SOURCE_HEARTBEAT=true");
    expect(workflow).toContain("PHASE_A_HEARTBEAT_ONLY=1");
    expect(workflow).toContain('phase-a-bounded-heartbeat.json');
    expect(workflow).toContain('.b2_requests == 0');
    expect(workflow).toContain('.raw_observations_written == 0');
    expect(workflow).toContain('.unbounded_rows_written == 0');
  });

  it("runs 195x3 raw refresh only for raw-pipeline changes", () => {
    expect(workflow).toContain("Scope exact-head acceptance");
    expect(workflow).toContain("FULL_RAW_ACCEPTANCE=true");
    expect(workflow).toContain("FULL_RAW_ACCEPTANCE=false");
    expect(workflow).not.toContain('scripts/intelligence-orchestrator.mjs|scripts/run-rss-live-cycle.mjs');
    for (const step of [
      "Refresh all three raw runtime categories",
      "Drain acceptance fragments in parallel",
      "Final raw freshness convergence",
      "Run strict Global Realtime Intelligence 100 gate",
    ]) {
      const index = workflow.indexOf("- name: " + step);
      expect(index).toBeGreaterThan(-1);
      expect(workflow.slice(index, index + 180)).toContain("if: env.FULL_RAW_ACCEPTANCE == 'true'");
    }
  });

  it("records exact changed-file scope as evidence", () => {
    expect(workflow).toContain("fetch-depth: 0");
    expect(workflow).toContain('git diff --name-only "$base" "$head"');
    expect(workflow).toContain("exact-head-changed-files.txt");
  });
});
