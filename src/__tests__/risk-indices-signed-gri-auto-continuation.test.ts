import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("P0 no-funds signed GRI -> Risk Indices operational continuation", () => {
  const workflow=readFileSync(".github/workflows/risk-indices-verified-d1-parent.yml","utf8");
  const gri=readFileSync(".github/workflows/gri-v12-supabase-free-reviewed-current.yml","utf8");

  it("wakes only from exact reviewed GRI production success, not ordinary source activity",()=>{
    expect(gri).toContain("name: GRI v1.2 Supabase-Free Current Promotion");
    expect(gri).toContain("publish-supabase-free-global-risk.mjs --verified-current");
    expect(workflow).toContain('workflows: ["GRI v1.2 Supabase-Free Current Promotion"]');
    expect(workflow).toContain("types: [completed]");
    const publish=workflow.split("\n  publish:\n")[1];
    expect(publish).toBeTruthy();
    for(const boundary of [
      "needs: source-contract-tests",
      "github.repository == 'blocknine0/geomacro'",
      "github.ref == 'refs/heads/main'",
      "github.event_name == 'workflow_dispatch'",
      "github.event_name == 'workflow_run'",
      "github.event.workflow_run.conclusion == 'success'",
      "github.event.workflow_run.event == 'workflow_dispatch'",
      "github.event.workflow_run.event == 'repository_dispatch'",
      "github.event.workflow_run.head_branch == 'main'",
      "github.event.workflow_run.head_repository.full_name == 'blocknine0/geomacro'",
      "github.event.workflow_run.head_sha != ''",
      "environment: production",
    ]) expect(publish).toContain(boundary);
  });

  it("requires current canonical source, verified parent, B2/D1 and no-money barriers",()=>{
    for(const boundary of [
      "node scripts/ops/assert-backend-publication-main.mjs",
      "node scripts/ops/assert-gri-continuation-ancestry.mjs",
      "node --test scripts/ops/assert-gri-continuation-ancestry.test.mjs",
      "fetch-depth: 0",
      "test \"$EXPECTED_SHA\" = \"$(git rev-parse HEAD)\"",
      "B2_ACCOUNT_QUOTA_REQUIRED: \"1\"",
      "B2_ACCOUNT_QUOTA_WORKFLOW_ID: risk_indices_d1_parent",
      "B2_REQUEST_BUDGET: \"12\"",
      "scripts/lib/risk-indices-verified-d1-parent.test.mjs",
      "publish-risk-indices-from-verified-global-risk.mjs --verified-d1-parent-only",
      "/v1/public/hot-snapshot/risk-indices",
    ]) expect(workflow).toContain(boundary);
    expect(workflow).not.toContain("SUPABASE_DB_URL: ${{ secrets.");
    expect(workflow).not.toContain("COINBASE_API_KEY: ${{ secrets.");
    const parent=readFileSync("scripts/lib/risk-indices-verified-d1-parent.mjs","utf8");
    expect(parent).toContain('snapshot.verification_mode !== "direct-b2-readback"');
    expect(parent).toContain("snapshot.full_b2_readback_verified !== true");
    expect(parent).toContain("snapshot.exact_gzip_restore_verified !== true");
    expect(parent).toContain("SOURCE_CLOCK_OR_EXPIRY_INVALID");
    expect(parent).toContain("DOMAIN_" );
  });
});
