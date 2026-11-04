/**
 * Website Intelligence -> Risk Gate unverified RAW-INPUT adapter.
 *
 * The underlying raw INPUT is the existing GeoMacro-authored story_json in
 * website_derived_intelligence; it is NOT publisher raw text. We store only a
 * SHA-256 content fingerprint and protected D1 pointer in an additive ledger.
 * No website write, article download, scoring, payment, external exposure,
 * or claim of commercial rights is made by this adapter.
 *
 * The 72h journal contains at most 600 stories. Complete keyset rescans on
 * each scheduled cycle pick up editorial revisions without overwriting any
 * source-native publication clock or duplicating the original journal.
 */
import {verifyDerivedStory} from "./website-derived-intelligence.mjs";

export const WEBSITE_RISK_RAW_LANE="website_intelligence";
export const WEBSITE_RISK_RAW_SCHEMA="geomacro.derived-risk-discovery-bridge.v1";
const LIMIT=100,WINDOW_MS=72*60*60*1000;
const STORY_ID=/^(?:geopolitics|macro|rare_earth)-[0-9a-f]{8}$/u;
const SHA=/^[a-f0-9]{64}$/u;
const ISO=/^20\d{2}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u;
const CATS=new Set(["geopolitics","macro","rare_earth"]);
const answer=(obj,status=200)=>Response.json(obj,{status,headers:{
 "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
 "Referrer-Policy":"no-referrer","X-Robots-Tag":"noindex,nofollow",
}});
const stamp=v=>typeof v==="string"&&ISO.test(v)&&Number.isFinite(Date.parse(v))&&
 new Date(v).toISOString().slice(0,19)===v.slice(0,19);
const hash=async value=>{
 const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
 return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("");
};
const exact=(obj,keys)=>obj&&typeof obj==="object"&&!Array.isArray(obj)&&
 Object.keys(obj).length===keys.length&&keys.every(key=>Object.hasOwn(obj,key));
