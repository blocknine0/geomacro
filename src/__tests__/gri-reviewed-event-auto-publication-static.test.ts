import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
const gri=readFileSync(".github/workflows/gri-v12-supabase-free-reviewed-current.yml","utf8");
const indices=readFileSync(".github/workflows/risk-indices-verified-d1-parent.yml","utf8");
const publisher=readFileSync("scripts/ops/publish-supabase-free-global-risk.mjs","utf8");
describe("signed approved B2-ready GRI producer -> real numerical GRI -> risk indices",()=>{
  it("only manual or explicit approved evidence event, no ingestion/cron trigger",()=>{
    expect(gri).toContain("repository_dispatch:");
    expect(gri).toContain("types: [gri_reviewed_current_ready]");
    expect(gri).toContain("workflow_dispatch:");
    expect(gri).toContain("github.event.client_payload.schema == 'geomacro.signed-reviewed-gri-ready.v1'");
    expect(gri).toContain("github.ref == 'refs/heads/main'");
    expect(gri).toContain("environment: production");
    expect(gri).not.toMatch(/^  schedule:/mu);
    expect(gri).not.toMatch(/^  workflow_run:/mu);
    expect(gri).not.toMatch(/^  push:/mu);
  });
  it("requires BOTH immutable SHA-bound B2 input keys before quota or network",()=>{
    const head=gri.slice(0,gri.indexOf("      - name: Resolve shared D1 quota governor"));
    for(const marker of [
      "CURRENT_GRI_IMMUTABLE_INPUT_KEY_SHA_NOT_BOUND",
      "geomacro-evidence/v1/private/reviewed-gri-current/",
      "geomacro-evidence/v1/private/reviewed-country-certification/",
      'key===prefix+pin+".json"',
      "PRODUCTION_SOURCE_SHA_NOT_DEPLOYED",
    ])expect(head).toContain(marker);
    const inputStage=gri.split("Read exact pinned signed current evidence from quota-governed B2")[1];
    expect(inputStage).toContain("REVIEWED_INPUT_B2_READBACK_MISMATCH");
    expect(gri).toContain("B2_ACCOUNT_QUOTA_REQUIRED: \"1\"");
    expect(gri).toContain('B2_REQUEST_BUDGET: "2"');
    expect(gri).toContain('B2_REQUEST_BUDGET: "8"');
  });
  it("supports signed issuer webhook but does not allow news triage to approve a GRI",()=>{
    for(const v of [
      "github.event_name == 'repository_dispatch'",
      "github.event.action == 'gri_reviewed_current_ready'",
      "inputs.reviewed_b2_key || github.event.client_payload.reviewed_b2_key",
      "inputs.reviewed_certificates_b2_sha256 || github.event.client_payload.reviewed_certificates_b2_sha256",
      "publish-supabase-free-global-risk.mjs --verified-current",
      "GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM",
      "GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256",
    ])expect(gri).toContain(v);
    expect(publisher).toContain("preflightReviewedCurrentGlobalRisk");
    expect(publisher).toContain("verifyThreeDomainReviewerHandoff");
    expect(gri).not.toContain("auto-ingest-news");
    expect(gri).not.toContain("material-gri-review.json");
    expect(gri).not.toContain("computeRiskFromUnscoredNews");
  });
  it("launches risk indices only on SAME SHA successful publisher event, still no-funds",()=>{
    expect(indices).toContain("github.event.workflow_run.event == 'repository_dispatch'");
    expect(indices).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(indices).toContain("github.event.workflow_run.head_sha == github.sha");
    expect(indices).toContain("github.event.workflow_run.head_branch == 'main'");
    expect(indices).toContain("github.event.workflow_run.head_repository.full_name == 'blocknine0/geomacro'");
    expect(indices).toContain("publish-risk-indices-from-verified-global-risk.mjs --verified-d1-parent-only");
    expect(indices).toContain("INDICES_EXACT_PRODUCTION_DEPLOYMENT_SHA_MISMATCH");
    expect(indices).not.toContain("SUPABASE_DB_URL: ${{ secrets.");
  });
});
