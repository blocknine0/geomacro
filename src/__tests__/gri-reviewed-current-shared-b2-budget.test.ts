import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const workflow=readFileSync(".github/workflows/gri-v12-supabase-free-reviewed-current.yml","utf8");
const publisher=readFileSync("scripts/ops/publish-supabase-free-global-risk.mjs","utf8");
const stage=(name:string)=>{
  const marker="      - name: "+name+"\n";
  expect(workflow).toContain(marker);
  return workflow.split(marker)[1]?.split("\n      - name: ")[0]??"";
};
const budget=(name:string)=>{
  const s=stage(name);
  expect(s).toMatch(/\n        env:\n          B2_REQUEST_BUDGET: "\d+"/u);
  return Number(s.match(/B2_REQUEST_BUDGET: "(\d+)"/u)?.[1]);
};

describe("verified GRI B2 request envelope",()=>{
  it("enforces a cumulative 12-attempt ceiling across independent clients",()=>{
    const budgets=[
      budget("Read exact pinned signed current evidence from quota-governed B2"),
      budget("Retrieve exact independently signed country-category certifications from governed B2"),
      budget("Publish current verified GRI and prove B2/D1 public readback without funds"),
    ];
    expect(budgets).toEqual([2,2,8]);
    expect(budgets.reduce((a,b)=>a+b,0)).toBe(12);
    expect(workflow).toContain('B2_ACCOUNT_QUOTA_REQUIRED: "1"');
    expect(workflow).toContain('B2_ACCOUNT_QUOTA_WORKFLOW_ID: gri_supabase_free_reviewed');
    expect(workflow).toContain("D1_DATABASE_ID=$id");
  });
  it("preserves external signed inputs, immutable original clocks and no-funds gates",()=>{
    expect(workflow).toContain("REVIEWED_CERTIFICATES_B2_SHA256");
    expect(workflow).toContain("GEOMACRO_GRI_REVIEWED_INPUT_SHA256");
    expect(workflow).toContain("PRODUCTION_SOURCE_SHA_NOT_DEPLOYED");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("github.event_name == 'workflow_dispatch'");
    expect(workflow).not.toContain("COINBASE_API_KEY: \u0024{{ secrets.");
    expect(workflow).not.toContain("SUPABASE_DB_URL: \u0024{{ secrets.");
    expect(publisher).toContain("preflightReviewedCurrentGlobalRisk");
    expect(publisher).toContain("verifyThreeDomainReviewerHandoff");
    expect(publisher).toContain("direct_b2_readback_verified: true");
    expect(publisher).toContain("funds_spent_usdc: 0");
  });
});
