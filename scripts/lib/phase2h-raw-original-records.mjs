/** Private-only first-party original intake. No provider calls or rights grants.
 * Source-native publication clocks are never replaced by ingestion timestamps.
 */
import {createHash} from "node:crypto";
export const RAW2H_SCHEMA="geomacro.phase2h.private-raw-observation.v1";
/** Founder-locked three-domain contract: transform every admitted raw original
 * into GeoMacro-authored five-part analysis without a manual commerce review.
 * This does not change the existing independent paid-delivery rights gate.
 */
export const PHASE2H_RAW_TO_STRUCTURED_LOCK=Object.freeze({
 schema:"geomacro.phase2h.raw-to-derived-five-part-lock.v1",
 categories:Object.freeze(["geopolitics","macro","rare_earth"]),
 five_part_fields:Object.freeze([
  "what_happened","why_it_matters","market_relevance",
  "what_to_watch","evidence_and_confidence",
 ]),
 raw_original_storage:"EXISTING_PRIVATE_D1_B2",
 derived_output_only:true,
 requires_manual_commercial_approval_to_generate:false,
 third_party_raw_redistribution:false,
 existing_paid_delivery_rights_unchanged:true,
});
const CAT=new Set(PHASE2H_RAW_TO_STRUCTURED_LOCK.categories);
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
// A topic-wide implication alone is boilerplate, not event-specific impact.
// Use only a factual change already emitted by the deterministic original-news
// parser; otherwise keep the evidence gap explicit instead of inventing cause.
export function phase2hEventSpecificWhy(signal){
 const change=typeof signal?.what_changed==="string"?signal.what_changed.trim():"";
 const relevance=typeof signal?.why_it_matters==="string"?signal.why_it_matters.trim():"";
 if(!change||!relevance||
   /a dated first-party source item was observed|has not yet been established|does not establish a named actor/iu.test(change))
  return null;
 const event=change.endsWith(".")?change.slice(0,-1):change;
 const result="The observed development — "+event+
  " — matters to the stated topic because "+relevance+
  " Any realized market response or subsequent outcome remains unverified.";
 return result.length<=1200&&!result.includes("https://")&&
  !result.includes("http://")&&!result.includes("<")&&!result.includes(">")?
  result:null;
}
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
  const nativeDay=c.datePrecision==="day"||/^20\d{2}-\d{2}-\d{2}$/u.test(c.publishedAt);
  const nativePublished=nativeDay
    ?c.publishedAt.slice(0,10):c.publishedAt;
  const original={
   original_source_id:c.sourceId,original_url:c.articleUrl,
   original_published_at:nativePublished,
   date_precision:nativeDay?"day":"exact",
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
   why_it_matters:{text:phase2hEventSpecificWhy(s),independently_verified:false},
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
  // Regression-enforced immutable shape; neither source licensing state nor
  // paid availability is consulted during the five-part derivation.
  if(analysis.schema!=="geomacro.phase2h.private-five-part.v1"||
     Object.keys(analysis).length!==PHASE2H_RAW_TO_STRUCTURED_LOCK.five_part_fields.length+1||
     !PHASE2H_RAW_TO_STRUCTURED_LOCK.five_part_fields.every(
       field=>Object.hasOwn(analysis,field)))
    throw Error("PHASE2H_FIVE_PART_CONTRACT_CHANGED");
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
 if(!Array.isArray(records)||records.length===0)return {
  stored:0,duplicate:0,readback_verified:true,
  per_original_readback_verified:true,verified_originals:0,
  submitted_five_part_exact_count:0,retained_immutable_five_part_count:0,
 };
 if(typeof token!=="string"||token.length<32||
   controlPlaneRoot!=="https://geomacro-control-plane.daspallab202391.workers.dev")
  throw Error("PHASE2H_PRIVATE_INTAKE_AUTH_REQUIRED");
 let stored=0,duplicates=0,exactFivePart=0,retainedFivePart=0;
 for(let i=0;i<records.length;i+=20){
  const group=records.slice(i,i+20);
  const response=await fetchImpl(controlPlaneRoot+"/v1/internal/phase2h-raw-news",{
   method:"PUT",redirect:"error",cache:"no-store",
   headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
   body:JSON.stringify({schema:"geomacro.phase2h.private-raw-batch.v1",items:group}),
   signal:AbortSignal.timeout(16000),
  });
  if(response.status!==200){
   const data=await response.json().catch(()=>null);
   const reason=typeof data?.reason_code==="string"&&
     /^PHASE2H_PRIVATE_RAW_[A-Z_]{3,90}$/u.test(data.reason_code)
      ?data.reason_code:"PHASE2H_PRIVATE_D1_PERSIST_UNAVAILABLE";
   throw Error(reason);
  }
  const receipt=await response.json();
  if(receipt.ok!==true||receipt.d1_exact_readback_verified!==true||
     receipt.per_original_readback_verified!==true||
     receipt.per_original_verified_count!==group.length||
     !Array.isArray(receipt.per_original_evidence)||
     receipt.per_original_evidence.length!==group.length||
     receipt.accepted+receipt.unchanged!==group.length)
    throw Error("PHASE2H_PRIVATE_D1_READBACK_MISMATCH");
  const expected=new Map(group.map(row=>[row.record_id,row]));
  if(expected.size!==group.length)throw Error("PHASE2H_PRIVATE_DUPLICATE_LOCAL_ID");
  const seen=new Set();
  for(const proof of receipt.per_original_evidence){
   const row=expected.get(proof?.record_id);
   if(!row||seen.has(row.record_id)||
      proof.category!==row.category||
      proof.source_published_at!==row.original.original_published_at||
      proof.date_precision!==row.original.date_precision||
      proof.original_identity_sha256!==sha(JSON.stringify(row.original))||
      !/^[a-f0-9]{64}$/u.test(String(proof.persisted_raw_sha256??""))||
      !/^[a-f0-9]{64}$/u.test(String(proof.persisted_five_part_sha256??""))||
      proof.authenticated_d1_original_and_five_part_verified!==true||
      proof.b2_archived_verified!==false||
      proof.commercial_rights_verified!==false||proof.paid_eligible!==false)
     throw Error("PHASE2H_PRIVATE_PER_ORIGINAL_EVIDENCE_MISMATCH");
   const current=proof.persisted_five_part_sha256===sha(JSON.stringify(row.analysis));
   // If an immutable earlier version is already stored, it still yields an
   // authenticated five-part but must NEVER be claimed byte-identical to
   // a newer projection.
   if(proof.submitted_five_part_exact_readback!==current||
      (current&&proof.persisted_raw_sha256!==row.raw_sha256))
     throw Error("PHASE2H_PRIVATE_FIVE_PART_VERSION_RECEIPT_MISMATCH");
   if(current)exactFivePart++;else retainedFivePart++;
   seen.add(row.record_id);
  }
  if(seen.size!==group.length||
     receipt.all_submitted_five_parts_exact!==(retainedFivePart===0))
    throw Error("PHASE2H_PRIVATE_BATCH_EVIDENCE_INCOMPLETE");
  stored+=receipt.accepted;duplicates+=receipt.unchanged;
 }
 return {stored,duplicate:duplicates,readback_verified:true,
  per_original_readback_verified:true,verified_originals:stored+duplicates,
  submitted_five_part_exact_count:exactFivePart,
  retained_immutable_five_part_count:retainedFivePart};
}
