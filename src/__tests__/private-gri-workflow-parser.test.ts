import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import prettier from "prettier";

const workflowPath=".github/workflows/restricted-private-current-scoring.yml";
const workflow=readFileSync(workflowPath,"utf8");

describe("#1827 private GRI one-time canary workflow structural guard",()=>{
  it("parses as real YAML, not only a string-matched fixture",async()=>{
    const pretty=await prettier.format(workflow,{parser:"yaml"});
    expect(pretty).toContain("Restricted Private Current Scoring Staging");
    expect(pretty).toContain("private_gri_singleton:");
    expect(pretty).toContain("MAX_CANDIDATES_PER_CATEGORY:");
    expect(pretty).toContain("Prove genuine original-source three-domain singleton");
  });

  it("only a one-time exact main PR #1891 push or owner dispatch can enter private canary",()=>{
    expect(workflow).toContain("Merge pull request #1891");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("github.event.inputs.private_gri_singleton == 'true'");
    expect(workflow).toContain("default: false");
    expect(workflow).not.toContain("\n  schedule:");
    expect(workflow).not.toContain("\n  workflow_run:");
    expect(workflow).not.toContain("\n      GEOMACRO_PRIVATE_GRI_SINGLETON:");
    expect(workflow).toContain('MAX_CANDIDATES_PER_CATEGORY: "1"');
  });

  it("does not produce unbounded B2 requests, payment access or leak source/proof artifacts",()=>{
    expect(workflow).toContain('B2_ACCOUNT_QUOTA_REQUIRED: "1"');
    expect(workflow).toContain('B2_REQUEST_BUDGET: "6"');
    expect(workflow).toContain('B2_REQUEST_BUDGET: "2"');
    expect(workflow).toContain("preflight-private-griv12-singleton.mjs");
    expect(workflow).toContain("archive-supabase-free-private-gri-v12.mjs");
    expect(workflow).not.toContain("SUPABASE_SERVICE_ROLE_KEY: ${{ secrets");
    const upload=workflow.split("name: Upload metadata-only staging proof")[1];
    expect(upload).toBeTruthy();
    expect(upload).not.toContain("verified-source-companion.json");
    expect(upload).not.toContain("verified-stage.json");
    expect(upload).not.toContain("portable-proof");
    expect(upload).not.toContain("source.json");
  });
});
