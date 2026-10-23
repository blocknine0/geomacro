// #2041 / #1827: Independent, free-to-read maritime context while UKMTO is
// denied. Each distinct publisher stays distinct. Zero UKMTO requests.
// Public index visibility is NOT incident publication clock, semantic
// corroboration, source-rights license, or commercial GRO readiness.
const LIMIT=384*1024;
const MAX_MS=8_000;
const SOURCES=Object.freeze([
  Object.freeze({id:"us_msci_maritime_advisories",publisher:"us_maritime_advisory_system",
    host:"www.maritime.dot.gov",url:"https://www.maritime.dot.gov/msci-advisories",
    scope:"RED_SEA_HORMUZ_BLACK_SEA_GULF_GUINEA_US_GOV_ADVISORY"}),
  Object.freeze({id:"recaap_isc_weekly_reports",publisher:"recaap_information_sharing_centre",
    host:"www.recaap.org",url:"https://www.recaap.org/reports",
    scope:"ASIA_PIRACY_PERIODIC_REPORT_INDEX"}),
  Object.freeze({id:"eunavfor_mscio_alerts",publisher:"eunavfor_mscio",
    host:"www.mscio.eu",url:"https://www.mscio.eu/alerts/",
    scope:"INDIAN_OCEAN_MARITIME_SECURITY_INDEX"}),
]);
export const INDEPENDENT_MARITIME_CONTEXT_SOURCES=SOURCES;

