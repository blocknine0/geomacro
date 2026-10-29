/**
 * First-party sanctions LISTING availability, not sanctions-event approval.
 * OFAC retired RSS in 2025: never try a dead feed. Fixed HTML pages only.
 * A listing date is NOT native per-article publication verification.
 * All output is source-count metadata; no original text is persisted.
 */
export const SANCTIONS_ORIGINAL_LISTINGS=Object.freeze([
  Object.freeze({id:"ofac_sanctions_list_updates",host:"ofac.treasury.gov",
    url:"https://ofac.treasury.gov/recent-actions/sanctions-list-updates",kind:"OFAC_RECENT_ACTIONS_HTML"}),
  Object.freeze({id:"unsc_consolidated_list_updates",host:"main.un.org",
    url:"https://main.un.org/securitycouncil/en/content/list-updates-unsc-consolidated-list",
    kind:"UNSC_LIST_UPDATES_HTML"}),
]);
const MAX_BYTES=800*1024;
const PREVIEW_CHARS=5000;
const DATE=/^(?:0?[1-9]|[12][0-9]|3[01])\/(?:0?[1-9]|1[0-2])\/20\d{2}$/u;
const OFAC_DATE=/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(?:[1-9]|[12]\d|3[01]),\s+20\d{2}\b/gu;
const sourceClock=(str,nowMs)=>{
 const n=Date.parse(str);
 if(!Number.isFinite(n)||n>nowMs+86400000||n<Date.UTC(2000,0,1))return null;
 return new Date(n).toISOString().slice(0,10);
};
const textOnly=s=>s.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/giu," ")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/giu," ")
  .replace(/<[^>]*>/gu," ").replace(/&(?:nbsp|amp|quot|apos);/giu," ")
  .replace(/\s+/gu," ").trim();
