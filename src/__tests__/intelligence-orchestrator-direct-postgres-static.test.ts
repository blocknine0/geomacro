import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/intelligence-orchestrator.yml", "utf8");
const orchestrator = readFileSync("scripts/intelligence-orchestrator.mjs", "utf8");
const budget = readFileSync("scripts/ops/supabase-free-tier-budget.mjs", "utf8");
const loader = readFileSync("scripts/lib/direct-postgres-supabase-loader.mjs", "utf8");

describe("Intelligence orchestrator direct-Postgres control transport", () => {
  it("runs recurring control-plane reads and writes without PostgREST egress", () => {
    expect(workflow).toContain("GRI_DB_MODE: direct_postgres");
    expect(workflow).toContain("SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}");
    expect(workflow).toContain("NODE_OPTIONS: --experimental-loader=./scripts/lib/direct-postgres-supabase-loader.mjs");
    expect(workflow).toContain("Require normal Supabase free-tier recurring-write budget");
    expect(workflow).toContain("Run due intelligence tasks serially");
    expect(workflow.indexOf("Require normal Supabase free-tier recurring-write budget"))
      .toBeLessThan(workflow.indexOf("Run due intelligence tasks serially"));
  });

  it("keeps the budget and scheduler on the same bounded compatibility path", () => {
    expect(budget).toContain('createClient(url, role');
    expect(orchestrator).toContain('createClient(APP_SUPABASE_URL, APP_SUPABASE_SERVICE_ROLE_KEY');
    expect(loader).toContain('specifier === "@supabase/supabase-js"');
    expect(loader).toContain("withPrefixLikeCompat(createGriDbClient())");
    expect(loader).toContain("DIRECT_POSTGRES_LIKE_SUPPORTS_PREFIX_ONLY");
    expect(loader).toContain('process.env.SUPABASE_URL ||= "https://direct-postgres.invalid"');
    expect(loader).toContain('process.env.SUPABASE_SERVICE_ROLE_KEY ||= "direct-postgres-no-rest"');
  });

  it("preserves the existing quota and single-owner scheduler invariants", () => {
    expect(workflow).toContain('cron: "7,22,37,52 * * * *"');
    expect(workflow).toContain("group: geomacro-intelligence-orchestrator");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("supabase-free-tier-budget.mjs --require-bulk-write --require-normal");
    expect(orchestrator).toContain('const STATE_PREFIX = "orchestrator:"');
    expect(orchestrator).toContain('.like("source_id", `${STATE_PREFIX}%`)');
    expect(orchestrator).toContain("MAX_TASKS_PER_TICK");
  });
});
