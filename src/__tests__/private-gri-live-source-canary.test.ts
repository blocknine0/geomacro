import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { makePrivateStageRecord } from "../../scripts/lib/restricted-private-scored-stage.mjs";
import { capturePrivateGriSourceCompanion } from "../../scripts/lib/private-gri-original-publisher-companion.mjs";
import { preflightThreeDomainPrivateSingleton } from "../../scripts/ops/preflight-private-griv12-singleton.mjs";

const NOW=new Date("2026-10-09T17:50:00.000Z");
const domains=["geopolitics","macro","rare_earth"];
function evidence() {
  const candidates:Record<string,unknown>={},sources:Record<string,unknown>={};
  for(const category of domains) {
    const host="native-"+category.replace("_","-")+".example.org";
    const article={
      url:"https://"+host+"/material-news",
      sourceDomain:host,
      title:"Original publisher issues verified material "+category+" decision",
      publishedAt:new Date(NOW.getTime()-20*60_000).toISOString(),
      discoveryProvider:"official_native_rss",
      nativePublishedAtVerified:true,
    };
    const assessment={
      relevant:true,category,ungrounded:false,
      severity:63,confidence:86,
      summary:"Material independent publication creates private risk intelligence.",
      narrative:"A concrete official development changes assessed domain exposure.",
      classificationProvider:"groq",classificationModel:"canonical-private-model",
      classificationVersion:"event-severity-v1.0.5",
      classificationPromptVersion:"risk-desk-filter-v1.0.5",
      classificationInputHash:"a".repeat(64),
    };
    const staged=makePrivateStageRecord({
      article,assessment,category,now:NOW,
    });
    const companion=capturePrivateGriSourceCompanion({
      article,staged,capturedAt:NOW,
    });
    candidates[category]={
      schema:"geomacro.private-scoring-candidates.v1",
      category,classifier_version:"event-severity-v1.0.5",
      private_only:true,records:[staged],
    };
    sources[category]={
      schema:"geomacro.private-gri-source-candidates.v1",
      category,private_only:true,public_published:false,
      commercial_eligible:false,records:[companion],
    };
  }
  return {candidates,sources};
}
function preflight(a=evidence(),now=NOW) {
  return preflightThreeDomainPrivateSingleton({
    candidatesByCategory:a.candidates,
    sourcesByCategory:a.sources,now,
  });
}
describe("#1827 one-shot governed 3-domain GRI pre-B2 canary",()=>{
  it("proves reproducible GRI before ANY B2 transaction; output is source-free",()=>{
    const receipt=preflight();
    expect(receipt).toMatchObject({
      accepted:true,private_only:true,commercial_eligible:false,
      public_published:false,singleton_per_category:true,
      source_rights_verified:false,
      independent_corroborated:false,
      b2_requests:0,d1_writes:0,supabase_writes:0,usdc_spent:0,
    });
    expect(receipt.current_categories).toEqual(domains);
    expect(JSON.stringify(receipt)).not.toContain("Original publisher");
    expect(JSON.stringify(receipt)).not.toContain("native-geopolitics");
  });

  it("refuses zero, duplicate and absent categories before B2, not a partial green",()=>{
    const e=evidence() as any;
    e.sources.macro.records=[];
    expect(()=>preflight(e)).toThrow("GRI_PRIVATE_CANARY_SINGLETON_SOURCE_REQUIRED:macro");
    const d=evidence() as any;
    d.candidates.rare_earth.records.push(d.candidates.rare_earth.records[0]);
    expect(()=>preflight(d)).toThrow("GRI_PRIVATE_CANARY_SINGLETON_SOURCE_REQUIRED:rare_earth");
    const missing=evidence() as any;
    delete missing.candidates.geopolitics;
    expect(()=>preflight(missing)).toThrow("GRI_PRIVATE_CANARY_SINGLETON_SOURCE_REQUIRED:geopolitics");
  });

  it("refuses falsified native original timestamp and expired publisher evidence",()=>{
    const e=evidence() as any;
    e.sources.macro.records[0].original_publisher_native_timestamp_hint=false;
    expect(()=>preflight(e)).toThrow("GRI_PRIVATE_BRIDGE_ORIGINAL_PUBLISHER_NOT_ADMITTED:macro");
    expect(()=>preflight(evidence(),new Date(NOW.getTime()+95*60_000)))
      .toThrow();
  });

  it("one-time push or explicit owner manual input only, no recurring full GRI cost",()=>{
    const workflow=readFileSync(
      ".github/workflows/restricted-private-current-scoring.yml","utf8");
    const source=readFileSync("scripts/ops/preflight-private-griv12-singleton.mjs","utf8");
    expect(workflow).toContain("Merge pull request #1890");
    expect(workflow).toContain("private_gri_singleton:");
    expect(workflow).toContain("default: false");
    expect(workflow).not.toContain("  schedule:");
    expect(workflow).not.toContain("  workflow_run:");
    expect(workflow).toContain("MAX_CANDIDATES_PER_CATEGORY:");
    expect(workflow).toContain("'1' || '2'");
    const preflightIdx=workflow.indexOf(
      "Prove genuine original-source three-domain singleton eligibility BEFORE B2 PUT");
    const stageIdx=workflow.indexOf("Verify one private B2 bundle then write compact D1 checkpoint");
    const proofIdx=workflow.indexOf(
      "Prepare source-bound canonical private GRI v1.2 proof locally");
    const archiveIdx=workflow.indexOf(
      "Independently verify private GRI proof B2 restore then D1 checkpoint");
    expect(preflightIdx).toBeGreaterThan(0);
    expect(preflightIdx).toBeLessThan(stageIdx);
    expect(stageIdx).toBeLessThan(proofIdx);
    expect(proofIdx).toBeLessThan(archiveIdx);
    expect(workflow).toContain("env -u B2_KEY_ID -u B2_APPLICATION_KEY");
    expect(workflow).toContain('B2_REQUEST_BUDGET: "2"');
    expect(workflow).toContain("B2_ACCOUNT_QUOTA_WORKFLOW_ID: gri_private_v12");
    expect(workflow).toContain("archive-supabase-free-private-gri-v12.mjs");
    expect(workflow).not.toContain("artifacts/private-gri-v12/*.json");
    expect(workflow).not.toContain("verified-source-companion.json");
    expect(workflow).not.toContain("verified-stage.json");
    expect(source).not.toContain("SUPABASE_DB_URL: ${{ secrets");
    expect(source).not.toContain("paymentAuthorization");
  });

  it("source companion can never be uploaded as raw/GitHub artifact",()=>{
    const workflow=readFileSync(".github/workflows/restricted-private-current-scoring.yml","utf8");
    const upload=workflow.slice(workflow.indexOf("Upload metadata-only staging proof"));
    expect(upload).toContain("artifacts/restricted-current-scoring/archive-proof.json");
    expect(upload).toContain("artifacts/restricted-current-scoring/diagnostics-summary.json");
    expect(upload).toContain("artifacts/private-gri-v12/archive-receipt.json");
    expect(upload).not.toContain("source.json");
    expect(upload).not.toContain("verified-stage.json");
    expect(upload).not.toContain("prepare-receipt.json");
  });
});
