/** Private-only first-party original intake. No provider calls or rights grants.
 * Source-native publication clocks are never replaced by ingestion timestamps.
 */
import {createHash} from "node:crypto";
export const RAW2H_SCHEMA="geomacro.phase2h.private-raw-observation.v1";
const CAT=new Set(["geopolitics","macro","rare_earth"]);
const sha=x=>createHash("sha256").update(x).digest("hex");
const date=x=>typeof x==="string"&&/^20\d{2}-\d\d-\d\d(?:T\d\d:\d\d:\d\d(?:\.\d{3})?Z)?$/u.test(x)&&
 Number.isFinite(Date.parse(x))&&
 new Date(Date.parse(x)).toISOString().slice(0,10)===x.slice(0,10);
const validUrl=x=>{
 try{
  const u=new URL(x);
  return u.protocol==="https:"&&!u.username&&!u.password&&!u.port&&!u.hash&&
   u.hostname.includes(".")&&!/^(?:localhost|127\.|10\.|192\.168\.|169\.254\.)/u.test(u.hostname)&&
   u.toString().length<1800;
 }catch{return false;}
};
const safeText=(x,max)=>typeof x==="string"&&x.length>0&&x.length<=max&&
 !/[<>]/u.test(x);
const channels=topic=>{
 const t=String(topic).toLowerCase(),out=[];
 if(/\b(rate|monetary|inflation|yield|bond|treasury)\b/u.test(t))out.push("rates_and_bonds");
 if(/\b(fx|currency|foreign exchange|exchange rate|cross.border)\b/u.test(t))out.push("fx_and_payments");
 if(/\b(sanction|trade|tariff|shipping|export|import|border|embargo)\b/u.test(t))out.push("trade_and_logistics");
 if(/\b(mineral|rare earth|lithium|cobalt|nickel|copper|mining|processing)\b/u.test(t))out.push("mineral_supply_chain");
 return out;
};
export function buildPhase2hPrivateRawRecords(candidates,{now=new Date(),derive}={}){
 if(!Array.isArray(candidates)||!(now instanceof Date)||!Number.isFinite(now.getTime())||
    typeof derive!=="function")throw Error("PHASE2H_RAW_COLLECTOR_INVALID");
 const map=new Map(),counts={geopolitics:0,macro:0,rare_earth:0};
 let excluded=0;
 for(const c of candidates){
  if(!c||!CAT.has(c.category)||!safeText(c.title,260)||
     !safeText(c.sourceId,110)||!validUrl(c.articleUrl)||
     !date(c.publishedAt)||Date.parse(c.publishedAt)>now.getTime()+60_000){
   excluded++;continue;
  }
  // Preserve only original first-party feed metadata. A publisher's original
  // article body is NOT present in these existing collectors and cannot be
  // fabricated from the feed. Full-text rights are not inferred from access.
  const openLicense=typeof c.credit==="string"&&
    /Open Government Licence v3\.0/u.test(c.credit);
  // A source issuing only a calendar day MUST NOT acquire a fictitious UTC
  // hour from an upstream parser's midnight sentinel.
  const nativePublished=c.datePrecision==="day"
    ?c.publishedAt.slice(0,10):c.publishedAt;
  const original={
   original_source_id:c.sourceId,original_url:c.articleUrl,
   original_published_at:nativePublished,
   date_precision:c.datePrecision==="day"?"day":"exact",
   original_title:c.title,
   original_content:openLicense&&typeof c.description==="string"&&
     c.description.length<=900&&!/[<>]/u.test(c.description)?c.description:null,
   content_scope:openLicense?"OPEN_LICENSE_FEED_DESCRIPTION_WHEN_PRESENT":"ORIGINAL_FEED_METADATA_ONLY",
   full_article_html_collected:false,
   original_article_license_verified:false,
   source_credit:typeof c.credit==="string"&&c.credit.length<=250?c.credit:null,
  };
  const observationId=sha(c.category+"\n"+c.articleUrl+"\n"+nativePublished);
  let signals=[];
  try{signals=derive([c],now.getTime(),{maxSignals:2})}catch{/* no event is fabricated */}
  const s=Array.isArray(signals)?signals.find(x=>x.category===c.category&&
    x.published_at===c.publishedAt&&
    typeof x.what_changed==="string"&&typeof x.why_it_matters==="string"):null;
  const topic=s?.topic??null;
  const analysis={
   schema:"geomacro.phase2h.private-five-part.v1",
   what_happened:{text:s?.what_changed??null,original_observation_id:observationId},
   why_it_matters:{text:s?.why_it_matters??null,independently_verified:false},
   market_relevance:{potential_watch_channels:channels(topic),observed_market_reaction_verified:false,
     confirmed_instruments:[],price_direction:null,price_change:null},
   what_to_watch:{event_topic:topic,trigger:"NEXT_ORIGINAL_RELEASE_OR_INDEPENDENT_CONFIRMATION",
     confirmed_followup_at:null},
   evidence_and_confidence:{original_observation_id:observationId,
     source_published_at:nativePublished,date_precision:original.date_precision,
     observed_feed_title_available:true,original_article_page_verified:false,
     independent_event_verified:false,commercial_rights_verified:false,
     paid_eligible:false,source_content_identity_sha256:sha(c.title+"\n"+nativePublished)},
  };
  const immutable={schema:RAW2H_SCHEMA,record_id:observationId,
    category:c.category,original,analysis,
    commercial_rights_verified:false,commercial_delivery_authorized:false};
  const rawSha=sha(JSON.stringify(immutable));
  const row={...immutable,raw_sha256:rawSha,ingested_at:now.toISOString()};
  if(map.has(observationId)){
   if(map.get(observationId).raw_sha256!==rawSha)
    throw Error("PHASE2H_SAME_ORIGINAL_ID_CHANGED_CONTENT");
   continue;
  }
  map.set(observationId,row);counts[c.category]++;
 }
 return Object.freeze({records:[...map.values()],counts,
   discarded_invalid:excluded,exact_dedup_verified:true,commercial_rights_verified:false,
   original_full_text_unavailable_not_fabricated:true});
}
export async function postPhase2hPrivateRawRecords({
 records,controlPlaneRoot,token,fetchImpl=fetch
}={}){
 if(!Array.isArray(records)||records.length===0)return {stored:0,duplicate:0,readback_verified:true};
 if(typeof token!=="string"||token.length<32||
   controlPlaneRoot!=="https://geomacro-control-plane.daspallab202391.workers.dev")
  throw Error("PHASE2H_PRIVATE_INTAKE_AUTH_REQUIRED");
 let stored=0,duplicates=0;
 for(let i=0;i<records.length;i+=20){
  const group=records.slice(i,i+20);
  const response=await fetchImpl(controlPlaneRoot+"/v1/internal/phase2h-raw-news",{
   method:"PUT",redirect:"error",cache:"no-store",
   headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
   body:JSON.stringify({schema:"geomacro.phase2h.private-raw-batch.v1",items:group}),
   signal:AbortSignal.timeout(16000),
  });
  if(response.status!==200)throw Error("PHASE2H_PRIVATE_D1_PERSIST_UNAVAILABLE");
  const receipt=await response.json();
  if(receipt.ok!==true||receipt.d1_exact_readback_verified!==true||
     receipt.accepted+receipt.unchanged!==group.length)
    throw Error("PHASE2H_PRIVATE_D1_READBACK_MISMATCH");
  stored+=receipt.accepted;duplicates+=receipt.unchanged;
 }
 return {stored,duplicate:duplicates,readback_verified:true};
}
