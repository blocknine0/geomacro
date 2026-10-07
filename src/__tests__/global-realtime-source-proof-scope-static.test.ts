import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/global-realtime-source-proof.yml", "utf8");

describe("Global Realtime Source Proof PR scoping", () => {
  it("always keeps the direct-Postgres corroboration transport proof", () => {
    expect(workflow).toContain("Verify canonical direct-Postgres RSS corroboration transport");
    expect(workflow).toContain("GRI_DB_MODE: direct_postgres");
    expect(workflow).toContain("run-live-flash-corroborate-local.ts");
    expect(workflow).toContain("threshold_weakening == false");
  });

  it("requires the 195x3 raw refresh only when broad raw-runtime surfaces changed", () => {
    expect(workflow).toContain("Scope broad raw-runtime acceptance to relevant changes");
    expect(workflow).toContain("id: acceptance_scope");
    expect(workflow).toContain("full_raw=true");
    expect(workflow).toContain("full_raw=false");
    expect(workflow).toContain("sync-country-raw-source-mesh");
    expect(workflow).toContain("supabase/functions/live-flash-ingest/*");
    expect(workflow).toContain("supabase/functions/live-flash-corroborate/*");
    for (const step of [
      "Refresh all three raw runtime categories",
      "Drain acceptance fragments in parallel",
      "Run realtime orchestrator continuity",
      "Final raw freshness convergence",
      "Run strict Global Realtime Intelligence 100 gate",
    ]) {
      const start = workflow.indexOf("- name: " + step);
      expect(start).toBeGreaterThan(-1);
      expect(workflow.slice(start, start + 220)).toContain(
        "if: steps.acceptance_scope.outputs.full_raw == 'true'",
      );
    }
  });

  it("records exact changed-file scope as evidence", () => {
    expect(workflow).toContain("exact-head-changed-files.txt");
    expect(workflow).toContain("fetch-depth: 0");
    expect(workflow).toContain('git diff --name-only "$base" "$head"');
    expect(workflow).toContain("while IFS= read -r file");
    expect(workflow).toContain('if [[ "$full_raw" == "true" ]]');
  });
});
