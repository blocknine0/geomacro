#!/usr/bin/env bun
/**
 * Hourly/cloud GRI materiality review: exact same three-page D1 journal
 * as the public Intelligence website, capped at its native 600-row
 * retention. No new upstream collector, new law/licence, signatures or funds.
 */
import {readFileSync,writeFileSync,realpathSync} from "node:fs";
import {isAbsolute,resolve,dirname,relative} from "node:path";
import {fetchAllDerivedNews} from "../../src/lib/public-derived-news-client.ts";
import {buildCompleteIntelligenceGriReview}
 from "../lib/complete-intelligence-gri-review.mjs";

const fail=()=>{throw Error("COMPLETE_INTELLIGENCE_GRI_REVIEW_NOT_ACCEPTED")};
async function main(){
 const e=process.env;
 const target=e.GEOMACRO_COMPLETE_GRI_REVIEW_PATH??"";
 const runner=e.RUNNER_TEMP??"";
 if(process.argv.length!==3||process.argv[2]!=="--triage-all-intelligence-no-funds"||
  e.GITHUB_ACTIONS!=="true"||e.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
  e.GITHUB_REF!=="refs/heads/main"||
  !/^[0-9]{1,20}$/u.test(e.GITHUB_RUN_ID??"")||
  !isAbsolute(target)||!isAbsolute(runner)||
  relative(realpathSync(runner),realpathSync(dirname(target))).startsWith("..")||
  e.GEOMACRO_STANDING_DELEGATION_ENABLED!=="YES_DELEGATED_DERIVED_ONLY"||
  e.GEOMACRO_STANDING_DELEGATION_REVOKED==="YES")fail();

 const now=Date.now();
 const signals=await fetchAllDerivedNews(fetch,now);
 const registry=readFileSync("src/lib/canonical-country-registry-195.ts","utf8");
 const packet=buildCompleteIntelligenceGriReview({
  signals,registrySource:registry,now
 });
 const data=JSON.stringify(packet)+"\n";
 if(Buffer.byteLength(data,"utf8")>1_500_000)fail();
 writeFileSync(target,data,{flag:"wx",mode:0o600});
 console.log(JSON.stringify({
  schema:"geomacro.complete-intelligence-to-gri-review-run.v1",
  status:"ALL_RETAINED_NEWS_TRIAGED_FOR_PRIVATE_GRI_REVIEW",
  source_journal_rows_examined:packet.source_journal_rows_examined,
  source_journal_rows_triaged:packet.source_journal_rows_triaged,
  category_journal_counts:packet.category_journal_counts,
  category_material_review_counts:packet.category_material_review_counts,
  review_batches:packet.review_batches,
  no_original_reverification_in_this_step:true,
  current_scored_gri_not_claimed:true,source_rights_not_granted:true,
  raw_source_details_in_logs:false,payments:0
 }));
}
if(import.meta.main){
 main().catch(()=>{
  console.error("COMPLETE_INTELLIGENCE_GRI_REVIEW_REFUSED_NO_FUNDS");
  process.exitCode=2;
 });
}
