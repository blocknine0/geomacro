#!/usr/bin/env node
// Metadata-only expiry guardian for old signed B2/D1 hot products.
// Never republishes old source, extends a proof TTL, signs data or spends funds.
import {appendFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {parseWranglerMetadata} from "./classify-d1-hot-metadata.mjs";

const PRODUCTS=Object.freeze({
  intelligence:Object.freeze({maxAge:360,lead:120}),
  "global-risk":Object.freeze({maxAge:90,lead:60}),
  "risk-indices":Object.freeze({maxAge:90,lead:60}),
});
const NAMES=Object.keys(PRODUCTS);
const integer=x=>Number.isInteger(x);
const limit=n=>integer(n)?Math.max(-525600,Math.min(525600,n)):null;

export function assessSignedHotExpiry(metadata,{nowMs=Date.now()}={}){
 if(!Number.isFinite(nowMs)||
    metadata?.schema!=="geomacro.d1-hot-metadata-expiry-diagnostic.v1"||
    !metadata.products||typeof metadata.products!=="object")
   throw Error("SIGNED_HOT_METADATA_INVALID");
 const products={};
 for(const product of NAMES){
  const x=metadata.products[product],policy=PRODUCTS[product];
  if(!x||typeof x!=="object"||!Array.isArray(x.reasons))throw Error("SIGNED_HOT_PRODUCT_INVALID");
  const remaining=integer(x.expiry_in_minutes)&&integer(x.source_age_minutes)?
    limit(Math.min(x.expiry_in_minutes,policy.maxAge-x.source_age_minutes)):null;
  let status;
  if(x.state==="ROW_ABSENT"&&x.reasons.includes("ROW_ABSENT"))status="MISSING";
  else if(x.reasons.includes("EXPIRED") || remaining!==null&&remaining<=0)status="EXPIRED";
  else if(x.state!=="METADATA_ONLY_POSSIBLE"||x.metadata_eligible!==true||
          x.reasons.length>0||remaining===null)status="INVALID";
  else if(remaining<=policy.lead)status="RENEWAL_DUE";
  else status="WITHIN_WINDOW";
  products[product]={
   status,source_age_minutes:limit(x.source_age_minutes),
   expiry_in_minutes:limit(x.expiry_in_minutes),
   effective_minutes_to_expiry:remaining,renewal_lead_minutes:policy.lead,
   original_evidence_clock_required:true,
   old_payload_retimestamp_allowed:false,
   metadata_only:true,
  };
 }
 const attention_required=NAMES.some(name=>products[name].status!=="WITHIN_WINDOW");
 return {
  schema:"geomacro.signed-hot-expiry-early-warning.v1",
  checked_at:new Date(nowMs).toISOString(),
  all_three_within_safe_window:!attention_required,attention_required,products,
  signed_proof_or_b2_readback_verified:false,real_commercial_product_approved:false,
  new_snapshot_published:false,b2_requests:0,d1_writes:0,
  supabase_reads:0,supabase_writes:0,real_funds_touched:false,
 };
}
export function signedHotExpirySummary(report){
 const rows=[
  "## Signed hot-snapshot pre-expiry guard",
  "",
  "Read-only D1 metadata; NOT proof of current signed B2 bytes or public delivery.",
  "",
  "| Product | Status | Source age (min) | Effective minutes left | Warning lead (min) |",
  "|---|---|---:|---:|---:|",
 ];
 for(const name of NAMES){
  const v=report.products[name];
  rows.push("| "+name+" | "+v.status+" | "+(v.source_age_minutes??"n/a")+" | "+
    (v.effective_minutes_to_expiry??"n/a")+" | "+v.renewal_lead_minutes+" |");
 }
 rows.push("",
  report.attention_required?
   "ACTION: obtain genuinely new independently reviewed sources. Submit immutable signed input to existing protected Intelligence/GRI publishers, then verify quota-budgeted B2/D1 readback. Do not reuse old timestamps.":
   "Metadata window intact; publisher signatures, B2/D1 byte proofs and paid status are NOT established.",
  "",
  "Intelligence: Machine Dual-Authority Intelligence Publication or Supabase-Free Reviewed Intelligence Publication.",
  "GRI: GRI v1.2 Supabase-Free Current Promotion. Risk Indices: downstream Risk Indices from Verified D1 Global Risk.",
  "Old signed product health remains at /api/health?deep=1 and cannot be greenwashed by unsigned stateless health.");
 return rows.join("\n")+"\n";
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 let raw="";
 try{
  for await(const chunk of process.stdin){
   raw+=String(chunk);
   if(raw.length>65536)throw Error("SIGNED_HOT_INPUT_OVERSIZE");
  }
  const result=assessSignedHotExpiry(parseWranglerMetadata(raw));
  console.log(JSON.stringify(result));
  if(process.env.GITHUB_STEP_SUMMARY)
   appendFileSync(process.env.GITHUB_STEP_SUMMARY,signedHotExpirySummary(result));
  if(result.attention_required){
   console.error("::error title=Signed hot renewal required::SIGNED_HOT_EXPIRY_ATTENTION_REQUIRED");
   process.exitCode=2;
  }
 }catch{
  console.error("::error title=Signed hot metadata verification failed::SIGNED_HOT_EXPIRY_VERIFICATION_FAILED");
  process.exitCode=2;
 }
}
