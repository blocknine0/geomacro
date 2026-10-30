/** Canonical D1-only private raw-news staging and archived-proof ledger.
 * No public route and no paid/signed eligibility. Records are immutable once
 * accepted. Existing PREDGE, historical and x402 paths are not consulted.
 */
import {phase2hCountry,phase2hCountrySqlHints,phase2hHeadlineCountryCandidate}
 from "../../../scripts/lib/phase2h-country-originals-195.mjs";
const CATEGORIES=new Set(["geopolitics","macro","rare_earth"]);
const HEX=/^[a-f0-9]{64}$/u;
const DATE=/^20\d{2}-\d\d-\d\d(?:T\d\d:\d\d:\d\d(?:\.\d{3})?Z)?$/u;
const safeReply=(value,status=200)=>Response.json(value,{status,headers:{
 "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
 "Referrer-Policy":"no-referrer",
}});
const sha=async value=>{
 const bytes=new TextEncoder().encode(value);
 return [...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))]
  .map(x=>x.toString(16).padStart(2,"0")).join("");
};
const validDate=x=>typeof x==="string"&&DATE.test(x)&&
 Number.isFinite(Date.parse(x))&&new Date(Date.parse(x)).toISOString().slice(0,10)===x.slice(0,10);
const validUrl=x=>{
 try{
  const u=new URL(x);
  return u.protocol==="https:"&&!u.username&&!u.password&&!u.port&&!u.hash&&
    u.hostname.includes(".")&&u.href.length<1800&&
    !/^(?:localhost|127\.|10\.|192\.168\.|169\.254\.)/u.test(u.hostname);
 }catch{return false}
};
const exact=x=>x&&typeof x==="object"&&!Array.isArray(x);
const allowed=(x,keys)=>exact(x)&&Object.keys(x).length===keys.length&&
 keys.every(k=>Object.hasOwn(x,k));