/** Conservative, listing-only observation: no lookup of a date solely from URL. */
export function inspectSanctionsListing(html,kind,{now=new Date()}={}){
 if(typeof html!=="string"||html.length>MAX_BYTES||
   /<!DOCTYPE[^>]*\[/iu.test(html)||/<!ENTITY/iu.test(html)||
   !(now instanceof Date)||!Number.isFinite(now.getTime()))
   throw Error("SANCTIONS_LISTING_BODY_INVALID");
 if(kind==="OFAC_RECENT_ACTIONS_HTML"){
   // On an official sanctions-list-updates listing, date needs a visible textual
   // month/day/year near a /recent-actions/YYYYMMDD link. The URL digits
   // alone are NEVER interpreted as a source-native publication date.
   const heading=textOnly(html.slice(0,Math.min(html.length,50000)));
   if(!/Sanctions List Updates/iu.test(heading))throw Error("SANCTIONS_LISTING_WRONG_PAGE");
   const match=[...html.matchAll(/href\s*=\s*["'](?:https:\/\/ofac\.treasury\.gov)?(\/recent-actions\/20\d{6})(?:\?[^"']*)?["']/giu)];
   const days=new Set();
   for(const m of match.slice(0,70)){
     const fragment=textOnly(html.slice(Math.max(0,m.index-1200),
       Math.min(html.length,m.index+PREVIEW_CHARS)));
     const found=[...fragment.matchAll(OFAC_DATE)].map(x=>sourceClock(x[0],now.getTime())).filter(Boolean);
     if(found.length===1)days.add(found[0]); // Ambiguous dates reject.
   }
   return {source_native_listing_date_candidates:days.size,
     latest_candidate_date:days.size?[...days].sort().at(-1):null,
     listing_article_paths_seen:match.length,
     original_article_page_date_verified:false,affected_country_evidence_verified:false,
     signed_or_commercial_event_verified:false};
 }
 if(kind==="UNSC_LIST_UPDATES_HTML"){
   const page=textOnly(html.slice(0,Math.min(html.length,30000)));
   if(!/List of updates to the UNSC Consolidated List/iu.test(page))
     throw Error("SANCTIONS_LISTING_WRONG_PAGE");
   // A table row must contain an explicit source-native DD/MM/YYYY cell. A
   // modified/updated-on footer date is never counted as a source event.
   const rows=[...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/giu)].slice(0,200);
   const days=new Set();let originalRows=0;
   for(const [,row] of rows){
     const cells=[...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/giu)]
       .map(x=>textOnly(x[1]));
     if(cells.length<4||!DATE.test(cells[0])||!cells[1]||!cells[3])continue;
     const [d,m,y]=cells[0].split("/").map(Number);
     const ms=Date.UTC(y,m-1,d);
     if(new Date(ms).getUTCDate()!==d||ms>now.getTime()+86400000)continue;
     days.add(new Date(ms).toISOString().slice(0,10));originalRows++;
   }
   return {source_native_listing_date_candidates:days.size,
     latest_candidate_date:days.size?[...days].sort().at(-1):null,
     listing_article_paths_seen:originalRows,
     original_article_page_date_verified:false,affected_country_evidence_verified:false,
     signed_or_commercial_event_verified:false};
 }
 throw Error("SANCTIONS_LISTING_TYPE_INVALID");
}
async function boundedText(response){
 if(Number(response.headers.get("content-length")||0)>MAX_BYTES)
   throw Error("SANCTIONS_LISTING_RESPONSE_TOO_LARGE");
 if(!response.body)throw Error("SANCTIONS_LISTING_EMPTY_BODY");
 const reader=response.body.getReader(),parts=[];let length=0;
 try{for(;;){
   const {done,value}=await reader.read();if(done)break;
   length+=value.byteLength;
   if(length>MAX_BYTES)throw Error("SANCTIONS_LISTING_RESPONSE_TOO_LARGE");
   parts.push(value);
 }}finally{try{await reader.cancel()}catch{}reader.releaseLock();}
 const b=new Uint8Array(length);let offset=0;
 for(const p of parts){b.set(p,offset);offset+=p.byteLength}
 return new TextDecoder("utf-8",{fatal:true}).decode(b);
}
export async function observeOfficialSanctionsListings({fetchImpl=fetch,now=new Date(),onlySourceId=null}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||typeof fetchImpl!=="function")
   throw Error("SANCTIONS_LISTING_PROBE_INVALID");
 if(onlySourceId!==null&&!SANCTIONS_ORIGINAL_LISTINGS.some(s=>s.id===onlySourceId))
   throw Error("SANCTIONS_LISTING_SOURCE_ID_NOT_ALLOWED");
 const sources=[];
 for(const source of SANCTIONS_ORIGINAL_LISTINGS.filter(s=>onlySourceId===null||s.id===onlySourceId)){
   let status="NETWORK_UNAVAILABLE",http_status=null,detail=null;
   try{
     const u=new URL(source.url);
     if(u.protocol!=="https:"||u.hostname!==source.host||u.search||u.hash||u.port)
       throw Error("SANCTIONS_LISTING_PIN_INVALID");
     const r=await fetchImpl(source.url,{method:"GET",redirect:"error",
       headers:{Accept:"text/html,application/xhtml+xml;q=0.8","User-Agent":"GeoMacro-Official-Sanctions-Source-Observer/1.0"},
       signal:AbortSignal.timeout(9000)});
     http_status=r.status;
     if([401,403].includes(r.status))status="ACCESS_DENIED_NO_BYPASS";
     else if(r.status===429)status="RATE_LIMITED_NO_RETRY";
     else if(r.status!==200)status="SOURCE_HTTP_UNAVAILABLE";
     else if(!/text\/html|application\/xhtml\+xml/iu.test(r.headers.get("content-type")??""))
       status="NOT_HTML_OR_REDIRECTED";
     else{
       const html=await boundedText(r);
       detail=inspectSanctionsListing(html,source.kind,{now});
       status=detail.source_native_listing_date_candidates>0
         ?"FIRST_PARTY_LISTING_DATES_SEEN_NOT_EVENT_CERTIFIED"
         :"FIRST_PARTY_LISTING_REACHABLE_NO_DATED_ROWS";
     }
   }catch(e){
     const code=String(e?.message??"");
     status=/^SANCTIONS_LISTING_[A-Z_]+$/u.test(code)?"PARSER_OR_PAYLOAD_REVIEW_REQUIRED":"NETWORK_UNAVAILABLE";
   }
   sources.push({
     id:source.id,status,http_status,
     ...detail,
     original_article_page_date_verified:false,affected_country_evidence_verified:false,
     independent_same_event_confirmation:false,commercial_rights_verified:false,
     source_content_stored:false,paid_delivery_eligible:false,
   });
 }
 return {
   schema:"geomacro.official-sanctions-listings-observation.v1",
   checked_at:now.toISOString(),sources,
   source_count:sources.length,
   reachable_sources:sources.filter(s=>s.status.startsWith("FIRST_PARTY_LISTING_")).length,
   fully_qualified_event_count:0,
   applies_to_country_category_cells_verified:0,
   ofac_rss_retired:true,unsc_rss_access_approved:false,
   live_event_source_page_verified:false,signed_paid_event_verified:false,
   requests_attempted:sources.length,payments:0,d1_writes:0,b2_requests:0,predge_modified:false,
 };
}
