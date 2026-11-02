/**
 * Quota-bounded independent article-page evidence screening.
 * Bounded on purpose: a native RSS permalink is NOT a verified event.
 * Strong route evidence requires an article-body route/action/IMO co-mention,
 * with the same specific vessel IMO, corridor and action from another issuer.
 * Earliest native publisher release is the operational reference event clock,
 * NOT a verified physical occurrence time. Raw source material is used transiently
 * to derive structured facts, never directly republished or stored.
 * Publisher article bodies are processed ephemerally, NEVER persisted/logged.
 */
import {createHash} from "node:crypto";
import {DIRECT_GLOBAL_CORRIDOR_SOURCES} from "./direct-global-corridor-sources.mjs";

const MAX_BYTES=160*1024,MAX_PER_RUN=24,MAX_CONCURRENCY=3,WINDOW_MS=72*3600000;
const FEEDS=new Map(DIRECT_GLOBAL_CORRIDOR_SOURCES
  .filter(s=>s.format==="rss"&&["POLL_DIRECT_FEED","EXISTING_DIRECT_FEED"].includes(s.state))
  .map(s=>[s.id,s.url]));
const SHA=/^[a-f0-9]{64}$/u;
const IMO=/\bIMO\s*[:#-]?\s*(\d{7})\b/giu;
const ROUTES=Object.freeze({
 strait_of_hormuz:/\b(?:strait of hormuz|hormuz strait)\b/giu,
 bab_el_mandeb:/\b(?:bab[- ](?:el|al)[- ]mandeb)\b/giu,
 suez_canal:/\bsuez canal\b/giu,
 panama_canal:/\bpanama canal\b/giu,
 strait_of_malacca:/\b(?:strait of malacca|malacca strait)\b/giu,
 singapore_strait:/\bsingapore strait\b/giu,
 south_china_sea:/\bsouth china sea\b/giu,
 taiwan_strait:/\btaiwan strait\b/giu,
 red_sea:/\bred sea\b/giu,
 gulf_of_aden_somali_basin:/\b(?:gulf of aden|somali basin)\b/giu,
 gulf_of_guinea:/\bgulf of guinea\b/giu,
 black_sea_grain_kerch:/\b(?:black sea|kerch strait|sea of azov)\b/giu
});
const ACTIONS=Object.freeze({
 attack:/\b(?:attacked|attack on|struck|missile strike|drone strike|hit by a missile)\b/iu,
 blockade:/\b(?:blockaded|blockade|blocked passage|shipping blocked)\b/iu,
 closure:/\b(?:closed to shipping|shipping suspended|navigation suspended|canal closed|strait closed)\b/iu,
 seizure:/\b(?:seized|hijacked|detained vessel|vessel detained)\b/iu,
 collision:/\b(?:collided|collision|grounded|ran aground)\b/iu,
 disruption:/\b(?:rerouted|diverted|transit delayed|vessel delayed|ships delayed)\b/iu
});
function hexHash(value){return createHash("sha256").update(value).digest("hex")}
function issuerHostname(url){return new URL(url).hostname.toLowerCase().replace(/^www\./u,"")}
function valid(candidate,now){
 if(!candidate||typeof candidate!=="object"||!SHA.test(candidate.id||"")||
    !FEEDS.has(candidate.source_id)||!SHA.test(candidate.source_title_sha256||"")||
    !Array.isArray(candidate.candidate_corridor_ids)||
    candidate.candidate_corridor_ids.some(x=>!Object.hasOwn(ROUTES,x)))return false;
 let u,f;try{u=new URL(candidate.article_url);f=new URL(FEEDS.get(candidate.source_id))}catch{return false}
 const published=Date.parse(candidate.published_at);
 return u.protocol==="https:"&&!u.username&&!u.password&&!u.port&&!u.hash&&!u.search&&
   issuerHostname(u.href)===issuerHostname(f.href)&&
   u.href.length<=1024&&Number.isFinite(published)&&published<=now.getTime()&&
   published>=now.getTime()-WINDOW_MS&&
   hexHash(candidate.source_id+"\x1f"+candidate.article_url+"\x1f"+candidate.published_at)===candidate.id&&
   candidate.source_time_is_not_event_time===true&&
   candidate.original_article_verified===false&&
   candidate.corridor_impact_verified===false&&
   candidate.independent_corroboration_verified===false&&
   candidate.commercial_rights_verified===false&&candidate.customer_delivery_enabled===false;
}
function textFromArticleHtml(html){
 if(/<!DOCTYPE[^>]*\[|<!ENTITY/iu.test(html))return null;
 // Only the original publisher's article/main content. Reject general page
 // headers, metadata, search snippets and route labels in navigation/footer.
 const match=/<article\b[^>]*>([\s\S]*?)<\/article\s*>/iu.exec(html)||
             /<main\b[^>]*>([\s\S]*?)<\/main\s*>/iu.exec(html);
 if(!match)return null;
 return match[1].replace(/<(?:script|style|nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/(?:script|style|nav|header|footer|aside)\s*>/giu," ")
  .replace(/<!--[^]*?-->/gu," ").replace(/<[^>]+>/gu," ")
  .replace(/&(?:nbsp|amp|quot|apos|lt|gt);/giu," ")
  .replace(/&#(?:\d{1,6}|x[0-9a-f]{1,6});/giu," ")
  .replace(/\s+/gu," ").trim().slice(0,75000);
}
async function fetchArticle(candidate,fetchImpl){
 let response;
 try{response=await fetchImpl(candidate.article_url,{method:"GET",
  redirect:"error",headers:{accept:"text/html"},signal:AbortSignal.timeout(7000)})}
 catch{return {state:"ARTICLE_NETWORK_UNAVAILABLE"}}
 if([401,403,429].includes(response.status))return {state:"ARTICLE_ACCESS_DENIED"};
 if(response.status!==200||(response.url&&response.url!==candidate.article_url))
  return {state:"ARTICLE_UNAVAILABLE"};
 const mime=(response.headers?.get?.("content-type")||"").toLowerCase();
 if(!mime.includes("text/html")||Number(response.headers?.get?.("content-length")||0)>MAX_BYTES||
    !response.body)return {state:"ARTICLE_NOT_BOUNDED_HTML"};
 const reader=response.body.getReader(),chunks=[];let count=0;
 try{
  for(;;){const {value,done}=await reader.read();if(done)break;
   count+=value.byteLength;if(count>MAX_BYTES)return {state:"ARTICLE_TOO_LARGE"};
   chunks.push(value);
  }
 }catch{return {state:"ARTICLE_READ_FAILED"}}
 finally{try{await reader.cancel()}catch{}reader.releaseLock()}
 const bytes=new Uint8Array(count);let offset=0;
 for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength}
 let html;try{html=new TextDecoder("utf-8",{fatal:true}).decode(bytes)}
 catch{return {state:"ARTICLE_ENCODING_INVALID"}}
 const text=textFromArticleHtml(html);
 if(!text||text.length<80)return {state:"ARTICLE_BODY_UNVERIFIED"};
 const route_mentions=Object.entries(ROUTES).filter(([,re])=>
  new RegExp(re.source,"iu").test(text)).map(([name])=>name).sort();
 const observations=[];
 for(const [route,re] of Object.entries(ROUTES)){
  for(const mention of text.matchAll(re)){
   const position=mention.index??0;
   // A route/event word alone cannot prove a disruption; require one
   // specific vessel IMO in the same compact body clause.
   const clause=text.slice(Math.max(0,position-180),Math.min(text.length,position+180));
   const imos=[...clause.matchAll(IMO)].map(x=>x[1]);
   if(!imos.length)continue;
   if(/\b(?:no|not|denied|unconfirmed|rumou?red|hypothetical)\b/iu.test(clause))continue;
   const actions=Object.entries(ACTIONS).filter(([,a])=>a.test(clause)).map(([name])=>name);
   for(const imo of imos)for(const action of actions){
    const key=route+"\x1f"+action+"\x1f"+imo;
    if(!observations.some(o=>o.key===key))
      observations.push({key,route,action,vessel_token_hash:hexHash(imo)});
   }
  }
 }
 return {state:"ARTICLE_BODY_READ",body_hash:hexHash(text),route_mentions,observations:observations.slice(0,12)};
}
export async function verifyNativeCorridorCandidates({candidates,now=new Date(),
  fetchImpl=fetch,maxPerRun=MAX_PER_RUN,concurrency=MAX_CONCURRENCY}={}){
 if(!Array.isArray(candidates)||candidates.length>160||
    !(now instanceof Date)||!Number.isFinite(now.getTime())||
    typeof fetchImpl!=="function"||!Number.isInteger(maxPerRun)||
    maxPerRun<1||maxPerRun>40||!Number.isInteger(concurrency)||
    concurrency<1||concurrency>MAX_CONCURRENCY||
    candidates.some(c=>!valid(c,now))||
    new Set(candidates.map(c=>c.id)).size!==candidates.length)
  throw Error("CORRIDOR_ARTICLE_VERIFIER_INPUT_INVALID");
 // Immutable 15-minute round-robin: avoid 160 repeated GETs every tick.
 const start=candidates.length?(Math.floor(now.getTime()/900000)*maxPerRun)%candidates.length:0;
 const selected=Array.from({length:Math.min(maxPerRun,candidates.length)},(_,i)=>
  candidates[(start+i)%candidates.length]);
 const gathered=[];
 for(let i=0;i<selected.length;i+=concurrency){
  const batch=await Promise.all(selected.slice(i,i+concurrency).map(async c=>({
   candidate:c,result:await fetchArticle(c,fetchImpl)
  })));
  gathered.push(...batch);
 }
 const matched=new Map();
 for(const {candidate,result} of gathered)for(const o of result.observations||[]){
  const arr=matched.get(o.key)||[];
  arr.push({source_id:candidate.source_id,published:Date.parse(candidate.published_at)});
  matched.set(o.key,arr);
 }
 let corroborated=0,articleBodies=0,routeEvidence=0,bodyRouteMentions=0;
 const items=gathered.map(({candidate,result})=>{
  if(result.state==="ARTICLE_BODY_READ")articleBodies++;
  // Match only the SAME route, action and vessel. Do not inherit an older
  // timestamp from another event, unrelated source, or a different ship.
  const candidateClock=Date.parse(candidate.published_at);
  const reportGroups=(result.observations||[]).map(o=>{
   const supporting=(matched.get(o.key)||[]).filter(x=>
     Math.abs(x.published-candidateClock)<=36*3600000);
   const issuers=new Set(supporting.map(x=>x.source_id));
   return {route_id:o.route,action:o.action,
    vessel_token_hash:o.vessel_token_hash,
    independent_issuer_count:issuers.size,
    independent_report_match:[...issuers].some(x=>x!==candidate.source_id),
    earliest_publisher_publication_at:new Date(Math.min(candidateClock,
      ...supporting.map(x=>x.published))).toISOString(),
    reference_time_kind:"EARLIEST_OBSERVED_PUBLICATION_PROXY",
    physical_occurrence_time_verified:false,
    source_evidence_kind:"TRANSIENT_PUBLISHER_ARTICLE_BODY",
    // These are *extracted observations*, not a signed event or risk grade.
    impact_metric_verified:false};
  });
  const pair=reportGroups.filter(x=>x.independent_report_match);
  const referenceClock=pair.length
   ?Math.min(...pair.map(x=>Date.parse(x.earliest_publisher_publication_at)))
   :candidateClock;
  if((result.observations||[]).length)routeEvidence++;
  if((result.route_mentions||[]).length)bodyRouteMentions++;
  if(pair.length)corroborated++;
  return {candidate_id:candidate.id,source_id:candidate.source_id,
   state:pair.length?"INDEPENDENT_VESSEL_ROUTE_REPORT_MATCH":
     (result.observations||[]).length?"SINGLE_SOURCE_ROUTE_CLAUSE_OBSERVED":
     (result.route_mentions||[]).length?"ARTICLE_ROUTE_CONTEXT_ONLY":result.state,
   article_body_read:result.state==="ARTICLE_BODY_READ",
   route_context_ids:result.route_mentions||[],
   // Operational reference timestamp is the earliest observed publication
   // among the independently matched reports; otherwise this sole publisher.
   event_reference_at:new Date(referenceClock).toISOString(),
   event_reference_time_basis:pair.length
    ?"EARLIEST_CORROBORATING_PUBLICATION"
    :"EARLIEST_OBSERVED_PUBLICATION_PROXY_SINGLE_SOURCE",
   physical_occurrence_time_verified:false,
   // Structured extracted facts from raw transient bodies, no republished text.
   structured_evidence:reportGroups,
   extracted_context_class:pair.length?"CORROBORATED_PUBLISHER_REPORT":
    (result.observations||[]).length?"SINGLE_PUBLISHER_ROUTE_REPORT":
    (result.route_mentions||[]).length?"ROUTE_MENTION_ONLY":"NO_ROUTE_EVIDENCE",
   raw_article_used_for_structuring:result.state==="ARTICLE_BODY_READ",
   independent_report_match:pair.length>0,
   event_verified:false,corridor_impact_verified:false,
   signed_gro_verified:false,commercial_rights_verified:false,
   customer_delivery_authorized:false,
   article_body_sha256:result.body_hash||null};
 });
 return Object.freeze({schema:"geomacro.corridor-native-evidence-screen.v1",
  channel:"CORRIDOR_ONLY",checked_at:now.toISOString(),
  candidate_count:candidates.length,inspected_count:items.length,
  deferred_count:candidates.length-items.length,
  article_body_reads:articleBodies,body_route_mentions:bodyRouteMentions,
  route_clause_observed:routeEvidence,
  independent_vessel_route_matches:corroborated,
  verified_corridor_events:0,verified_commercial_rights:0,
  raw_articles_structured_ephemerally:true,
  source_article_bodies_saved:false,publisher_headlines_saved:false,
  website_intelligence_writes:0,d1_reads:0,d1_writes:0,b2_requests:0,
  signed_gro_generated:false,chargeable:false,items});
}
