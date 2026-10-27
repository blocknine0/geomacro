import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const workflow = readFileSync(".github/workflows/b2-structural-serving-snapshot.yml", "utf8");
const publisher = readFileSync("scripts/ops/publish-b2-structural-serving-snapshot.ts", "utf8");

describe("historical structural B2 snapshot central bundled budget", () => {
  it("requires preflight D1 budget and atomic B2 quota for all requests", () => {
    expect(workflow).toContain('B2_ACCOUNT_QUOTA_REQUIRED: "1"');
    expect(workflow).toContain('B2_REQUEST_BUDGET: "12"');
    expect(workflow).toContain("B2_ACCOUNT_QUOTA_WORKFLOW_ID: structural_snapshot");
    expect(workflow).toContain("plan-d1-bundled-work.mjs");
    expect(workflow).toContain("steps.budget.outputs.structural_snapshot == 'true'");
    expect(workflow).toContain('D1_DATABASE_NAME: geomacro-control-plane');
    expect(workflow).toContain('echo "D1_DATABASE_ID=$DB_ID"');
    expect(workflow).toContain("environment: production");
  });

  it("never truncates historical coverage to deliver a falsely complete snapshot", () => {
    expect(publisher).toContain("MAX_TOTAL_DB_READS = 96");
    expect(publisher).toContain("MAX_TOTAL_SOURCE_ROWS = 18_000");
    expect(publisher).toContain("B2_STRUCTURAL_HISTORICAL_DB_QUERY_CAP");
    expect(publisher).toContain("B2_STRUCTURAL_TRUNCATION_GUARD_source_rows");
    expect(publisher).toContain('url.origin !== HISTORICAL_URL');
    expect(publisher).toContain('redirect: "error"');
    expect(publisher).toContain("B2_STRUCTURAL_STAGING_READBACK_HASH_INVALID");
    expect(publisher).toContain("B2_STRUCTURAL_PROOF_READBACK_INVALID");
    expect(publisher).not.toContain("ldpwajisioljyjtojvfx.supabase.co");
  });
});
