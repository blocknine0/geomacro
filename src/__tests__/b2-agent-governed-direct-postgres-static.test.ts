import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/b2-agent-governed-modules-snapshot.yml", "utf8");
const adapter = readFileSync("scripts/ops/direct-postgres-supabase-lite.ts", "utf8");
const runner = readFileSync("scripts/ops/run-b2-governed-direct-postgres.mjs", "utf8");
const verifier = readFileSync("scripts/ops/verify-b2-agent-governed-runtime.ts", "utf8");

describe("B2 governed module permanent refresh path", () => {
  it("uses bounded direct Postgres instead of Supabase REST for maintenance", () => {
    expect(workflow).toContain("SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}");
    expect(workflow).not.toContain("APP_SUPABASE_SERVICE_ROLE_KEY");
    expect(workflow).toContain("run-b2-governed-direct-postgres.mjs");
    expect(workflow).not.toContain("run-b2-snapshot-maintenance-with-preservation.mjs governed-modules");
    expect(adapter).toContain('execFileSync("psql"');
    expect(adapter).toContain("DIRECT_POSTGRES_DB_TARGET_INVALID");
    expect(adapter).toContain("ALLOWED_TABLES");
    expect(runner).toContain("createDirectPostgresClient");
    expect(runner).toContain("B2_AGENT_MODULE_DIRECT_PATCH");
  });

  it("fails unless the production runtime reader accepts a freshly published v2 snapshot", () => {
    expect(workflow).toContain("verify-b2-agent-governed-runtime.ts");
    expect(verifier).toContain("readB2AgentGovernedModulesSnapshot");
    expect(verifier).toContain("B2_AGENT_MODULE_RUNTIME_READER_REJECTED_SNAPSHOT");
    for (const required of [
      '["BRA", "macro_monetary"]',
      '["BRA", "external_fx"]',
      '["USA", "macro_monetary"]',
      '["USA", "external_fx"]',
      '["ZAF", "critical_minerals"]',
      '["CHN", "critical_minerals"]',
    ]) expect(verifier).toContain(required);
    expect(verifier).toContain("supabase_serving_dependency: false");
  });
});
