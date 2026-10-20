#!/usr/bin/env node
// First-party UKMTO public-index transport probe, existing 90-minute cadence.
// Private metadata receipt only; never convert index display to signed events.
import {mkdirSync,writeFileSync} from "node:fs";
import {observeUkmtoOfficialIndex} from "../lib/ukmto-official-corridor-index.mjs";
const OUT="artifacts/expanded-official-source/ukmto-corridor-index.json";
const SAFE_REASONS=new Set([
 "UKMTO_CLOCK_INVALID","UKMTO_BODY_INVALID","UKMTO_INDEX_FORMAT_UNVERIFIED",
 "UKMTO_DENIED_OR_QUOTA","UKMTO_HTTP_UNAVAILABLE","UKMTO_BODY_LIMIT",
 "UKMTO_BODY_EMPTY","UKMTO_ENCODING_INVALID"]);
if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
   process.env.GITHUB_REF!=="refs/heads/main"||
   !/^\d{1,20}$/.test(process.env.GITHUB_RUN_ID??""))
  throw Error("UKMTO_PROTECTED_MAIN_REQUIRED");
let receipt;
try{
 receipt=await observeUkmtoOfficialIndex();
}catch(error){
 const code=String(error?.message??"");
 receipt={
   schema:"geomacro.ukmto-first-party-corridor-index.v1",
   source_family:"ukmto",status:"UPSTREAM_OR_SHAPE_UNVERIFIED",
   reason:SAFE_REASONS.has(code)?code:"UKMTO_OTHER_TRANSPORT_FAILURE",
   checked_at:new Date().toISOString(),
   parsed_unique_index_report_ids:0,
   recent_index_report_candidates:0,candidate_corridor_ids:[],
   published_page_display_date_is_incident_date:false,
   first_party_article_original_verified:false,
   reported_incident_independently_verified:false,
   actual_corridor_flow_disruption_verified:false,
   commercial_rights_verified:false,
   partner_or_paid_delivery_enabled:false,
   upstream_html_stored:false,
   supabase_requests:0,d1_writes:0,b2_requests:0,payments:0
 };
}
mkdirSync("artifacts/expanded-official-source",{recursive:true,mode:0o700});
writeFileSync(OUT,JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify({
 source_family:"ukmto",status:receipt.status,reason:receipt.reason??null,
 parsed_unique_index_report_ids:receipt.parsed_unique_index_report_ids,
 recent_index_report_candidates:receipt.recent_index_report_candidates,
 candidate_corridor_ids:receipt.candidate_corridor_ids,
 first_party_article_original_verified:false,paid_delivery_enabled:false,payments:0
}));
if(receipt.status!=="RECENT_INDEX_CONTEXT_OBSERVED")process.exitCode=3;
