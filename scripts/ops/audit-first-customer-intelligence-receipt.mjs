#!/usr/bin/env node
/**
 * GeoMacro-owned, read-only first-buyer delivery receipt audit.
 * Operates on LOCAL redacted exports. No network, D1, payments or partner writes.
 * Prints only aggregate counts and stable ID-set hashes, never raw items.
 *
 * node scripts/ops/audit-first-customer-intelligence-receipt.mjs authenticated.json [source-neutral.json]
 */
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";

const CATEGORIES=Object.freeze(["geopolitics","macro","rare_earth"]);
const STATES=Object.freeze(["MONITORED_SOURCE_REPORT_UNVERIFIED",
  "DATED_OFFICIAL_FEED_CANDIDATE_UNCLASSIFIED","OFFICIAL_RELEASE_OBSERVED_UNSCORED"]);
const LIMIT=600, COHORT_SKEW_MS=90_000;
const failure=code=>{throw Error("FIRST_CUSTOMER_RECEIPT_"+code);};
const counts=items=>Object.fromEntries(CATEGORIES.map(category=>
  [category,items.filter(item=>item.category===category).length]));
const hashIds=items=>createHash("sha256")
  .update(items.map(x=>x.id).sort().join("\n")).digest("hex");
const time=value=>Date.parse(typeof value==="string"?value:"");

function inspectFeed(feed,projection){
  if(feed?.ok!==true||feed.schema!=="geomacro.derived-news-structural-feed.v1"||
     feed.projection!==projection||feed.retention_hours!==72||
     feed.original_release_delay_minutes!==0||
     feed.journal_origin!=="SAME_D1_ROWS_AS_GEOMACRO_INTELLIGENCE"||
     feed.raw_upstream_delivered!==false||
     feed.commercial_rights_verified!==false||
     feed.partner_resale_or_commercial_redistribution_authorized!==false||
     feed.signed!==false||feed.chargeable!==false||
     !Number.isFinite(time(feed.generated_at))||
     !Array.isArray(feed.items)||feed.items.length>LIMIT)
    failure("CONTRACT_INVALID");
  const items=feed.items, seen=new Set();
  for(const item of items){
    if(!item||typeof item.id!=="string"||!item.id||seen.has(item.id)||
       !CATEGORIES.includes(item.category)||!Number.isFinite(time(item.original_published_at))||
       item.commercial_derived_rights_verified!==false||
       item.signed_product_verified!==false||item.payable!==false||
       item.raw_upstream_delivered!==false||item.chargeable!==false||
       !STATES.includes(item.confidence_state)||
       !Array.isArray(item.sources_credited??[])||
       (item.sources_credited?.length>0&&
         (item.attribution_required!==true||
          item.attribution_notices?.length!==item.sources_credited.length)))
      failure("RECORD_INVALID");
    if(projection==="source_neutral"&&item.sources_credited?.length)
      failure("PUBLIC_REQUIRED_ATTRIBUTION_LEAK");
    seen.add(item.id);
  }
  const observed=counts(items);
  if(CATEGORIES.some(c=>!Number.isSafeInteger(feed.counts?.[c])||
      feed.counts[c]!==observed[c]))failure("COUNTS_OR_UNFILTERED_COHORT_INVALID");
  return items;
}
export function auditFirstCustomerResearchReceipt(partner,publicFeed=null){
  const privateItems=inspectFeed(partner,"attributed_research");
  if(partner.partner_delivery_schema!=="geomacro.predge.research-news-delivery.v1"||
     partner.partner_delivery_scope!=="PRIVATE_NONCOMMERCIAL_RESEARCH_PILOT"||
     partner.authentication!=="DEDICATED_BEARER_ONLY"||
     partner.attribution_must_be_preserved!==true||
     partner.attribution_is_not_a_grant_of_source_rights!==true||
     partner.daily_utc_request_hard_cap!==500||
     partner.execution_authorized!==false)
    failure("PARTNER_RESEARCH_SCOPE_INVALID");
  const creditCount=privateItems.filter(x=>x.sources_credited?.length>0).length;
  const byState=Object.fromEntries(STATES.map(state=>[state,
    counts(privateItems.filter(x=>x.confidence_state===state))]));
  const preview=Object.fromEntries(CATEGORIES.map(c=>[c,{
    research_candidates:Math.min(50,privateItems.filter(x=>x.category===c).length),
    genuine_production_signed_objects_verified:0,
    signed_preview_status:"NOT_PROVEN_BY_RESEARCH_FEED"
  }]));
  let comparison="NOT_PROVIDED",publicCount=null,publicHash=null;
  if(publicFeed!==null){
    const pubItems=inspectFeed(publicFeed,"source_neutral");
    publicCount=counts(pubItems);publicHash=hashIds(pubItems);
    const skew=Math.abs(time(partner.generated_at)-time(publicFeed.generated_at));
    if(skew>COHORT_SKEW_MS)comparison="DIFFERENT_SNAPSHOT_TIMES_INCONCLUSIVE";
    else{
      const allIds=new Map(privateItems.map(x=>[x.id,x]));
      if(pubItems.some(x=>!allIds.has(x.id)||
          allIds.get(x.id).category!==x.category||
          allIds.get(x.id).original_published_at!==x.original_published_at||
          (allIds.get(x.id).sources_credited?.length??0)>0))
        failure("SAME_COHORT_PUBLIC_SUBSET_MISMATCH");
      comparison="PASS_SOURCE_NEUTRAL_IDS_SUBSET_OF_ATTRIBUTED";
    }
  }
  return Object.freeze({
    schema:"geomacro.first-customer-research-receipt-audit.v1",
    audit_scope:"LOCAL_RESEARCH_SNAPSHOT_AGGREGATES_NO_PAYMENT",
    partner_snapshot_at:partner.generated_at,
    partner_total:privateItems.length,
    partner_by_category:counts(privateItems),
    partner_required_attribution_items:creditCount,
    partner_without_required_attribution_items:privateItems.length-creditCount,
    partner_by_confidence_state:byState,
    partner_id_set_sha256:hashIds(privateItems),
    public_total:publicFeed?.items?.length??null,
    public_by_category:publicCount,
    public_id_set_sha256:publicHash,
    public_same_cohort_comparison:comparison,
    research_preview_capacity_by_category:preview,
    production_signed_50_per_category_verified:false,
    genuine_current_gro_required:true,
    commercial_source_rights_verified:false,
    commercial_payment_authorized:false,
    partner_contract_excludes_automatic_resale:true,
    risk_gate_execution_authorized:false,
    attribution_and_observation_are_not_signatures:true,
    customer_payment_or_signed_contract_verified:false,
  });
}
if(process.argv[1]?.endsWith("/audit-first-customer-intelligence-receipt.mjs")){
  try{
    if(process.argv.length<3||process.argv.length>4)failure("USAGE");
    const read=path=>{
      const raw=readFileSync(path,"utf8");
      if(Buffer.byteLength(raw,"utf8")>3_000_000)failure("INPUT_TOO_LARGE");
      return JSON.parse(raw);
    };
    console.log(JSON.stringify(auditFirstCustomerResearchReceipt(
      read(process.argv[2]),process.argv[3]?read(process.argv[3]):null)));
  }catch(e){
    const message=String(e?.message??"");
    const code=/^FIRST_CUSTOMER_RECEIPT_[A-Z0-9_]+$/u.test(message)?
      message:"FIRST_CUSTOMER_RECEIPT_UNVERIFIED";
    console.error("::error::"+code);process.exitCode=2;
  }
}
