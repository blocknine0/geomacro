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
    expect(workflow).toContain('const safe = ["phase_a_heartbeat", "production_readiness"]');
    expect(workflow).toContain('["gdelt_gal", "gdelt_v2", "current_scoring", "rss_live", "country_raw_mesh", "open_realtime_mesh", "realtime_fanout", "news_ingest"]');
  });

  it("runs 195x3 raw refresh only for raw-pipeline changes", () => {
    expect(workflow).toContain("Scope broad raw-runtime acceptance to raw-pipeline changes");
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
