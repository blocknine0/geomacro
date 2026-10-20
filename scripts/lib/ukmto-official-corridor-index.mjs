// Read-only UKMTO first-party public Recent Incidents index observer.
// It records only metadata counts and candidate named-corridor IDs. UKMTO
// index display dates are NOT native incident times or paid source authority.
export const UKMTO_PUBLIC_INCIDENTS_URL="https://www.ukmto.org/recent-incidents";
const MAX_BYTES=384*1024;
const MAX_REPORTS=40;
const DAY_MS=86_400_000;
const ROUTES=Object.freeze([
 {id:"strait_of_hormuz",tokens:["strait of hormuz","khasab","khawr fakkan","khor fakkan","gulf of oman"]},
 {id:"bab_el_mandeb",tokens:["bab el mandeb","bab al mandeb","al mukha","al mokha","southern red sea"]},
 {id:"gulf_of_aden_somali_basin",tokens:["gulf of aden","al mukalla","al mukallah","aden, yemen","somali basin"]},
 {id:"black_sea_grain_kerch",tokens:["black sea","sea of azov","kerch strait"]},
 {id:"suez_canal",tokens:["suez canal"]},
]);
function visibleText(html){
 // Intentionally discard scripts, styles, comments and tags; do not parse
 // scripts/NextJS hydration data, hidden JSON or off-domain resources.
 let i=0,out="",skipping=null;
 while(i<html.length){
   if(!skipping && html.startsWith("<!--",i)){
     const end=html.indexOf("-->",i+4);
     if(end<0)break;i=end+3;continue;
   }
   if(html[i]==="<"){
     const end=html.indexOf(">",i+1);
     if(end<0)break;
     const tag=html.slice(i+1,end).trimStart().toLowerCase();
     const isEnd=tag.startsWith("/");
     const name=(isEnd?tag.slice(1):tag).split(/[\s/>]/u,1)[0];
     if(["script","style","noscript","template"].includes(name)){
       if(!isEnd)skipping=name;
       else if(skipping===name)skipping=null;
     }
     if(!skipping)out+=" ";
     i=end+1;continue;
   }
   if(!skipping)out+=html[i];
   i++;
 }
 return out.replace(/\s+/gu," ").trim();
}
function displayedDay(s){
 if(typeof s!=="string" || s.length>60)return null;
 const m=/^([1-9]|[12]\d|3[01]) (January|February|March|April|May|June|July|August|September|October|November|December) (20\d{2})$/u.exec(s);
 if(!m)return null;
 const months=["January","February","March","April","May","June","July","August","September","October","November","December"];
 const date=new Date(Date.UTC(Number(m[3]),months.indexOf(m[2]),Number(m[1])));
 return date.getUTCFullYear()===Number(m[3])&&date.getUTCDate()===Number(m[1])?
    date.toISOString().slice(0,10):null;
}
function firstDisplayedDay(context){
 // Bound all user/external text given to date regex.
 const matches=context.slice(0,180).match(/(?:[1-9]|[12]\d|3[01]) (?:January|February|March|April|May|June|July|August|September|October|November|December) 20\d{2}\b/gu)??[];
 for(const candidate of matches){const valid=displayedDay(candidate);if(valid)return valid;}
 return null;
}
export function inspectUkmtoPublicIncidentIndex(html,now=new Date()){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error("UKMTO_CLOCK_INVALID");
 if(typeof html!=="string" || html.length===0 || Buffer.byteLength(html,"utf8")>MAX_BYTES)
   throw Error("UKMTO_BODY_INVALID");
 const text=visibleText(html);
 if(!text.toLowerCase().includes("recent incidents") || !text.includes("UKMTO"))
   throw Error("UKMTO_INDEX_FORMAT_UNVERIFIED");
 const refs=new Set(),routes=new Set();
 let observed=0,withDisplayDate=0,eligibleRecentIndexEntries=0;
 let cursor=0;
 while(observed<MAX_REPORTS){
   const start=text.indexOf("UKMTO #",cursor);
   if(start<0)break;
   const after=text.slice(start+7,start+11);
   const number=/^(\d{1,3})\b/u.exec(after)?.[1];
   cursor=start+7;
   if(!number)continue;
   const id=Number(number);
   if(!Number.isInteger(id)||id<1||refs.has(id))continue;
   refs.add(id);observed++;
   const next=text.indexOf("UKMTO #",cursor);
   const context=text.slice(start,Math.min(start+1200,next<0?text.length:next));
   const day=firstDisplayedDay(context);
   if(!day)continue;
   withDisplayDate++;
   const lagDays=Math.floor((Date.parse(now.toISOString().slice(0,10)+"T00:00:00Z")-
                            Date.parse(day+"T00:00:00Z"))/DAY_MS);
   if(lagDays<0||lagDays>30)continue;
   eligibleRecentIndexEntries++;
   const lower=context.toLowerCase();
   for(const route of ROUTES){
     if(route.tokens.some(token=>lower.includes(token)))routes.add(route.id);
   }
 }
 const candidateIds=[...routes].sort();
 return {
   schema:"geomacro.ukmto-first-party-corridor-index.v1",
   source_family:"ukmto",source_url_exposed:false,
   status:observed===0?"NO_PARSEABLE_PUBLIC_REPORTS":
     eligibleRecentIndexEntries===0?"NO_RECENT_DATED_REPORTS":
     "RECENT_INDEX_CONTEXT_OBSERVED",
   parsed_unique_index_report_ids:observed,
   index_reports_with_valid_display_date:withDisplayDate,
   recent_index_report_candidates:eligibleRecentIndexEntries,
   candidate_corridor_ids:candidateIds,
   published_page_display_date_is_incident_date:false,
   first_party_article_original_verified:false,
   specific_incident_currently_active_verified:false,
   reported_incident_independently_verified:false,
   actual_corridor_flow_disruption_verified:false,
   commercial_rights_verified:false,
   partner_or_paid_delivery_enabled:false,
   upstream_html_stored:false,
   supabase_requests:0,d1_writes:0,b2_requests:0,payments:0
 };
}
async function boundedText(response){
 if([401,403,429].includes(response.status))throw Error("UKMTO_DENIED_OR_QUOTA");
 if(!response.ok)throw Error("UKMTO_HTTP_UNAVAILABLE");
 if(Number(response.headers.get("content-length")||0)>MAX_BYTES)throw Error("UKMTO_BODY_LIMIT");
 if(!response.body)throw Error("UKMTO_BODY_EMPTY");
 const reader=response.body.getReader(),parts=[];let size=0;
 try{for(;;){
   const {done,value}=await reader.read();if(done)break;
   size+=value.byteLength;if(size>MAX_BYTES)throw Error("UKMTO_BODY_LIMIT");
   parts.push(value);
 }}finally{try{await reader.cancel()}catch{}reader.releaseLock()}
 const joined=new Uint8Array(size);let offset=0;
 for(const p of parts){joined.set(p,offset);offset+=p.length}
 try{return new TextDecoder("utf-8",{fatal:true}).decode(joined)}
 catch{throw Error("UKMTO_ENCODING_INVALID")}
}
export async function observeUkmtoOfficialIndex({fetchImpl=fetch,now=new Date()}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error("UKMTO_CLOCK_INVALID");
 const response=await fetchImpl(UKMTO_PUBLIC_INCIDENTS_URL,{
   method:"GET",redirect:"error",headers:{accept:"text/html"},
   signal:AbortSignal.timeout(10000)
 });
 return inspectUkmtoPublicIncidentIndex(await boundedText(response),now);
}