function visible(markup){
 // HTML is untrusted, including script end tags with whitespace, malformed
 // attributes, comments, and quoted '>' characters. Avoid regex-based
 // HTML stripping; scan tags while suppressing script/style/template contents.
 let output="",position=0,skipped=null;
 while(position<markup.length){
   if(markup[position]!=="<"){
     if(!skipped)output+=markup[position];
     position++;continue;
   }
   if(markup.startsWith("<!--",position)){
     const end=markup.indexOf("-->",position+4);
     if(end<0)break;
     position=end+3;continue;
   }
   let end=position+1,quote=null;
   while(end<markup.length&&end-position<4096){
     const c=markup[end];
     if(quote){if(c===quote)quote=null;}
     else if(c==='"'||c==="'")quote=c;
     else if(c===">")break;
     end++;
   }
   if(end>=markup.length||end-position>=4096)break;
   const raw=markup.slice(position+1,end).trimStart();
   const closing=raw.startsWith("/");
   const tag=(closing?raw.slice(1):raw).match(/^[A-Za-z][A-Za-z0-9-]*/u)?.[0]?.toLowerCase()??"";
   if(["script","style","noscript","template"].includes(tag)){
     if(closing&&skipped===tag)skipped=null;
     if(!closing&&!skipped)skipped=tag;
   }
   output+=" ";
   position=end+1;
 }
 return output.replace(/\s+/gu," ").trim();
}
function dateDay(raw){
 if(!/^\d{2}\/\d{2}\/20\d{2}$/u.test(raw))return null;
 const [m,d,y]=raw.split("/").map(Number);
 const dt=new Date(Date.UTC(y,m-1,d));
 return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&
   dt.getUTCDate()===d?dt.toISOString().slice(0,10):null;
}
export function summarizeIndependentMaritimeIndex(id,html,{now=new Date()}={}){
 if(!SOURCES.some(s=>s.id===id)||typeof html!=="string"||
   Buffer.byteLength(html,"utf8")>LIMIT||/<!(?:DOCTYPE\s+[^>]*\[|ENTITY)\b/iu.test(html)||
   !(now instanceof Date)||!Number.isFinite(now.getTime()))
   throw Error("MARITIME_INDEX_INPUT_INVALID");
 const text=visible(html);
 let count=0,reason="SOURCE_INDEX_SHAPE_UNVERIFIED",latestDay=null;
 if(id==="us_msci_maritime_advisories"){
   if(/Active Advisories/u.test(text)&&/Expire Date/u.test(text)){
     reason="OFFICIAL_ADVISORY_INDEX_OBSERVED";
     // The issued/effective day is distinct from the actual incident day.
     // Limit to the Active section and require exact advisory ID + status.
     const active=text.split(/Active Advisories/u)[1]?.split(/Cancelled Advisories/u)[0]??"";
     const matches=[...active.matchAll(/\b(20\d{2}-\d{3})-[A-Za-z0-9, .-]{6,180}\s+Active\s+(\d{2}\/\d{2}\/20\d{2})\s+\d{2}\/\d{2}\/20\d{2}/gu)].slice(0,35);
     const ids=new Set();
     for(const m of matches){
       const day=dateDay(m[2]);
       if(!day||Date.parse(day+"T00:00:00Z")>now.getTime())continue;
       ids.add(m[1]);if(!latestDay||day>latestDay)latestDay=day;
     }
     count=ids.size;
   }
 }else if(id==="recaap_isc_weekly_reports"){
   if(/Reports/u.test(text)&&/ReCAAP ISC/iu.test(text)){
     reason="OFFICIAL_PERIODIC_REPORT_INDEX_OBSERVED";
     const titles=[...text.matchAll(/ReCAAP ISC Weekly Report\s*\([^)]{6,75}\)\s*20\d{2}|ReCAAP ISC Weekly Report\s*\d{1,2}\s+[A-Z][a-z]+\s*[-–]\s*\d{1,2}\s+[A-Z][a-z]+\s*20\d{2}/gu)];
     count=Math.min(100,titles.length);
   }
 }else{
   // Some official MSCIO pages are client-rendered with "Recent Incidents (0)".
   // A bare response MUST NOT be promoted to recovered incident evidence.
   if(/Recent Incidents/u.test(text)&&/MSCIO/u.test(text)){
     const m=/Recent Incidents\s*\((\d{1,4})\)/u.exec(text);
     reason="OFFICIAL_MSCIO_INDEX_SHELL_OBSERVED";
     if(m&&Number(m[1])>0&&/ALERT\s+\d{1,4}\/20\d{2}/u.test(text)){
       reason="OFFICIAL_MSCIO_INDEX_CANDIDATES_UNVERIFIED";
       count=Math.min(100,Number(m[1]));
     }
   }
 }
 return Object.freeze({id,reason,index_metadata_candidate_count:count,
   latest_marad_effective_day_only:latestDay,
   individual_original_article_readback_verified:false,
   source_native_incident_time_verified:false,maritime_attack_confirmed:false,
   independent_same_event_corroboration_verified:false,
   commercial_rights_verified:false,current_signed_gro_verified:false,
   x402_eligible:false});
}
async function boundedHtml(spec,fetchImpl){
 let response;
 try{response=await fetchImpl(spec.url,{method:"GET",redirect:"error",
   headers:{accept:"text/html"},signal:AbortSignal.timeout(MAX_MS)})}
 catch{return {state:"NETWORK_OR_REDIRECT_UNAVAILABLE"};}
 if([401,403,429].includes(response.status))return {state:"DENIED_OR_QUOTA"};
 if(!response.ok)return {state:"UPSTREAM_HTTP_UNAVAILABLE"};
 if(!/^text\/html(?:;|$)/iu.test(response.headers.get("content-type")??""))
   return {state:"MIME_UNVERIFIED"};
 const partialAllowed=spec.id==="recaap_isc_weekly_reports";
 if(!response.body)return {state:"BODY_UNAVAILABLE"};
 if(Number(response.headers.get("content-length")||0)>LIMIT&&!partialAllowed)
   return {state:"BODY_LIMIT"};
 let n=0,truncated=false;const parts=[],reader=response.body.getReader();
 try{
   while(true){
     const {done,value}=await reader.read();if(done)break;
     const remaining=LIMIT-n;
     if(value.byteLength>remaining){
       if(!partialAllowed)return {state:"BODY_LIMIT"};
       if(remaining>0){parts.push(value.subarray(0,remaining));n+=remaining;}
       truncated=true;
       break;
     }
     n+=value.byteLength;parts.push(value);
   }
 }catch{return {state:"BODY_READ_UNAVAILABLE"}}
 finally{try{await reader.cancel()}catch{}reader.releaseLock()}
 try{
   const all=new Uint8Array(n);let p=0;
   for(const chunk of parts){all.set(chunk,p);p+=chunk.length;}
   // Incomplete UTF-8 at the exact prefix boundary is not a missing report.
   // Decode only the bounded bytes; the last incomplete character may be
   // replaced, but no publisher-native clock or event proof is inferred.
   const decoder=new TextDecoder("utf-8",{fatal:true});
   let html=null;
   for(let drop=0;drop<=(truncated?3:0);drop++){
     try{html=decoder.decode(all.subarray(0,n-drop));break;}
     catch{/* Only an incomplete final UTF-8 code point may be truncated. */}
   }
   if(html===null)return {state:"UTF8_INVALID"};
   return {state:truncated?"BOUNDED_OFFICIAL_INDEX_PREFIX_READ":"HTML_BYTES_READ",
     body:html};
 }catch{return {state:"UTF8_INVALID"}}
}
export async function observeIndependentMaritimeOfficialContext({
 now=new Date(),fetchImpl=fetch,
}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
   typeof fetchImpl!=="function")throw Error("MARITIME_OBSERVER_INVALID");
 const rows=[];
 for(const spec of SOURCES){
   const read=await boundedHtml(spec,fetchImpl);
   let proof=null;
   if(read.state==="HTML_BYTES_READ"||
      read.state==="BOUNDED_OFFICIAL_INDEX_PREFIX_READ"){
     try{proof=summarizeIndependentMaritimeIndex(spec.id,read.body,{now});}
     catch{/* Only issuer-specific bounded index shape may pass. */}
   }
   // Partial ReCAAP report-list prefix is not a complete publication index.
   if(read.state==="BOUNDED_OFFICIAL_INDEX_PREFIX_READ"&&proof)
     proof=Object.freeze({...proof,reason:proof.reason===
       "OFFICIAL_PERIODIC_REPORT_INDEX_OBSERVED"?
       "OFFICIAL_PERIODIC_REPORT_PREFIX_ONLY":"SOURCE_INDEX_UNVERIFIED"});
   const {body,...metadata}=read; // NEVER retain fetched markup.
   rows.push(Object.freeze({
     id:spec.id,publisher_family:spec.publisher,coverage_scope:spec.scope,
     transport_state:metadata.state,
     index_state:proof?.reason??"SOURCE_INDEX_UNVERIFIED",
     metadata_candidate_count:proof?.index_metadata_candidate_count??0,
     official_effective_day_only:proof?.latest_marad_effective_day_only??null,
     no_original_incident_clock:true,independently_reviewed:false,
     source_commercial_rights_verified:false,commercial_score_eligible:false,
   }));
 }
 return Object.freeze({
   schema:"geomacro.ukmto-free-independent-maritime-context.v1",
   observed_at:now.toISOString(),source_count:rows.length,http_requests:rows.length,
   sources:rows,
   independently_accessible_publishers:rows.filter(x=>x.index_state.startsWith("OFFICIAL_")).length,
   status:rows.some(x=>x.index_state.startsWith("OFFICIAL_"))?
     "PARTIAL_OFFICIAL_MARITIME_CONTEXT_OBSERVED":"ALL_INDEPENDENT_CONTEXT_UNVERIFIED",
   ukmto_requests:0,individual_maritime_incidents_verified:0,
   same_event_independent_corroboration_verified:false,
   current_signed_intelligence_verified:false,full_195x3_verified:false,
   source_rights_for_commercial_reuse_verified:false,
   source_report_text_stored:false,source_urls_exposed:false,
   supabase_requests:0,d1_requests:0,b2_requests:0,payment_attempts:0,
 });
}
