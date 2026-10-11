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