const fail=x=>{throw Error("PHASE2H_PRIVATE_RAW_"+x)};
export async function validPrivateRawNews(row,now=Date.now(),requireRecent=true){
 const root=["schema","record_id","category","original","analysis",
   "commercial_rights_verified","commercial_delivery_authorized",
   "raw_sha256","ingested_at"];
 if(!allowed(row,root)||row.schema!=="geomacro.phase2h.private-raw-observation.v1"||
    !HEX.test(row.record_id)||!HEX.test(row.raw_sha256)||
    !CATEGORIES.has(row.category)||row.commercial_rights_verified!==false||
    row.commercial_delivery_authorized!==false||
    !validDate(row.ingested_at)||Date.parse(row.ingested_at)>now+60_000||
    requireRecent&&now-Date.parse(row.ingested_at)>15*60_000)
  fail("ROOT_INVALID");
 const o=row.original,a=row.analysis;
 if(!allowed(o,["original_source_id","original_url","original_published_at","date_precision",
   "original_title","original_content","content_scope","full_article_html_collected",
   "original_article_license_verified","source_credit"])||
   typeof o.original_source_id!=="string"||o.original_source_id.length>110||
   !validUrl(o.original_url)||!validDate(o.original_published_at)||
   Date.parse(o.original_published_at)>now+60_000||
   o.date_precision!==(o.original_published_at.length===10?"day":"exact")||
   typeof o.original_title!=="string"||o.original_title.length<1||
   o.original_title.length>260||/[<>]/u.test(o.original_title)||
   !["OPEN_LICENSE_FEED_DESCRIPTION_WHEN_PRESENT","ORIGINAL_FEED_METADATA_ONLY"]
      .includes(o.content_scope)||
   o.full_article_html_collected!==false||o.original_article_license_verified!==false||
   !(o.original_content===null||typeof o.original_content==="string"&&
      o.original_content.length<=900&&!/[<>]/u.test(o.original_content))||
   o.content_scope==="ORIGINAL_FEED_METADATA_ONLY"&&o.original_content!==null||
   !(o.source_credit===null||typeof o.source_credit==="string"&&o.source_credit.length<=250))
  fail("ORIGINAL_SCOPE_INVALID");
 const id=await sha(row.category+"\n"+o.original_url+"\n"+o.original_published_at);
 if(row.record_id!==id)fail("ORIGINAL_ID_MISMATCH");
 if(!allowed(a,["schema","what_happened","why_it_matters","market_relevance",
   "what_to_watch","evidence_and_confidence"])||
    a.schema!=="geomacro.phase2h.private-five-part.v1"||
    a.what_happened?.original_observation_id!==id||
    !(a.what_happened.text===null||typeof a.what_happened.text==="string"&&
      a.what_happened.text.length<=1200)||
    a.why_it_matters?.independently_verified!==false||
    !(a.why_it_matters.text===null||typeof a.why_it_matters.text==="string"&&
      a.why_it_matters.text.length<=1200)||
    !allowed(a.market_relevance,["potential_watch_channels","observed_market_reaction_verified",
      "confirmed_instruments","price_direction","price_change"])||
    !Array.isArray(a.market_relevance?.potential_watch_channels)||
    a.market_relevance.potential_watch_channels.length>4||
    a.market_relevance.potential_watch_channels.some(v=>![
      "rates_and_bonds","fx_and_payments","trade_and_logistics","mineral_supply_chain"
    ].includes(v))||
    new Set(a.market_relevance.potential_watch_channels).size!==
      a.market_relevance.potential_watch_channels.length||
    !Array.isArray(a.market_relevance.confirmed_instruments)||
    a.market_relevance.confirmed_instruments.length!==0||
    a.market_relevance?.observed_market_reaction_verified!==false||
    a.market_relevance?.price_direction!==null||a.market_relevance?.price_change!==null||
    !allowed(a.what_to_watch,["event_topic","trigger","confirmed_followup_at"])||
    !(a.what_to_watch.event_topic===null||
      typeof a.what_to_watch.event_topic==="string"&&a.what_to_watch.event_topic.length<=120)||
    a.what_to_watch.trigger!=="NEXT_ORIGINAL_RELEASE_OR_INDEPENDENT_CONFIRMATION"||
    a.what_to_watch?.confirmed_followup_at!==null||
    !allowed(a.evidence_and_confidence,[
      "original_observation_id","source_published_at","date_precision",
      "observed_feed_title_available","original_article_page_verified",
      "independent_event_verified","commercial_rights_verified",
      "paid_eligible","source_content_identity_sha256"])||
    a.evidence_and_confidence.observed_feed_title_available!==true||
    !HEX.test(a.evidence_and_confidence.source_content_identity_sha256)||
    /https?:\/\/|[<>]/iu.test(
      String(a.what_happened.text??"")+" "+String(a.why_it_matters.text??""))||

    a.evidence_and_confidence?.original_observation_id!==id||
    a.evidence_and_confidence?.source_published_at!==o.original_published_at||
    a.evidence_and_confidence?.date_precision!==o.date_precision||
    a.evidence_and_confidence?.original_article_page_verified!==false||
    a.evidence_and_confidence?.independent_event_verified!==false||
    a.evidence_and_confidence?.commercial_rights_verified!==false||
    a.evidence_and_confidence?.paid_eligible!==false)
   fail("FIVE_PART_EVIDENCE_INVALID");
 const immutable={schema:row.schema,record_id:row.record_id,
  category:row.category,original:o,analysis:a,
  commercial_rights_verified:false,commercial_delivery_authorized:false};
 if(await sha(JSON.stringify(immutable))!==row.raw_sha256)
   fail("RAW_SHA256_MISMATCH");
 const raw=JSON.stringify(row);
 if(raw.length>11500||raw.length<300)fail("RAW_BYTES_INVALID");
 return raw;
}
export async function phase2hPrivateRawPut(env,body,now=Date.now()){
 if(!env?.DB||!exact(body)||body.schema!=="geomacro.phase2h.private-raw-batch.v1"||
  !Array.isArray(body.items)||body.items.length<1||body.items.length>20)
  return safeReply({ok:false,error:"PRIVATE_RAW_BATCH_INVALID"},400);
 try{
  const ids=new Set(),items=[];
  for(const row of body.items){
   const json=await validPrivateRawNews(row,now);
   if(ids.has(row.record_id))fail("DUPLICATE_BATCH_ID");
   ids.add(row.record_id);
   items.push([row.record_id,row.category,row.original.original_published_at,
    row.ingested_at,row.raw_sha256,json]);
  }
  const placeholders=items.map(()=>"?").join(",");
  const before=await env.DB.prepare("SELECT record_id,raw_sha256,first_ingested_at,raw_json FROM phase2h_private_raw_news WHERE record_id IN ("+placeholders+")").bind(...ids).all();
  if(!Array.isArray(before.results))fail("BEFORE_READ_UNAVAILABLE");
  const prior=new Map(before.results.map(x=>[x.record_id,x]));
  if(prior.size!==before.results.length)fail("BEFORE_DUPLICATE");
  for(const x of items){
   const existing=prior.get(x[0]);
   if(!existing||existing.raw_sha256===x[4])continue;
   // The immutable original can be re-observed after a new five-part
   // projector version ships. Never overwrite a B2-backed old row merely
   // because its derived editorial wording changed. Genuine publisher
   // revisions with the same native ID still fail closed.
   let saved,incoming;
   try{saved=JSON.parse(existing.raw_json);incoming=JSON.parse(x[5])}
   catch{fail("CANONICAL_PRIOR_ROW_CORRUPT")}
   if(saved?.record_id!==x[0]||saved?.raw_sha256!==existing.raw_sha256||
      saved?.category!==incoming.category||
      JSON.stringify(saved.original)!==JSON.stringify(incoming.original)||
      saved?.original?.original_published_at!==x[2])
    fail("IDENTITY_COLLISION");
  }
  const insert=await env.DB.prepare(
   "INSERT INTO phase2h_private_raw_news(record_id,category,original_published_at,first_ingested_at,raw_sha256,raw_json) "+
   "SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]'),json_extract(value,'$[2]'),"+
   "json_extract(value,'$[3]'),json_extract(value,'$[4]'),json_extract(value,'$[5]') "+
   "FROM json_each(?) WHERE 1 ON CONFLICT(record_id) DO NOTHING"
  ).bind(JSON.stringify(items)).run();
  if(insert?.success===false)fail("INSERT_FAILED");
  const after=await env.DB.prepare("SELECT record_id,raw_sha256,first_ingested_at FROM phase2h_private_raw_news WHERE record_id IN ("+placeholders+")").bind(...ids).all();
  const found=new Map((after.results??[]).map(x=>[x.record_id,x]));
  if(found.size!==items.length)fail("AFTER_READ_MISSING");
  for(const x of items){
   const r=found.get(x[0]);
   const previous=prior.get(x[0]);
   if(r.raw_sha256!==(previous?.raw_sha256??x[4])||
      previous&&r.first_ingested_at!==previous.first_ingested_at)
    fail("AFTER_READ_DIVERGED");
  }
  return safeReply({ok:true,schema:"geomacro.phase2h.private-d1-receipt.v1",
   accepted:items.length-prior.size,unchanged:prior.size,
   d1_exact_readback_verified:true,duplicate_new_records:0,rights_verified:false,
   payments:0,original_clocks_preserved:true});
 }catch(error){
  // Protected caller receives only a finite diagnostic enum; never the
  // original title, URL, free-text, SQL, source evidence, secrets or payload.
  const reason=error instanceof Error&&
    /^PHASE2H_PRIVATE_RAW_[A-Z_]{3,90}$/u.test(error.message)
     ?error.message:"PHASE2H_PRIVATE_RAW_D1_OR_READBACK_FAILED";
  return safeReply({ok:false,error:"PRIVATE_RAW_D1_WRITE_OR_READBACK_UNVERIFIED",
   reason_code:reason,rights_verified:false,payments:0},503);
 }
}
// Only a B2-acknowledged original can enter question-bound delivery. D1 staging
// alone is not durable archive proof. This is an authenticated internal path;
// unlicensed originals and source identity never become a customer response.
const QUESTION_STOP=new Set(["what","why","when","where","which","who","how",
 "does","did","do","is","are","the","a","an","to","of","for","with","in",
 "on","this","that","about","matter","matters","affect","impact","impacts",
 "happened","happen","news","latest","update","market","markets","trader",
 "trading","please","tell","explain","next"]);
