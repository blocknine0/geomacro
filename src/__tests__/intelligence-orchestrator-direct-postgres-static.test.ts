import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/intelligence-orchestrator.yml", "utf8");
const orchestrator = readFileSync("scripts/intelligence-orchestrator.mjs", "utf8");
const budget = readFileSync("scripts/ops/supabase-free-tier-budget.mjs", "utf8");
const loader = readFileSync("scripts/lib/direct-postgres-supabase-loader.mjs", "utf8");
const d1Shim = readFileSync("scripts/lib/d1-orchestrator-supabase-shim.mjs", "utf8");
const d1State = readFileSync("scripts/lib/d1-control-plane-state.mjs", "utf8");

describe("Intelligence orchestrator D1 control transport", () => {
  it("keeps scheduler state on D1 while Supabase data-plane probing remains optional", () => {
    expect(workflow).toContain("D1_DATABASE_NAME: geomacro-control-plane");
    expect(workflow).toContain("Resolve production D1 control-plane database");
    expect(workflow).toContain("Validate Supabase-independent scheduler runtime");
    expect(workflow).toContain("Probe optional Supabase data plane without blocking D1/B2 heartbeat");
    expect(workflow).toContain("GEOMACRO_SUPABASE_RESTRICTED_MODE=true");
    expect(workflow).toContain("restricted_direct_postgres_safe_tasks");
    expect(workflow).toContain("Run due intelligence tasks serially");
    expect(workflow.indexOf("Resolve production D1 control-plane database"))
      .toBeLessThan(workflow.indexOf("Run due intelligence tasks serially"));
  });

  it("routes only orchestrator scheduler-state createClient calls through the D1 compatibility shim", () => {
    expect(orchestrator).toContain('createClient(APP_SUPABASE_URL, APP_SUPABASE_SERVICE_ROLE_KEY');
    expect(orchestrator).toContain('.from("live_intelligence_scheduler_state")');
    expect(orchestrator).toContain('.like("source_id", `${STATE_PREFIX}%`)');

    expect(loader).toContain('const ORCHESTRATOR_SHIM_URL = "geomacro:d1-orchestrator-supabase"');
    expect(loader).toContain('const ORCHESTRATOR_SUFFIX = "/scripts/intelligence-orchestrator.mjs"');
    expect(loader).toContain('specifier === "@supabase/supabase-js" && orchestratorImport');
    expect(loader).toContain('d1-orchestrator-supabase-shim.mjs');

    expect(d1Shim).toContain('const TABLE = "live_intelligence_scheduler_state"');
    expect(d1Shim).toContain('createD1ControlPlaneStateClient');
    expect(d1Shim).toContain('return { data: [...rows.values()], error: null }');
    expect(d1Shim).toContain('await state.persist(scope, payload');

    expect(d1State).toContain('pipeline_checkpoint');
    expect(d1State).toContain('D1_CONTROL_STATE_QUERY_FAILED');
  });

  it("preserves direct-Postgres data compatibility and single-owner scheduler invariants", () => {
    expect(workflow).toContain('cron: "7,22,37,52 * * * *"');
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
