import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/deploy-country-flash-supabase.yml", "utf8");
const localRunner = readFileSync("scripts/run-live-flash-corroborate-local.ts", "utf8");

describe("Supabase Edge standby deployment contract", () => {
  it("classifies external egress restriction without claiming Edge health", () => {
    expect(workflow).toContain("exceed_egress_quota");
    expect(workflow).toContain("FLASH_EDGE_RUNTIME_AVAILABLE=false");
    expect(workflow).toContain("FLASH_EDGE_RUNTIME_DEFERRED_REASON=supabase_egress_quota");
    expect(workflow).toContain("Supabase Edge standby");
  });

  it("requires canonical direct-Postgres corroboration when Edge is unavailable", () => {
    expect(workflow).toContain("run-live-flash-corroborate-local.ts --health");
    expect(workflow).toContain("GRI_DB_MODE: direct_postgres");
    expect(workflow).toContain('.health == true');
    expect(workflow).toContain('.authenticated == true');
    expect(workflow).toContain('.candidate_query == "PASS"');
    expect(workflow).toContain('execution_mode == "local_canonical_corroboration_direct_postgres"');
    expect(workflow).toContain(".threshold_weakening == false");
    expect(localRunner).toContain('process.argv.includes("--health")');
    expect(localRunner).toContain('live-flash-corroborate?mode=health');
    expect(localRunner).toContain("LOCAL_CORROBORATE_HEALTH_MODE_EXCLUSIVE");
    expect(localRunner).not.toContain("error.stack");
  });

  it("still fails unexpected Edge responses closed", () => {
    expect(workflow).toContain("Expected authenticated validation response from live-flash-ingest.");
    expect(workflow).toContain("live-flash-corroborate did not return a successful response.");
    expect(workflow).not.toContain("payment_performed=true");
  });
});
