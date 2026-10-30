import {p0aAuditOriginal} from "../../../scripts/lib/p0a-evidence-quality.mjs";
import {p0bProjectEvidenceBounded} from "../../../scripts/lib/p0b-event-grounded-projection.mjs";
import {p0bGlobalNewsFallback} from "../../../scripts/lib/p0b-live-global-search.mjs";
/** Canonical D1-only private raw-news staging and archived-proof ledger.
 * No public route and no paid/signed eligibility. Records are immutable once
 * accepted. Existing PREDGE, historical and x402 paths are not consulted.
 */
import {phase2hCountry,phase2hCountrySqlHints,phase2hHeadlineCountryCandidate}
 from "../../../scripts/lib/phase2h-country-originals-195.mjs";
import {phase2hNewsCutoff,phase2hRawWithinRetention}
 from "../../../scripts/lib/phase2h-retention-72h.mjs";
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
   if(!phase2hRawWithinRetention(row,now))fail("ORIGINAL_72H_EXPIRED");
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
  // Per-original authenticated live evidence: read *the persisted original
  // and all five structured fields*, not only record_id/hash columns. This
  // uses the SAME existing D1 SELECT, no added provider/B2 GET or new table.
  // Older immutable projector versions remain intact and are disclosed as
  // already-stored, never reported as the newly submitted five-part wording.
  const after=await env.DB.prepare("SELECT record_id,raw_sha256,first_ingested_at,raw_json FROM phase2h_private_raw_news WHERE record_id IN ("+placeholders+")").bind(...ids).all();
  if(!Array.isArray(after?.results)||after.results.length!==items.length)
    fail("AFTER_READ_MISSING");
  const found=new Map(after.results.map(x=>[x.record_id,x]));
  if(found.size!==items.length)fail("AFTER_READ_DUPLICATE");
  const perOriginal=[];
  for(const x of items){
   const r=found.get(x[0]);
   const previous=prior.get(x[0]);
   if(!r||r.raw_sha256!==(previous?.raw_sha256??x[4])||
      r.first_ingested_at!==(previous?.first_ingested_at??x[3]))
    fail("AFTER_READ_DIVERGED");
   let persisted,incoming;
   try{persisted=JSON.parse(r.raw_json);incoming=JSON.parse(x[5])}
   catch{fail("AFTER_JSON_UNAVAILABLE")}
   // Full immutable record/hash, original native date and full five-part
   // structural contract are independently recomputed from D1 readback.
   if(await validPrivateRawNews(persisted,now,false)!==r.raw_json||
      persisted.raw_sha256!==r.raw_sha256||
      persisted.record_id!==x[0]||
      persisted.category!==x[1]||
      persisted.original.original_published_at!==x[2]||
      persisted.ingested_at!==r.first_ingested_at||
      JSON.stringify(persisted.original)!==JSON.stringify(incoming.original))
    fail("AFTER_ORIGINAL_OR_ANALYSIS_DIVERGED");
   const exactCurrentFivePart=JSON.stringify(persisted.analysis)===
     JSON.stringify(incoming.analysis);
   perOriginal.push({
    record_id:x[0],category:x[1],
    source_published_at:x[2],date_precision:persisted.original.date_precision,
    persisted_raw_sha256:r.raw_sha256,
    original_identity_sha256:await sha(JSON.stringify(persisted.original)),
    persisted_five_part_sha256:await sha(JSON.stringify(persisted.analysis)),
    submitted_five_part_exact_readback:exactCurrentFivePart,
    authenticated_d1_original_and_five_part_verified:true,
    b2_archived_verified:false,commercial_rights_verified:false,
    paid_eligible:false,
   });
  }
  perOriginal.sort((a,b)=>a.record_id.localeCompare(b.record_id));
  return safeReply({ok:true,schema:"geomacro.phase2h.private-d1-receipt.v1",
   accepted:items.length-prior.size,unchanged:prior.size,
   d1_exact_readback_verified:true,
   per_original_readback_verified:true,
   per_original_verified_count:perOriginal.length,
   all_submitted_five_parts_exact:perOriginal.every(x=>x.submitted_five_part_exact_readback),
   per_original_evidence:perOriginal,
   duplicate_new_records:0,rights_verified:false,
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
// B2-acknowledged originals remain mandatory for legacy archived-only lookup.
// An explicit canonical country/category can additionally project D1-staged
// originals for authenticated PRIVATE RESEARCH ONLY, never paid/archive proof.
// Unlicensed originals and source identity never become a customer response.
const QUESTION_STOP=new Set(["what","why","when","where","which","who","how",
 "does","did","do","is","are","the","a","an","to","of","for","with","in",
 "on","this","that","about","matter","matters","affect","impact","impacts",
 "happened","happen","news","latest","update","market","markets","trader",
 "trading","please","tell","explain","next"]);
/** Bounded, user-question-specific retrieval hints for canonical D1.
 * Country names and generic question words are NOT topical evidence; retain
 * years and actual release/topic terms so an older archived article can win
 * over 100 newer same-country articles. These hints only prefilter: every
 * returned row must still pass the immutable original-country and exact
 * question matcher below. No parameter ever interpolates into SQL text.
 */
export function phase2hQuestionTopicHints(question,countryIso3){
 if(typeof question!=="string"||question.length>180||
    !phase2hCountry(countryIso3))return [];
 const countryWords=new Set(phase2hCountrySqlHints(countryIso3)
  .flatMap(name=>name.match(/[\p{L}\p{N}]{3,}/gu)??[]));
 const tokens=question.normalize("NFKC").toLocaleLowerCase("en")
  .match(/[\p{L}\p{N}]{3,}/gu)??[];
 return [...new Set(tokens.filter(term=>term.length<=40&&
   !QUESTION_STOP.has(term)&&!countryWords.has(term)))].slice(0,8);
}
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
/** Do not mutate the immutable source record or its B2/D1 SHA.
 * A single native-dated publisher headline may produce a *private, unverified*
 * five-part research draft when the original stateless event parser emitted
 * null what/why. Never claim page verification, market reaction or paid rights.
 */
export function phase2hOneOriginalResearchFivePart(item,enableP0B=false){
 if(typeof item?.original?.original_title!=="string"||
    item.original.original_title.length<1||
    typeof item?.original?.original_published_at!=="string"||
    !CATEGORIES.has(item.category)||!item.analysis)return null;
 if(enableP0B){
  const modern=p0bProjectEvidenceBounded(item);
  if(modern)return modern;
 }
 const audit=p0aAuditOriginal(item);
 const reasons=new Set(audit.reasons);
 const assertedUnsupported=["UNSOURCED_QUANTITATIVE_CLAIM","UNSUPPORTED_CERTAINTY",
  "UNVERIFIED_MARKET_CLAIM","EVIDENCE_PROVENANCE_MISMATCH"];
 const unsafe=assertedUnsupported.some(reason=>reasons.has(reason));
 const whatOK=!unsafe&&!(reasons.has("WHAT_MISSING")||reasons.has("WHAT_BOILERPLATE"))&&
  !reasons.has("WHAT_LACKS_SOURCE_FACT_ANCHORS");
 const whyOK=!unsafe&&!(reasons.has("WHY_MISSING")||reasons.has("WHY_BOILERPLATE"))&&
  !reasons.has("WHY_LACKS_EVENT_ANCHORS")&&
  !reasons.has("WHAT_WHY_IDENTICAL");
 // No publisher headline copy as a substitute for factual extraction.
 // Missing proof must remain null, and no immutable D1/B2 byte is rewritten.
 return Object.freeze({...item.analysis,
  what_happened:{...item.analysis.what_happened,
    text:whatOK?item.analysis.what_happened.text:null},
  why_it_matters:{...item.analysis.why_it_matters,
    text:whyOK&&whatOK?item.analysis.why_it_matters.text:null},
 });
}
export function phase2hPrivateResearchDirectAnswer(question,fivePart){
 const answer=phase2hQuestionDirectAnswer(question,fivePart);
 if(answer.focus!=="market_relevance"||answer.direct_answer!==null)
  return answer;
 const channels=fivePart.market_relevance?.potential_watch_channels??[];
 return {...answer,direct_answer:channels.length?
  "Potential monitoring channels: "+channels.join(", ")+
   ". No market price move, direction or instrument response is independently verified.":
  "No market-reaction channel or price response is independently verified from this original headline."};
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
 if(!env?.DB||[...params.keys()].some(k=>!["archived","limit","question","record_id","country_iso3","category","p0a_probe"].includes(k))||
   params.getAll("archived").length>1||params.getAll("limit").length>1||
   params.getAll("question").length>1||params.getAll("record_id").length>1||
   params.getAll("country_iso3").length>1||params.getAll("category").length>1||
   params.getAll("p0a_probe").length>1)
  return safeReply({ok:false,error:"PRIVATE_RAW_QUERY_INVALID"},400);
 const question=params.get("question");
 const requestedId=params.get("record_id");
 const qualityProbe=params.get("p0a_probe")==="1";
 const countryIso3=params.get("country_iso3"),category=params.get("category");
 const countryScoped=countryIso3!==null||category!==null;
 if(countryScoped&&(question===null||requestedId!==null||
   !phase2hCountry(countryIso3)||!CATEGORIES.has(category)))
  return safeReply({ok:false,error:"PRIVATE_RAW_QUERY_INVALID"},400);
 if(params.has("archived")||
   params.has("p0a_probe")&&(!qualityProbe||requestedId===null||countryScoped)||
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
  // A first canonical D1-staged original can support internal research even
  // while B2 archive is pending. It NEVER qualifies for paid delivery.
  // Single bounded SQL query scores topical headline matches before date:
  // old relevant event-specific originals are not automatically displaced by
  // the newest 100 unrelated releases. No 585-query fanout per request.
  let countryQuery=null;
  const cutoff=phase2hNewsCutoff(now);
  if(countryScoped){
   const hints=phase2hCountrySqlHints(countryIso3);
   if(!hints.length)return safeReply({ok:false,error:"PRIVATE_RAW_QUERY_INVALID"},400);
   // Keep the entire SQL static: only bounded, reviewed country hints are
   // passed as JSON parameters. No dynamic SQL fragments from any question,
   // country name, source title or JSON field.
   const topics=phase2hQuestionTopicHints(question,countryIso3);
   const topicJson=JSON.stringify(topics);
   countryQuery=env.DB.prepare(
    "SELECT r.record_id,r.category,r.raw_sha256,r.raw_json,r.b2_object_sha256 "+
    "FROM phase2h_private_raw_news AS r WHERE r.category=? "+
    "AND r.first_ingested_at>? "+
    "AND EXISTS (SELECT 1 FROM json_each(?) AS h WHERE "+
    "lower(json_extract(r.raw_json,'$.original.original_title')) "+
    "LIKE '%' || h.value || '%' ESCAPE '!') "+
    "AND (json_array_length(?)=0 OR EXISTS "+
    "(SELECT 1 FROM json_each(?) AS t WHERE "+
    "lower(json_extract(r.raw_json,'$.original.original_title')) "+
    "LIKE '%' || t.value || '%' ESCAPE '!')) "+
    "ORDER BY (SELECT COUNT(*) FROM json_each(?) AS score "+
    "WHERE lower(json_extract(r.raw_json,'$.original.original_title')) "+
    "LIKE '%' || score.value || '%' ESCAPE '!') DESC,"+
    "r.original_published_at DESC,r.record_id LIMIT 100"
   ).bind(category,cutoff,JSON.stringify(hints),topicJson,topicJson,topicJson);
  }
  const results=countryQuery?
    await countryQuery.all():
    question===null?
    await env.DB.prepare("SELECT record_id,category,raw_sha256,raw_json FROM phase2h_private_raw_news WHERE b2_object_sha256 IS NULL AND first_ingested_at>? ORDER BY first_ingested_at,record_id LIMIT ?").bind(cutoff,limit).all():
    requestedId!==null?
      await env.DB.prepare("SELECT record_id,category,raw_sha256,raw_json,b2_object_sha256 FROM phase2h_private_raw_news WHERE record_id=? AND "+
         (qualityProbe?"1=1":"b2_object_sha256 IS NOT NULL")+" AND first_ingested_at>? LIMIT 1").bind(requestedId,cutoff).all():
      await env.DB.prepare("SELECT record_id,category,raw_sha256,raw_json,b2_object_sha256 FROM phase2h_private_raw_news WHERE b2_object_sha256 IS NOT NULL AND first_ingested_at>? ORDER BY original_published_at DESC,record_id LIMIT 100").bind(cutoff).all();
  if(!Array.isArray(results.results))throw Error();
  // Read-path TTL is enforced independently of scheduled deletion failures:
  // no older-than-72h original is exposed to private research or B2 ingestion.
  const active=results.results.filter(r=>{
   if(typeof r.raw_json!=="string")return false;
   try{return phase2hRawWithinRetention(JSON.parse(r.raw_json),now)}
   catch{return false}
  });
  const items=active.map(r=>JSON.parse(r.raw_json));
  for(let i=0;i<items.length;i++){
   if(items[i].record_id!==active[i].record_id||
      items[i].raw_sha256!==active[i].raw_sha256)
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
  const p0bEnabled=env.GEOMACRO_P0B_SOURCE_FIRST_ENABLED==="1";
  const hasGrounded=matched.some(item=>{
   const derived=phase2hOneOriginalResearchFivePart(item,p0bEnabled);
   return derived&&p0aAuditOriginal({...item,analysis:derived}).status==="PASS";
  });
  let globalResult=null;
  if(countryScoped&&p0bEnabled&&!qualityProbe&&!hasGrounded){
   try{globalResult=await p0bGlobalNewsFallback({
    question,countryIso3,category,now});}
   catch{globalResult={status:"GLOBAL_PROVIDER_UNAVAILABLE",attempted:true,
    first_party_matches:[],gdelt_discovery_count:0,provider_errors:1,
    exhaustive_global_search:false,
    provider_diagnostics:{govuk:"NETWORK_TIMEOUT_OR_EGRESS",gdelt:"NETWORK_TIMEOUT_OR_EGRESS"}};}
  }
  return safeReply({ok:true,schema:"geomacro.phase2h.private-question-fivepart.v1",
   source:globalResult?.first_party_matches?.length?
    "CANONICAL_D1_WITH_FIRST_PARTY_LIVE_FALLBACK":
    qualityProbe?"CANONICAL_D1_PRIVATE_P0A_QUALITY_READBACK":
    countryScoped?"CANONICAL_D1_PRIVATE_ORIGINAL_RESEARCH":
    "B2_ACKNOWLEDGED_PRIVATE_ORIGINAL_D1",
   bounded_most_recent_scan:requestedId!==null?1:100,
   ...(countryScoped?{requested_country_iso3:countryIso3,
    requested_category:category,
    country_attribution_basis:"UNAMBIGUOUS_ORIGINAL_HEADLINE_CANDIDATE",
    country_event_independently_verified:false,
    d1_staged_unarchived_research_allowed:true,
    staged_row_never_paid_eligible:true}:{}),
   global_search_complete:false,
   global_search_attempted:globalResult?.attempted===true,
   global_fallback_status:globalResult?.status??"NOT_REQUIRED_OR_DISABLED",
   global_discovery_only_count:globalResult?.gdelt_discovery_count??0,
   global_provider_error_count:globalResult?.provider_errors??0,
   global_provider_diagnostics:globalResult?.provider_diagnostics??null,
   global_first_party_verified_count:globalResult?.first_party_matches?.length??0,
   // Prefer a verified publisher-metadata fallback over an incomplete
   // canonical original; never force clients to select a null first result.
   question_matches:[...(globalResult?.first_party_matches??[]).map(item=>({
    ...item,country_iso3:countryIso3,source:"GOV_UK_FIRST_PARTY_CONTENT_API",
    ...phase2hPrivateResearchDirectAnswer(question,item.five_part),
   })),...matched.map(item=>{
    const missing=typeof item.analysis.what_happened?.text!=="string"||
      !item.analysis.what_happened.text.trim()||
      typeof item.analysis.why_it_matters?.text!=="string"||
      !item.analysis.why_it_matters.text.trim();
    const five=countryScoped||qualityProbe?
      phase2hOneOriginalResearchFivePart(item,p0bEnabled):item.analysis;
    return {record_id:item.record_id,category:item.category,
     ...(countryScoped?{country_iso3:countryIso3}:{}),
     ...(countryScoped||qualityProbe?{
       source_title_only_research_fallback_used:false,
        p0a_evidence_limited:p0aAuditOriginal({...item,analysis:five}).status!=="PASS",
       original_page_independently_verified:false,
       commercial_rights_verified:false}:{}),
     original_published_at:item.original.original_published_at,
     five_part:five,...(countryScoped||qualityProbe?
       phase2hPrivateResearchDirectAnswer(question,five):
       phase2hQuestionDirectAnswer(question,five)),
     archive_d1_ack_present:active.find(
       x=>x.record_id===item.record_id)?.b2_object_sha256!=null};
   })],private_research_only:true,chargeable:false,
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