const cutoffAt=now=>new Date(now-WINDOW_MS).toISOString();
function checkedOriginal(row,now){
 if(!STORY_ID.test(row?.id??"")||!CATS.has(row.category)||
    !row.id.startsWith(row.category+"-")||
    !stamp(row.first_seen_at)||Date.parse(row.first_seen_at)>now+60000||
    row.date_precision!=="day"&&row.date_precision!=="exact"||
    typeof row.story_json!=="string"||row.story_json.length<100||
    row.story_json.length>4096||typeof row.published_at!=="string")
  throw Error("WEBSITE_RISK_RAW_ORIGINAL_INVALID");
 let story;
 try{story=JSON.parse(row.story_json)}catch{
  throw Error("WEBSITE_RISK_RAW_ORIGINAL_INVALID");
 }
 if(story.id!==row.id||story.category!==row.category||
    story.published_at!==row.published_at||
    story.date_precision!==row.date_precision||
    !verifyDerivedStory(story,now)||
    Date.parse(story.published_at)<now-WINDOW_MS||
    Date.parse(row.first_seen_at)<now-WINDOW_MS)
  throw Error("WEBSITE_RISK_RAW_STORY_NOT_CURRENT");
 return story;
}
const signalIdFor=id=>hash(WEBSITE_RISK_RAW_LANE+"\n"+id);
async function sourceRow(row,now){
 checkedOriginal(row,now);
 return {original_ref:await signalIdFor(row.id),
  website_story_id:row.id,
  source_sha:await hash(row.story_json),
  first_seen_at:row.first_seen_at,observed_clock:row.published_at,
  category:row.category,country_iso3:null};
}
export async function websiteRiskRawPage(env,now=Date.now()){
 if(!env?.DB?.prepare||!Number.isFinite(now))
  throw Error("WEBSITE_RISK_RAW_D1_UNAVAILABLE");
 const cutoff=cutoffAt(now);
 const checkpoint=await env.DB.prepare(
  "SELECT cursor_at,cursor_story_id FROM derived_risk_gate_website_raw_cursor WHERE single=1"
 ).first();
 let cursorAt=checkpoint?.cursor_at??cutoff;
 let cursorId=checkpoint?.cursor_story_id??"";
 if(!stamp(cursorAt)||!(cursorId===""||STORY_ID.test(cursorId))||
    Date.parse(cursorAt)>now+60000)
  throw Error("WEBSITE_RISK_RAW_CURSOR_INVALID");
 const gap=Date.parse(cursorAt)<Date.parse(cutoff);
 if(gap){cursorAt=cutoff;cursorId="";}
 // Exactly the existing native-publication + first-seen 72h window.
 // Publisher title/article text is never requested. story_json is read only
 // transiently to attest the actual canonical derived payload.
 const results=await env.DB.prepare(
  "SELECT id,category,published_at,date_precision,story_json,first_seen_at "+
  "FROM website_derived_intelligence WHERE published_at>=? "+
  "AND first_seen_at>=? AND first_seen_at<=? "+
  "AND (first_seen_at>? OR (first_seen_at=? AND id>?)) "+
  "ORDER BY first_seen_at ASC,id ASC LIMIT 101"
 ).bind(cutoff.slice(0,10),cutoff,new Date(now).toISOString(),
   cursorAt,cursorAt,cursorId).all();
 if(!Array.isArray(results?.results)||results.results.length>101)
  throw Error("WEBSITE_RISK_RAW_D1_READ_UNVERIFIED");
 const rows=results.results.slice(0,LIMIT);
 const records=await Promise.all(rows.map(r=>sourceRow(r,now)));
 const last=rows.at(-1);
 const next=last?{cursor_at:last.first_seen_at,cursor_ref:last.id}:null;
 const hasMore=results.results.length>LIMIT;
 const proof=await hash(JSON.stringify({
  lane:WEBSITE_RISK_RAW_LANE,cursorAt,cursorId,next,records,hasMore,
 }));
 return {
  schema:WEBSITE_RISK_RAW_SCHEMA,ok:true,lane:WEBSITE_RISK_RAW_LANE,
  status:"UNVERIFIED_DISCOVERY_ONLY",rights_verified:false,
  publisher_expression_reused:false,original_text_included:false,
  commercialEligible:false,paidDeliveryAuthorized:false,
  source_kind:"GEOMACRO_AUTHORED_WEBSITE_DERIVED_NOT_PUBLISHER_RAW",
  raw_input_source:"CANONICAL_WEBSITE_D1_STORY_JSON_REFERENCE",
  raw_input_exists_in_original_journal:true,
  source_payload_copied_to_new_table:false,
  retention_hours:72,coverage_gap_detected:gap,
  checked_at:new Date(now).toISOString(),records,
  has_more:hasMore,next_cursor:next,page_sha256:proof,
 };
}
export async function websiteRiskRawAck(env,body,now=Date.now()){
 if(!env?.DB?.prepare||!Number.isFinite(now)||
    !exact(body,["schema","lane","page_sha256","next_cursor","reviewed","checked_at"])||
    body.schema!==WEBSITE_RISK_RAW_SCHEMA||
    body.lane!==WEBSITE_RISK_RAW_LANE||
    !SHA.test(body.page_sha256)||!stamp(body.checked_at)||
    Date.parse(body.checked_at)>now+60000||
    now-Date.parse(body.checked_at)>10*60000||
    !Array.isArray(body.reviewed)||body.reviewed.length>LIMIT)
  return answer({ok:false,error:"WEBSITE_RISK_RAW_ACK_INVALID"},400);
 try{
  const when=Date.parse(body.checked_at);
  const page=await websiteRiskRawPage(env,when);
  if(page.page_sha256!==body.page_sha256||
     JSON.stringify(page.next_cursor)!==JSON.stringify(body.next_cursor)||
     page.records.length!==body.reviewed.length||!page.next_cursor)
    return answer({ok:false,error:"WEBSITE_RISK_RAW_ACK_STALE"},409);
  const ids=new Set(),payload=[];
  for(let i=0;i<page.records.length;i++){
   const row=page.records[i],review=body.reviewed[i];
   if(!exact(review,["original_ref","status","commercialEligible"])||
      review.original_ref!==row.original_ref||
      review.status!=="HOLD_SOURCE_ACCESS_OR_EXPRESSION"||
      review.commercialEligible!==false||ids.has(row.original_ref))
    return answer({ok:false,error:"WEBSITE_RISK_RAW_RIGHTS_HOLD_REQUIRED"},400);
   ids.add(row.original_ref);
  }
  // The authenticated page already carries the GeoMacro-owned story ID,
  // not a publisher identifier. One indexed exact-ID SELECT restores only
  // this batch (<=100) without a 600-row scan or external request.
  const storyIds=page.records.map(r=>r.website_story_id);
  if(storyIds.some(id=>!STORY_ID.test(id))||
     new Set(storyIds).size!==storyIds.length)
   throw Error("WEBSITE_RISK_RAW_BAD_STORY_IDENTITIES");
  const websiteRows=await env.DB.prepare(
   "SELECT id,category,published_at,first_seen_at,story_json,date_precision "+
   "FROM website_derived_intelligence WHERE id IN "+
   "(SELECT value FROM json_each(?))"
  ).bind(JSON.stringify(storyIds)).all();
  if(!Array.isArray(websiteRows?.results)||
     websiteRows.results.length!==storyIds.length)
   throw Error("WEBSITE_RISK_RAW_EXACT_ID_LOOKUP_INVALID");
  const sourceByHash=new Map();
  for(const source of websiteRows.results){
   const id=await signalIdFor(source.id);
   if(ids.has(id))sourceByHash.set(id,source);
  }
  if(sourceByHash.size!==page.records.length)
   throw Error("WEBSITE_RISK_RAW_SOURCE_POINTER_MISSING");
  for(const r of page.records){
   const source=sourceByHash.get(r.original_ref);
   checkedOriginal(source,when);
   const same=await sourceRow(source,when);
   if(JSON.stringify(same)!==JSON.stringify(r))
    throw Error("WEBSITE_RISK_RAW_HASH_READBACK_MISMATCH");
   payload.push([r.original_ref,source.id,r.category,r.observed_clock,
    r.first_seen_at,r.source_sha]);
  }
  const created=new Date(now).toISOString();
  // On a completed pass restart next cycle from the first 72h record.
  // This checks amended website-owned story_json even though immutable
  // first_seen_at has not changed. No duplicate rows or invented timestamps.
  const nextAt=page.has_more?page.next_cursor.cursor_at:cutoffAt(when);
  const nextId=page.has_more?page.next_cursor.cursor_ref:"";
  const batch=await env.DB.batch([
   env.DB.prepare(
    "INSERT INTO derived_risk_gate_website_raw_signals ("+
    "signal_id,website_story_id,category,country_iso3,source_clock_at,"+
    "first_seen_at,source_sha256,rights_state,review_status,created_at,updated_at) "+
    "SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]'),"+
    "json_extract(value,'$[2]'),NULL,json_extract(value,'$[3]'),"+
    "json_extract(value,'$[4]'),json_extract(value,'$[5]'),"+
    "'UNVERIFIED_SOURCE_RIGHTS','HOLD_SOURCE_ACCESS_OR_EXPRESSION',?,? "+
    "FROM json_each(?) WHERE 1 ON CONFLICT(signal_id) DO UPDATE SET "+
    "source_sha256=excluded.source_sha256,updated_at=excluded.updated_at,"+
    "rights_state='UNVERIFIED_SOURCE_RIGHTS',"+
    "review_status='HOLD_SOURCE_ACCESS_OR_EXPRESSION' "+
    "WHERE derived_risk_gate_website_raw_signals.source_sha256<>excluded.source_sha256"
   ).bind(created,created,JSON.stringify(payload)),
   env.DB.prepare(
    "INSERT INTO derived_risk_gate_website_raw_cursor "+
    "(single,cursor_at,cursor_story_id,updated_at) VALUES(1,?,?,?) "+
    "ON CONFLICT(single) DO UPDATE SET cursor_at=excluded.cursor_at,"+
    "cursor_story_id=excluded.cursor_story_id,updated_at=excluded.updated_at"
   ).bind(nextAt,nextId,created),
  ]);
  if(!Array.isArray(batch)||batch.some(x=>x?.success===false))
   throw Error("WEBSITE_RISK_RAW_ATOMIC_ACK_FAILED");
  const [verified,cursor]=await Promise.all([
   env.DB.prepare(
    "SELECT signal_id,website_story_id,category,source_clock_at,"+
    "first_seen_at,source_sha256,rights_state,review_status "+
    "FROM derived_risk_gate_website_raw_signals WHERE signal_id IN "+
    "(SELECT json_extract(value,'$[0]') FROM json_each(?))"
   ).bind(JSON.stringify(payload)).all(),
   env.DB.prepare(
    "SELECT cursor_at,cursor_story_id FROM derived_risk_gate_website_raw_cursor WHERE single=1"
   ).first(),
  ]);
  if(!Array.isArray(verified?.results)||
     verified.results.length!==payload.length||
     cursor?.cursor_at!==nextAt||cursor?.cursor_story_id!==nextId||
     payload.some(x=>!verified.results.some(v=>
       v.signal_id===x[0]&&v.website_story_id===x[1]&&
       v.category===x[2]&&v.source_clock_at===x[3]&&
       v.first_seen_at===x[4]&&v.source_sha256===x[5]&&
       v.rights_state==="UNVERIFIED_SOURCE_RIGHTS"&&
       v.review_status==="HOLD_SOURCE_ACCESS_OR_EXPRESSION")))
   throw Error("WEBSITE_RISK_RAW_D1_READBACK_MISMATCH");
  return answer({ok:true,schema:WEBSITE_RISK_RAW_SCHEMA,
   lane:WEBSITE_RISK_RAW_LANE,admitted:payload.length,
   d1_atomic_readback_verified:true,cursor_advanced:true,
   finished_page:true,raw_input_references_stored:true,
   original_journal_unchanged:true,commercialEligible:false,
   paidDeliveryAuthorized:false,original_text_stored:false});
 }catch{
  return answer({ok:false,error:"WEBSITE_RISK_RAW_ACK_UNVERIFIED"},503);
 }
}
export async function websiteRiskRawRead(env,query,now=Date.now()){
 if(!env?.DB?.prepare||!Number.isFinite(now)||![...query.keys()].every(
   k=>k==="view"||k==="signal_id")||query.getAll("signal_id").length!==1||
   query.getAll("view").length!==1||
   !SHA.test(query.get("signal_id")??""))
  return answer({ok:false,error:"WEBSITE_RISK_RAW_LOOKUP_INVALID"},400);
 try{
  const signal=await env.DB.prepare(
   "SELECT website_story_id,category,source_clock_at,first_seen_at,source_sha256 "+
   "FROM derived_risk_gate_website_raw_signals WHERE signal_id=?"
  ).bind(query.get("signal_id")).first();
  if(!signal)return answer({ok:false,error:"WEBSITE_RISK_RAW_NOT_FOUND"},404);
  const source=await env.DB.prepare(
   "SELECT id,category,published_at,date_precision,story_json,first_seen_at "+
   "FROM website_derived_intelligence WHERE id=?"
  ).bind(signal.website_story_id).first();
  if(!source)return answer({ok:false,error:"WEBSITE_RISK_RAW_ORIGIN_EVICTED"},410);
  const original=checkedOriginal(source,now);
  if(await signalIdFor(source.id)!==query.get("signal_id")||
     await hash(source.story_json)!==signal.source_sha256||
     signal.category!==source.category||
     signal.source_clock_at!==source.published_at||
     signal.first_seen_at!==source.first_seen_at)
   return answer({ok:false,error:"WEBSITE_RISK_RAW_REVISION_NOT_REVIEWED"},409);
  // This authenticated raw INPUT contains GeoMacro's own derived fields,
  // never source article body or original publisher HTML. Do NOT give to
  // paid customers or republish sources_credited as commercial source proof.
  return answer({ok:true,schema:"geomacro.risk-gate-website-raw-input.v1",
   status:"UNVERIFIED_GEOMACRO_DERIVED_INPUT",
   source_kind:"WEBSITE_OWN_DERIVED_NOT_PUBLISHER_RAW",
   original_article_redistributed:false,
   commercialEligible:false,paidDeliveryAuthorized:false,
   source_sha256:signal.source_sha256,
   source_published_at:source.published_at,
   first_ingested_at:source.first_seen_at,
   raw_website_intelligence:original});
 }catch{
  return answer({ok:false,error:"WEBSITE_RISK_RAW_LOOKUP_UNAVAILABLE"},503);
 }
}