export function phase2hQuestionMatchesArchived(item,question){
 if(typeof question!=="string"||!item?.analysis||!item?.original)return false;
 const terms=[...new Set((question.normalize("NFKC").toLowerCase()
   .match(/[\p{L}\p{N}]{3,}/gu)??[]).filter(x=>!QUESTION_STOP.has(x)))].slice(0,12);
 if(!terms.length)return false;
 const scope=[item.category,item.original.original_title,
   item.analysis.what_happened?.text,item.analysis.why_it_matters?.text,
   item.analysis.what_to_watch?.event_topic].filter(x=>typeof x==="string")
   .join(" ").normalize("NFKC").toLowerCase();
 return terms.every(t=>scope.includes(t));
}
export function phase2hQuestionDirectAnswer(question,analysis){
 const q=String(question??"").toLowerCase();
 const focus=/\b(?:what next|follow.?up|watch next|upcoming)\b|পরবর্তী|আগামী|अगला/u.test(q)
  ?"what_to_watch":
  /\b(?:market|trading|trader|fx|commodity|commodities|bonds?)\b|বাজার|मार्केट/u.test(q)
  ?"market_relevance":
  /\b(?:why|impact|matter|affect|consequence)\b|কেন|প্রভাব|क्यों/u.test(q)
  ?"why_it_matters":"what_happened";
 const selected=analysis?.[focus];
 return {focus,direct_answer:typeof selected?.text==="string"?selected.text:
   focus==="what_to_watch"?selected?.trigger??null:null};
}
export async function phase2hPrivateRawGet(env,params=new URLSearchParams(),now=Date.now()){
 if(!env?.DB||[...params.keys()].some(k=>!["archived","limit","question","record_id","country_iso3","category"].includes(k))||
   params.getAll("archived").length>1||params.getAll("limit").length>1||
   params.getAll("question").length>1||params.getAll("record_id").length>1||
   params.getAll("country_iso3").length>1||params.getAll("category").length>1)
  return safeReply({ok:false,error:"PRIVATE_RAW_QUERY_INVALID"},400);
 const question=params.get("question");
 const requestedId=params.get("record_id");
 const countryIso3=params.get("country_iso3"),category=params.get("category");
 const countryScoped=countryIso3!==null||category!==null;
 if(countryScoped&&(question===null||requestedId!==null||
   !phase2hCountry(countryIso3)||!CATEGORIES.has(category)))
  return safeReply({ok:false,error:"PRIVATE_RAW_QUERY_INVALID"},400);
 if(params.has("archived")||
   requestedId!==null&&(!HEX.test(requestedId)||question===null)||
   question!==null&&(question.length<3||question.length>180||/[<>]/u.test(question)))
  return safeReply({ok:false,error:"PRIVATE_RAW_QUERY_INVALID"},400);
 const limit=Number(params.get("limit")??"40");
 if(!Number.isSafeInteger(limit)||limit<1||limit>100||question!==null&&params.has("archived"))
  return safeReply({ok:false,error:"PRIVATE_RAW_QUERY_INVALID"},400);
 try{
  // Query a country/category using original headline hints, not publisher
  // location. This is a SQL prefilter only: the 195-state unambiguous country
  // resolver validates every result. A positive LIKE is NEVER attribution.
  // Index-friendly category/time ordering remains bounded; no full-table
  // row download or 585-query fanout per customer request.
  let countryQuery=null;
  if(countryScoped){
   const hints=phase2hCountrySqlHints(countryIso3);
   if(!hints.length)return safeReply({ok:false,error:"PRIVATE_RAW_QUERY_INVALID"},400);
   const predicate=hints.map(()=>
    "lower(json_extract(raw_json,'$.original.original_title')) LIKE ? ESCAPE '!'")
     .join(" OR ");
   countryQuery=env.DB.prepare(
    "SELECT record_id,category,raw_sha256,raw_json,b2_object_sha256 "+
    "FROM phase2h_private_raw_news WHERE category=? AND "+
    "b2_object_sha256 IS NOT NULL AND ("+predicate+") "+
    "ORDER BY original_published_at DESC,record_id LIMIT 100"
   ).bind(category,...hints.map(x=>"%"+x+"%"));
  }
  const results=countryQuery?
    await countryQuery.all():
    question===null?
    await env.DB.prepare("SELECT record_id,category,raw_sha256,raw_json FROM phase2h_private_raw_news WHERE b2_object_sha256 IS NULL ORDER BY first_ingested_at,record_id LIMIT ?").bind(limit).all():
    requestedId!==null?
      await env.DB.prepare("SELECT record_id,category,raw_sha256,raw_json,b2_object_sha256 FROM phase2h_private_raw_news WHERE record_id=? AND b2_object_sha256 IS NOT NULL LIMIT 1").bind(requestedId).all():
      await env.DB.prepare("SELECT record_id,category,raw_sha256,raw_json,b2_object_sha256 FROM phase2h_private_raw_news WHERE b2_object_sha256 IS NOT NULL ORDER BY original_published_at DESC,record_id LIMIT 100").all();
  if(!Array.isArray(results.results))throw Error();
  const items=results.results.map(r=>JSON.parse(r.raw_json));
  for(let i=0;i<items.length;i++){
   if(items[i].record_id!==results.results[i].record_id||
      items[i].raw_sha256!==results.results[i].raw_sha256)
    throw Error();
   await validPrivateRawNews(items[i],now,false);
  }
  if(question===null)return safeReply({ok:true,schema:"geomacro.phase2h.private-pending-archive.v1",
   rows:items,complete:items.length<limit,paid_eligible:false,raw_public_delivery:false});
  const matched=items.filter(item=>requestedId!==null?
    item.record_id===requestedId:
    (!countryScoped||item.category===category&&
      phase2hHeadlineCountryCandidate(item.original.original_title)===countryIso3)&&
      phase2hQuestionMatchesArchived(item,question)).slice(0,3);
  return safeReply({ok:true,schema:"geomacro.phase2h.private-question-fivepart.v1",
   source:"B2_ACKNOWLEDGED_PRIVATE_ORIGINAL_D1",
   bounded_most_recent_scan:requestedId!==null?1:100,
   ...(countryScoped?{requested_country_iso3:countryIso3,
    requested_category:category,
    country_attribution_basis:"UNAMBIGUOUS_ORIGINAL_HEADLINE_CANDIDATE",
    country_event_independently_verified:false}:{}),
   global_search_complete:false,
   question_matches:matched.map(item=>({record_id:item.record_id,
    category:item.category,
    ...(countryScoped?{country_iso3:countryIso3}:{}),
    original_published_at:item.original.original_published_at,
    five_part:item.analysis,...phase2hQuestionDirectAnswer(question,item.analysis),
    archive_d1_ack_present:true})),private_research_only:true,chargeable:false,
   paid_eligible:false,raw_original_not_delivered:true});
 }catch{return safeReply({ok:false,error:"PRIVATE_RAW_CANONICAL_READ_UNAVAILABLE"},503)}
}
export async function phase2hPrivateRawMarkArchived(env,body,now=Date.now()){
 if(!env?.DB||body?.schema!=="geomacro.phase2h.b2-archive-ack.v1"||
    !HEX.test(body.object_sha256)||!Array.isArray(body.items)||
    body.items.length<1||body.items.length>100)
  return safeReply({ok:false,error:"PRIVATE_ARCHIVE_PROOF_INVALID"},400);
 try{
  const ids=new Set(),rows=[];
  for(const item of body.items){
   if(!HEX.test(item?.record_id)||!HEX.test(item?.raw_sha256)||
      ids.has(item.record_id))throw Error();
   ids.add(item.record_id);rows.push(item);
  }
  const placeholders=rows.map(()=>"?").join(",");
  const before=await env.DB.prepare("SELECT record_id,raw_sha256,b2_object_sha256 FROM phase2h_private_raw_news WHERE record_id IN ("+placeholders+")").bind(...ids).all();
  if(before.results?.length!==rows.length)throw Error();
  const map=new Map(before.results.map(x=>[x.record_id,x]));
  if(map.size!==rows.length||rows.some(x=>map.get(x.record_id)?.raw_sha256!==x.raw_sha256||
    map.get(x.record_id)?.b2_object_sha256!==null))throw Error();
  const result=await env.DB.prepare("UPDATE phase2h_private_raw_news SET b2_object_sha256=?,b2_archived_at=? WHERE record_id IN ("+placeholders+") AND b2_object_sha256 IS NULL")
   .bind(body.object_sha256,new Date(now).toISOString(),...ids).run();
  if(result?.success===false)throw Error();
  const after=await env.DB.prepare("SELECT record_id,b2_object_sha256 FROM phase2h_private_raw_news WHERE record_id IN ("+placeholders+")").bind(...ids).all();
  if(after.results?.length!==rows.length||
     after.results.some(x=>x.b2_object_sha256!==body.object_sha256))throw Error();
  return safeReply({ok:true,archived:rows.length,independent_d1_archive_ack_verified:true,
    rights_verified:false,payments:0});
 }catch{return safeReply({ok:false,error:"PRIVATE_ARCHIVE_ACK_READBACK_UNVERIFIED"},503)}
}