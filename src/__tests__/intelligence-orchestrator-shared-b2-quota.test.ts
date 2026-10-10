import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("#1827 intelligence orchestrator shared Backblaze account safety", () => {
  const job = readFileSync(".github/workflows/intelligence-orchestrator.yml","utf8");
  const runtime = readFileSync("scripts/ops/b2-s3-client.mjs","utf8");
  const adapter = readFileSync("scripts/ops/b2-d1-account-governor.mjs","utf8");

  it("requires D1 daily ticket on B2 network requests with a fixed workflow identity",()=>{
    expect(job).toContain('B2_ACCOUNT_QUOTA_REQUIRED: "1"');
    expect(job).toContain("B2_ACCOUNT_QUOTA_WORKFLOW_ID: intelligence_orchestrator");
    expect(runtime).toContain('process.env.B2_ACCOUNT_QUOTA_REQUIRED === "1"');
    expect(runtime).toContain('globalAccountGovernor.reserve(method)');
    expect(runtime).toContain('globalAccountGovernor.reserve("GET")');
    expect(runtime).toContain('globalAccountGovernor.reserve("NATIVE_AUTH")');
    expect(adapter).toContain('reserveB2AccountQuota');
    expect(adapter).toContain('B2_GLOBAL_DAILY_QUOTA_EXHAUSTED');
  });

  it("must resolve main-owned D1 and validate before scheduled tasks, no fail-open fallback",()=>{
    const resolved=job.indexOf("- name: Resolve production D1 control-plane database");
    const checked=job.indexOf("- name: Validate Supabase-independent scheduler runtime");
    const actual=job.indexOf("- name: Run due intelligence tasks serially");
    expect(resolved).toBeGreaterThan(0);
    expect(checked).toBeGreaterThan(resolved);
    expect(actual).toBeGreaterThan(checked);
    expect(job).toContain('echo "D1_DATABASE_ID=$DB_ID" >> "$GITHUB_ENV"');
    expect(job).toContain('test "${B2_ACCOUNT_QUOTA_REQUIRED:-}" = "1"');
    expect(job).toContain("node --check scripts/ops/b2-d1-account-governor.mjs");
  });

  it("preserves restricted source-only work, signed/private source boundary and unchanged cron",()=>{
    expect(job).toContain('cron: "47 0,3,6,9,12,15,18,21 * * *"');
    expect(job).toContain('GEOMACRO_SUPABASE_RESTRICTED_MODE=true');
    expect(job).toContain('TELEGRAM_ENABLED: "false"');
    expect(job).toContain("supabase-free-tier-budget.mjs --require-bulk-write --require-normal");
    expect(job).not.toContain("B2_ACCOUNT_QUOTA_REQUIRED: \"0\"");
    expect(job).not.toContain("execution_authorized=true");
  });
});
