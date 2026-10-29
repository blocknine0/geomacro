import { readFileSync } from "node:fs";
import {describe,expect,it} from "vitest";

const script=readFileSync("scripts/ops/verify-live-on-demand-real-apis.ts","utf8");
const workflow=readFileSync(".github/workflows/live-on-demand-source-acceptance.yml","utf8");
const discovery=readFileSync("src/lib/on-demand-global-discovery.server.ts","utf8");

describe("production customer-query acceptance without B2, new services or money",()=>{
  it("samples actual China lithium across the SAME three categories, not generic India",()=>{
    expect(script).toContain('country_iso3:"CHN"');
    expect(script).toContain('mineral:"lithium"');
    expect(script).toContain('categories:["geopolitics","macro","rare_earth"]');
    expect(script).not.toContain('country_iso3:"IND"');
    expect(script).toContain('sample_case:"CHN_LITHIUM_CURRENT_SUPPLY_RISK"');
    expect(script).toContain('sample_topic_mineral:"lithium"');
  });
  it("never confuses a reachable source with a corroborated or signed current risk",()=>{
    expect(script).toContain('qualifying_fresh_original_found:privateEvidence.private_original_review_candidates.length>0');
    expect(script).toContain("current_lithium_risk_answer_verified:false");
    expect(script).toContain("x402_commercial_release_authorized:false");
    expect(script).toContain("private_original_candidate_derived_rights_verified:false");
    expect(script).toContain("payment_settlement_attempted:receipt.settlement_attempted");
    expect(script).toContain("payable:receipt.payable");
    expect(script).not.toContain("console.log(privateEvidence)");
  });
  it("records status-class-only provider results without additional GETs or private URLs",()=>{
    expect(script).toContain("const statusOnlyFetch:typeof fetch=");
    expect(script).toContain("const response=await fetch(input,init)");
    expect(script).toContain("provider_http_outcomes:");
    expect(script).toContain('"ok_2xx"|"http_403"|"http_429"|"http_5xx"|"other_http"|"network_error"');
    expect(script).toContain("observedRequests!==proof.total_bounded_network_attempts");
    expect(script).toContain("proof.provider_http_outcomes.length>10");
    expect(script).toContain("category_retrieval_proof:categoryRetrievalProof");
    expect(script).toContain("{fetchImpl:statusOnlyFetch}");
    expect(script).not.toContain("provider_http_outcomes:outcomeCounts");
    expect(script).not.toContain("console.log(response)");
    expect(script).not.toContain("console.log(uri)");
    expect(script).not.toContain("fetch(uri");
  });
  it("serializes real provider jobs without unrelated PRs cancelling running acceptance",()=>{
    expect(workflow).toContain("group: geomacro-live-on-demand-global-discovery-acceptance");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).not.toContain("cancel-in-progress: true");
    expect(workflow).toContain('cron: "23 8 * * *"');
    expect(workflow).toContain("GEOMACRO_COUNTRY_BATCH_COUNT");
    // Source-protecting concurrency must cover both PR and production jobs.
    expect(workflow.indexOf("concurrency:")).toBeLessThan(workflow.indexOf("jobs:"));
    expect(workflow).not.toContain("group: ${{ github.event.pull_request.number }}");
  });
  it("production POST checks the genuine Fed original across historical and default-current source windows",()=>{
    const readback=readFileSync("scripts/ops/phase2-production-no-funds-readback.mjs","utf8");
    expect(readback).toContain("USA_FED_HISTORICAL");
    expect(readback).toContain("USA_FED_CURRENT_REJECTION");
    expect(readback).toContain("private_exact_query_bound_fed_drafts===1");
    expect(readback).toContain("private_exact_query_bound_fed_drafts===0");
    expect(readback).toContain("article_page_publication_dates_verified>=1");
    expect(readback).toContain("if(report.exact_sha_verified) for");
    expect(readback).toContain("GEOMACRO_EXPECTED_DEPLOYED_SHA");
    expect(readback).toContain('payment_attempts:0,settlement_attempts:0');
    expect(readback).not.toContain("PAYMENT-SIGNATURE: ");
    expect(readback).not.toContain("settleCoinbaseX402");
  });
  it("makes existing genuine hosted canonical customer POST acceptance explicitly opt-in after real Lovable publication",()=>{
    expect(workflow).toContain("verify_hosted_customer_post:");
    expect(workflow).toContain("type: boolean");
    expect(workflow).toContain("default: false");
    expect(workflow).toContain("hosted-customer-post-no-funds:");
    expect(workflow).toContain("github.event_name == 'workflow_dispatch'");
    expect(workflow).toContain("inputs.verify_hosted_customer_post == true");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("needs: real-api-proof");
    expect(workflow).toContain("GEOMACRO_EXPECTED_DEPLOYED_SHA: ${{ github.sha }}");
    expect(workflow).toContain("node scripts/ops/phase2-production-no-funds-readback.mjs");
    expect(workflow).toContain("group: geomacro-live-on-demand-global-discovery-acceptance");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow.match(/cron:/gu)).toHaveLength(1);
    expect(workflow).not.toContain("settleCoinbaseX402");
    expect(workflow).not.toContain("PAYMENT-SIGNATURE");
  });
  it("keeps quota-constrained daily workflow with limited original-page reads",()=>{
    expect(workflow).toContain("bun scripts/ops/verify-live-on-demand-real-apis.ts");
    expect(workflow).toContain('paths:');
    expect(workflow).toContain('"scripts/ops/verify-live-on-demand-real-apis.ts"');
    expect(workflow).toContain('cron: "23 8 * * *"');
    expect(script).toContain("proof.network_attempts>12");
    expect(script).toContain("proof.original_article_page_attempts>4");
    expect(script).toContain("proof.total_bounded_network_attempts>17");
    expect(discovery).toContain("private_original_review_candidates");
    expect(script).not.toContain("settleCoinbaseX402");
    expect(script).not.toContain("readB2");
  });
});