#!/usr/bin/env node
// GeoMacro-owned read-only PREDGE 29 Oct research acceptance.
// Exactly one authenticated partner GET and one unauthenticated public GET
// in --live mode. No D1 writes, secrets/logged rows, downstream access, or signing.
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";

const BASE="https://geomacro-control-plane.daspallab202391.workers.dev";
const CATEGORIES=["geopolitics","macro","rare_earth"];
const STATUSES=["MONITORED_SOURCE_REPORT_UNVERIFIED",
 "DATED_OFFICIAL_FEED_CANDIDATE_UNCLASSIFIED","OFFICIAL_RELEASE_OBSERVED_UNSCORED"];
const LIMIT=600;
const abort=reason=>{throw Error("PREDGE_EMAIL_ACCEPTANCE_"+reason);};
const counts=rows=>Object.fromEntries(CATEGORIES.map(c=>[c,rows.filter(x=>x.category===c).length]));
const hash=rows=>createHash("sha256")
  .update(rows.map(x=>x.id).sort().join("\n")).digest("hex");
const timestamp=value=>Date.parse(typeof value==="string"?value:"");

function check(feed,projection){
 if(feed?.ok!==true||
    feed.schema!=="geomacro.derived-news-structural-feed.v1"||
    feed.journal_origin!=="SAME_D1_ROWS_AS_GEOMACRO_INTELLIGENCE"||
    feed.projection!==projection||!Number.isFinite(timestamp(feed.generated_at))||
    feed.retention_hours!==72||feed.original_release_delay_minutes!==0||
    feed.raw_upstream_delivered!==false||feed.chargeable!==false||
    feed.signed!==false||feed.commercial_rights_verified!==false||
    feed.partner_resale_or_commercial_redistribution_authorized!==false||
    !Array.isArray(feed.items)||feed.items.length>LIMIT)
   abort("CONTRACT_INVALID");
 const ids=new Set();
 for(const row of feed.items){
   if(!row||typeof row.id!=="string"||row.id.length<1||row.id.length>256||
      ids.has(row.id)||!CATEGORIES.includes(row.category)||
      !Number.isFinite(timestamp(row.original_published_at))||
      !STATUSES.includes(row.confidence_state)||
      row.commercial_derived_rights_verified!==false||
      row.signed_product_verified!==false||row.payable!==false||
      row.raw_upstream_delivered!==false||row.chargeable!==false||
      !Array.isArray(row.sources_credited??[])||
      (row.sources_credited?.length>0&&
        (row.attribution_required!==true||!Array.isArray(row.attribution_notices)||
         row.attribution_notices.length!==row.sources_credited.length)))
     abort("RECORD_INVALID");
   if(projection==="source_neutral"&&row.sources_credited?.length)
     abort("PUBLIC_CREDIT_LEAK");
   ids.add(row.id);
 }
 if(CATEGORIES.some(c=>!Number.isSafeInteger(feed.counts?.[c])||
    feed.counts[c]!==counts(feed.items)[c]))
   abort("CATEGORY_COUNTS_MISMATCH");
 return feed.items;
}
export function auditEmailResearchSnapshots(privateFeed,publicFeed){
 const privateRows=check(privateFeed,"attributed_research");
 const publicRows=check(publicFeed,"source_neutral");
 if(privateFeed.partner_delivery_schema!=="geomacro.predge.research-news-delivery.v1"||
    privateFeed.partner_delivery_scope!=="PRIVATE_NONCOMMERCIAL_RESEARCH_PILOT"||
    privateFeed.authentication!=="DEDICATED_BEARER_ONLY"||
    privateFeed.attribution_must_be_preserved!==true||
    privateFeed.attribution_is_not_a_grant_of_source_rights!==true||
    privateFeed.execution_authorized!==false||
    privateFeed.daily_utc_request_hard_cap!==500||
    privateFeed.distributed_rate_governor!=="ATOMIC_CLOUDFLARE_D1_FAIL_CLOSED")
   abort("PARTNER_CONTRACT_INVALID");
 const skew=Math.abs(timestamp(privateFeed.generated_at)-timestamp(publicFeed.generated_at));
 const sameCohort=skew<=90_000;
 let comparison="DIFFERENT_SNAPSHOT_TIMES_INCONCLUSIVE";
 if(sameCohort){
   const partnerIds=new Map(privateRows.map(x=>[x.id,x]));
   for(const row of publicRows){
     const p=partnerIds.get(row.id);
     if(!p||p.category!==row.category||
        p.original_published_at!==row.original_published_at||
        (p.sources_credited?.length??0)!==0)
       abort("SAME_COHORT_PUBLIC_SUBSET_MISMATCH");
   }
   comparison="PUBLIC_SOURCE_NEUTRAL_IS_SUBSET_OF_PRIVATE_ATTRIBUTED";
 }
 const categoryStatus=Object.fromEntries(STATUSES.map(s=>
    [s,counts(privateRows.filter(x=>x.confidence_state===s))]));
 const credited=privateRows.filter(x=>x.sources_credited?.length>0);
 const uncredited=privateRows.filter(x=>!x.sources_credited?.length);
 return {
  schema:"geomacro.predge-29oct-email-readback.v1",
  acceptance:"RESEARCH_PARITY_ONLY_NOT_SIGNED_OR_PAID",
  as_of_private_utc:privateFeed.generated_at,as_of_public_utc:publicFeed.generated_at,
  same_cohort_within_90_seconds:sameCohort,
  public_subset_comparison:comparison,
  private_items:privateRows.length,
  private_category_counts:counts(privateRows),
  private_item_ids_sha256:hash(privateRows),
  public_items:publicRows.length,
  public_category_counts:counts(publicRows),
  public_item_ids_sha256:hash(publicRows),
  credited_count:credited.length,
  no_source_credit_count:uncredited.length,
  no_source_credit_is_proven_attribution_defect:false,
  confidence_state_counts:categoryStatus,
  observed_official_unscored_count:privateRows.filter(x=>
    x.confidence_state==="OFFICIAL_RELEASE_OBSERVED_UNSCORED").length,
  unverified_osint_count:privateRows.filter(x=>
    x.confidence_state==="MONITORED_SOURCE_REPORT_UNVERIFIED").length,
  historical_comparison:"REQUIRES_OWNER_HELD_SAME_COHORT_BASELINE_ID_SET",
  provisional_research_preview_capacity: Object.fromEntries(CATEGORIES.map(c=>
    [c,Math.min(50,privateRows.filter(x=>x.category===c).length)])),
  signed_flow_50_per_category_verified:false,
  risk_gate_news_context_live_contract_verified:false,
  production_signed_gro_verified:false,
  commercial_rights_verified:false,
  payment_authorized:false,
  source_documents_or_ids_logged:false
 };
}
async function getJson(url,token=null){
 const res=await fetch(url,{method:"GET",redirect:"error",cache:"no-store",
  headers:{Accept:"application/json",...(token?{Authorization:"Bearer "+token}:{})},
  signal:AbortSignal.timeout(15_000)});
 if(res.status!==200)abort("LIVE_HTTP_"+([401,403,429,503].includes(res.status)?res.status:"OTHER"));
 if(Number(res.headers.get("content-length")??0)>4_000_000)abort("OVERSIZE");
 const s=await res.text();
 if(Buffer.byteLength(s,"utf8")>4_000_000)abort("OVERSIZE");
 try{return JSON.parse(s);}catch{abort("INVALID_JSON");}
}
export async function runLiveEmailAcceptance(token){
 if(typeof token!=="string"||!/^[a-f0-9]{64}$/.test(token))
   abort("PROTECTED_RESEARCH_TOKEN_UNAVAILABLE");
 const route="/v1/partner/predge/derived-structural-72h";
 // Sequential, no retries, no extra partner calls and no raw response logging.
 const auth=await getJson(BASE+route,token);
 const pub=await getJson(BASE+"/v1/public/derived-structural-72h");
 return auditEmailResearchSnapshots(auth,pub);
}
if(process.argv[1]?.endsWith("audit-predge-29oct-email.mjs")){
 try{
  const args=process.argv.slice(2);let result;
  if(args.length===1&&args[0]==="--live"){
    result=await runLiveEmailAcceptance(process.env.PREDGE_RESEARCH_NEWS_TOKEN_OVERRIDE);
  }else if(args.length===3&&args[0]==="--offline"){
    const parse=p=>{
      const raw=readFileSync(p,"utf8");
      if(Buffer.byteLength(raw,"utf8")>4_000_000)abort("OVERSIZE");
      return JSON.parse(raw);
    };
    result=auditEmailResearchSnapshots(parse(args[1]),parse(args[2]));
  }else abort("USAGE");
  console.log(JSON.stringify(result));
 }catch(e){
  const code=String(e?.message??"");
  console.error("::error::"+(/^PREDGE_EMAIL_ACCEPTANCE_[A-Z0-9_]+$/.test(code)?
    code:"PREDGE_EMAIL_ACCEPTANCE_UNVERIFIED"));
  process.exitCode=2;
 }
}
