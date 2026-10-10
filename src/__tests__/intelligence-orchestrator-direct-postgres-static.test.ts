import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/intelligence-orchestrator.yml", "utf8");
const orchestrator = readFileSync("scripts/intelligence-orchestrator.mjs", "utf8");
const budget = readFileSync("scripts/ops/supabase-free-tier-budget.mjs", "utf8");
const loader = readFileSync("scripts/lib/direct-postgres-supabase-loader.mjs", "utf8");
const d1State = readFileSync("scripts/lib/d1-control-plane-state.mjs", "utf8");

describe("Intelligence orchestrator D1 control transport", () => {
  it("keeps scheduler state on D1 while Supabase data-plane probing remains optional", () => {
    expect(workflow).toContain("D1_DATABASE_NAME: geomacro-control-plane");
    expect(workflow).toContain("Resolve production D1 control-plane database");
    expect(workflow).toContain("Validate Supabase-independent scheduler runtime");
    expect(workflow).toContain("Probe optional Supabase data plane without blocking D1/B2 heartbeat");
    expect(workflow).toContain("GEOMACRO_SUPABASE_RESTRICTED_MODE=true");
    expect(workflow).toContain("fixed_cardinality_source_heartbeat_allowed");
    expect(workflow).toContain("Run due intelligence tasks serially");
    expect(orchestrator).toContain('key: "phase_a_heartbeat"');
    expect(orchestrator).toContain("PHASE_A_HEARTBEAT_ONLY=1");
    expect(orchestrator).toMatch(/key:\s*"gdelt_gal"[\s\S]{0,380}restrictedDirectPostgresSafe:\s*false/);
    expect(orchestrator).toMatch(/key:\s*"phase_a_heartbeat"[\s\S]{0,380}restrictedDirectPostgresSafe:\s*false/);
    expect(orchestrator).toContain("restrictedDirectPostgresSafe: true");
    for (const unsafe of ["production_readiness", "gdelt_v2", "current_scoring", "rss_live"]) {
      const marker = 'key: "' + unsafe + '",\n    restrictedDirectPostgresSafe: true';
      expect(orchestrator).not.toContain(marker);
    }
    expect(workflow.indexOf("Resolve production D1 control-plane database"))
      .toBeLessThan(workflow.indexOf("Run due intelligence tasks serially"));
  });

  it("uses canonical D1 pipeline_checkpoint natively without any Supabase SDK, fake service-role or loader shim", () => {
    expect(orchestrator).toContain('import { createD1ControlPlaneStateClient } from "./lib/d1-control-plane-state.mjs";');
    expect(orchestrator).toContain("const d1State = createD1ControlPlaneStateClient()");
    expect(orchestrator).toContain("await d1State.loadRows()");
    expect(orchestrator).toContain("await d1State.persist(task.key, payload");
    expect(orchestrator).not.toContain('from("@supabase/supabase-js")');
    expect(orchestrator).not.toContain('from "@supabase/supabase-js"');
    expect(orchestrator).not.toContain("createClient(APP_SUPABASE_URL");
    expect(orchestrator).not.toContain("APP_SUPABASE_SERVICE_ROLE_KEY");
    expect(orchestrator).not.toContain("AUTHORITATIVE_SUPABASE_CREDENTIALS_REQUIRED");
    expect(orchestrator).not.toContain(".from(\"live_intelligence_scheduler_state\")");
    expect(loader).not.toContain("ORCHESTRATOR_SHIM_URL");
    expect(loader).not.toContain("ORCHESTRATOR_SUFFIX");
    expect(loader).not.toContain("d1-orchestrator-supabase-shim.mjs");
    expect(workflow).not.toContain("node --check scripts/lib/d1-orchestrator-supabase-shim.mjs");
    expect(d1State).toContain("pipeline_checkpoint");
    expect(d1State).toContain("D1_CONTROL_STATE_QUERY_FAILED");
    expect(d1State).toContain("D1_DATABASE_ID");
  });

  it("preserves direct-Postgres data compatibility and single-owner scheduler invariants", () => {
    expect(workflow).toContain('cron: "47 0,3,6,9,12,15,18,21 * * *"');
    expect(workflow).toContain("group: geomacro-intelligence-orchestrator");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("supabase-free-tier-budget.mjs --require-bulk-write --require-normal");
    expect(workflow).toContain("NODE_OPTIONS: --experimental-loader=./scripts/lib/direct-postgres-supabase-loader.mjs");
    expect(workflow).toContain("GRI_DB_MODE: direct_postgres");

    expect(budget).toContain('createClient(url, role');
    expect(loader).toContain('specifier === "@supabase/supabase-js"');
    expect(loader).toContain("withPrefixLikeCompat(createGriDbClient())");
    expect(loader).toContain("DIRECT_POSTGRES_LIKE_SUPPORTS_PREFIX_ONLY");
    expect(loader).toContain('process.env.SUPABASE_URL ||= "https://direct-postgres.invalid"');
    expect(loader).toContain('process.env.SUPABASE_SERVICE_ROLE_KEY ||= "direct-postgres-no-rest"');
    expect(orchestrator).toContain('const STATE_PREFIX = "orchestrator:"');
    expect(orchestrator).toContain("MAX_TASKS_PER_TICK");
  });
});
