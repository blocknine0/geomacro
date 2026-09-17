import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const workflowPath = ".github/workflows/auto-ingest-news.yml";
const helperPath = "scripts/invoke-live-structure-with-retry.mjs";

const workflow = fs.readFileSync(workflowPath, "utf8");
const helper = fs.readFileSync(helperPath, "utf8");

describe("Auto Ingest News reliability contract", () => {
  it("keeps ingestion fail-closed while using a bounded structured-intelligence handoff", () => {
    expect(workflow).toContain('timeout-minutes: 45');
    expect(workflow).toContain("id: structure");
    expect(workflow).toContain("node scripts/invoke-live-structure-with-retry.mjs");
    expect(workflow).toContain('LIVE_STRUCTURE_MAX_ATTEMPTS: "4"');
    expect(workflow).toContain('LIVE_STRUCTURE_ATTEMPT_TIMEOUT_MS: "90000"');
    expect(workflow).not.toContain("--retry-all-errors");
  });

  it("runs safe private diagnostics only when the structure handoff fails", () => {
    expect(workflow).toContain("always() && steps.structure.outcome == 'failure'");
    expect(workflow).toContain("node scripts/diagnose-live-structure-runtime.mjs");
    expect(workflow).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("retries only bounded transient HTTP/network failures and validates ok=true", () => {
    expect(helper).toContain("new Set([408, 425, 429, 500, 502, 503, 504])");
    expect(helper).toContain("maxAttempts > 6");
    expect(helper).toContain("payload?.ok === true");
    expect(helper).toContain("Failure is non-transient; refusing to retry.");
    expect(helper).toContain("AbortController");
    expect(helper).not.toContain("LIVE_STRUCTURE_TOKEN}`");

    const result = spawnSync(process.execPath, ["--check", helperPath], {
      encoding: "utf8",
    });
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });
});
