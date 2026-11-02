#!/usr/bin/env node
/** Source-only evidence check AFTER exact D1 candidate write/readback.
 * No additional D1 read: inspect the already D1-acknowledged candidate cohort.
 * Screens publisher pages, not a new public news or payable event pipeline.
 */
import {readFileSync,writeFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {verifyNativeCorridorCandidates} from "../lib/corridor-native-article-verification.mjs";

export async function verifyCorridorReceipt({receipt,now=new Date(),fetchImpl=fetch}={}){
 if(receipt?.schema!=="geomacro.corridor-native-news-candidates.v1"||
    receipt?.channel!=="CORRIDOR_ONLY"||
    receipt?.source_count!==37||receipt?.native_news_sources_polled!==6||
    !Array.isArray(receipt?.news_candidates)||
    receipt?.candidate_count!==receipt.news_candidates.length||
    receipt?.website_intelligence_enabled!==false||
    receipt?.commercial_rights_verified!==false||
    !Number.isFinite(Date.parse(receipt.checked_at))||
    now.getTime()<Date.parse(receipt.checked_at)||
    now.getTime()-Date.parse(receipt.checked_at)>20*60000)
  throw Error("CORRIDOR_VERIFICATION_RECEIPT_INVALID");
 return verifyNativeCorridorCandidates({candidates:receipt.news_candidates,now,fetchImpl});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
     process.env.GITHUB_REF!=="refs/heads/main"||
     !/^\d{1,20}$/u.test(process.env.GITHUB_RUN_ID||""))
   throw Error("CORRIDOR_ARTICLE_VERIFIER_MAIN_ONLY");
  const accepted=JSON.parse(readFileSync("artifacts/direct-corridor-intake/d1-readback.json","utf8"));
  const receipt=JSON.parse(readFileSync("artifacts/direct-corridor-intake/news-candidates.json","utf8"));
  // Do not read/fetch a candidate if authenticated D1 writes were not
  // acknowledged and independently read back for this exact cohort.
  if(accepted?.schema!=="geomacro.corridor-native-news-production-acceptance.v1"||
     accepted?.authenticated_d1_put_readback!==true||
     accepted?.authenticated_d1_get_readback!==true||
     accepted?.d1_candidate_records_verified!==receipt.candidate_count||
     accepted?.native_news_candidates_observed!==receipt.candidate_count)
   throw Error("CORRIDOR_CANDIDATES_NOT_D1_VERIFIED");
  const result=await verifyCorridorReceipt({receipt});
  writeFileSync("artifacts/direct-corridor-intake/article-evidence-screen.json",
   JSON.stringify(result,null,2)+"\n",{mode:0o600});
  console.log(JSON.stringify({schema:result.schema,checked_at:result.checked_at,
   candidate_count:result.candidate_count,inspected_count:result.inspected_count,
   deferred_count:result.deferred_count,
   article_body_reads:result.article_body_reads,
   body_route_mentions:result.body_route_mentions,
   route_clause_observed:result.route_clause_observed,
   independent_vessel_route_matches:result.independent_vessel_route_matches,
   verified_corridor_events:0,paid_output_authorized:false}));
 }catch(error){
  const allowed=new Set(["CORRIDOR_ARTICLE_VERIFIER_MAIN_ONLY",
   "CORRIDOR_CANDIDATES_NOT_D1_VERIFIED","CORRIDOR_VERIFICATION_RECEIPT_INVALID",
   "CORRIDOR_ARTICLE_VERIFIER_INPUT_INVALID"]);
  console.error("::error::"+(allowed.has(error?.message)?error.message:"CORRIDOR_ARTICLE_SCREEN_UNAVAILABLE"));
  process.exitCode=2;
 }
}
