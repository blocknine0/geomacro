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
  it("keeps quota-constrained daily workflow with limited original-page reads",()=>{
    expect(workflow).toContain("bun scripts/ops/verify-live-on-demand-real-apis.ts");
    expect(workflow).toContain('paths:');
    expect(workflow).toContain('"scripts/ops/verify-live-on-demand-real-apis.ts"');
    expect(workflow).toContain('cron: "23 8 * * *"');
    expect(script).toContain("proof.network_attempts>12");
    expect(script).toContain("proof.original_article_page_attempts>4");
    expect(script).toContain("proof.total_bounded_network_attempts>16");
    expect(discovery).toContain("private_original_review_candidates");
    expect(script).not.toContain("settleCoinbaseX402");
    expect(script).not.toContain("readB2");
  });
});