// Two additional no-key national first-party mineral publication indices.
// These are not raw mineral statistics, real-time mine events or rights grants.
import {officialItemNativePublicationMs} from "./official-native-item-publication-date.mjs";
export const MINERAL_ORIGINAL_INDICES=Object.freeze([
 Object.freeze({id:"peru_minem_mining_bulletin",iso3:"PER",
  url:"https://www.gob.pe/institucion/minem/colecciones/6-boletin-estadistico-minero",
  format:"html",maxBytes:384*1024}),
 Object.freeze({id:"canada_nrcan_geoscan_mineral_publications",iso3:"CAN",
  url:"https://geoscan.nrcan.gc.ca/rss/newpub_e.rss",
  format:"rss",maxBytes:256*1024})
]);
const MINERAL=/\b(?:critical minerals?|rare[- ]earths?|cobalt|nickel|lithium|copper|graphite|rare earth elements?|mining|mineral resources?|geolog(?:y|ical))\b/iu;
const MAX_ITEMS=30;
export const NRCAN_OFFICIAL_NEWS_FALLBACK="https://api.io.canada.ca/io-server/gc/news/en/v2?dept=naturalresourcescanada&sort=publishedDate&orderBy=desc&pick=5&format=atom&atomtitle=Natural%20Resources%20Canada";
const NRCAN_ATOM_MAX_BYTES=160000;
function* rssItems(xml){
 let cursor=0,n=0;
 while(n<MAX_ITEMS){
  const pos=xml.indexOf("<item>",cursor);
  if(pos<0)break;
  const from=pos+6,end=xml.indexOf("</item>",from);
  if(end<0)break;
  cursor=end+7;n++;
  if(end-from>10000)continue;
  yield xml.slice(from,end);
 }
}
function field(item,tag){
 const start="<"+tag+">",end="</"+tag+">";
 const begin=item.indexOf(start);
 if(begin<0)return "";
 const from=begin+start.length,last=item.indexOf(end,from);
 return last<0||last-from>500?"":item.slice(from,last).trim();
}
export function summarizeMineralOriginalIndex(spec,body,now=new Date()){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error("MINERAL_CLOCK_INVALID");
 if(!MINERAL_ORIGINAL_INDICES.includes(spec)||typeof body!=="string"||
  Buffer.byteLength(body,"utf8")>spec.maxBytes||
  body.includes("<!ENTITY")||body.includes("<!DOCTYPE ["))
  throw Error("MINERAL_SOURCE_SHAPE_UNVERIFIED");
 if(spec.format==="html"){
  // Monthly bulletin is a release directory, NOT a publication-date parser.
  if(!/<html(?:\s|>)/iu.test(body) || !/Bolet[ií]n Estad[ií]stico Minero/iu.test(body) ||
      !/Ministerio de Energ[ií]a y Minas|MINEM|gob\.pe/iu.test(body))
    throw Error("MINERAL_SOURCE_SHAPE_UNVERIFIED");
  return {id:spec.id,iso3:spec.iso3,status:"MONTHLY_MINERAL_BULLETIN_INDEX_PRESENT",
   publisher_entries_with_native_publication_time:0,
   qualifying_relevant_entries:0,recent_native_publisher_items:0,
   complete_current_month_data_verified:false};
 }
 if(!/<rss(?:\s|>)|<rdf:RDF(?:\s|>)/iu.test(body)||!body.includes("<item"))
   throw Error("MINERAL_SOURCE_SHAPE_UNVERIFIED");
 let dated=0,topics=0,recent=0;const ids=new Set();
 for(const entry of rssItems(body)){
  const title=field(entry,"title").replace(/<[^>]*>/gu," ").trim();
  const clock=field(entry,"pubDate")||field(entry,"dc:date");
  const t=officialItemNativePublicationMs(clock);
  const id=field(entry,"guid")||field(entry,"link");
  if(!id||id.length>500||ids.has(id)||!Number.isFinite(t)||t>now.getTime())continue;
  ids.add(id);dated++;
  if(!MINERAL.test(title))continue;
  topics++;
  if(now.getTime()-t<=30*86_400_000)recent++;
 }
 return {id:spec.id,iso3:spec.iso3,
   status:dated>0?"FIRST_PARTY_PUBLICATION_INDEX_DATES_OBSERVED":"NO_VERIFIED_DATED_PUBLICATIONS",
   publisher_entries_with_native_publication_time:dated,
   qualifying_relevant_entries:topics,recent_native_publisher_items:recent,
   full_original_publication_verified:false,
   complete_current_month_data_verified:false};
}
// The primary GEOSCAN publication RSS can fail on GitHub network transports.
// On network failures only (NOT 401/403/429), reuse the already registered
// first-party NRCan news publisher once. A fallback is not new corroboration.
function* atomItems(xml){
 let cursor=0,n=0;
 while(n<MAX_ITEMS){
   const pos=xml.indexOf("<entry>",cursor);if(pos<0)break;
   const from=pos+7,end=xml.indexOf("</entry>",from);if(end<0)break;
   cursor=end+8;n++;
   if(end-from<=10000)yield xml.slice(from,end);
 }
}
export function summarizeNrcanNewsAtomFallback(body,now=new Date()){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error("MINERAL_CLOCK_INVALID");
 if(typeof body!=="string"||Buffer.byteLength(body,"utf8")>NRCAN_ATOM_MAX_BYTES||
    !/<feed(?:\s|>)/iu.test(body)||!body.includes("<entry>")||
    body.includes("<!DOCTYPE")||body.includes("<!ENTITY"))
   throw Error("MINERAL_NRCAN_ATOM_SHAPE_UNVERIFIED");
 const used=new Set();let dated=0,topics=0,recent=0;
 for(const item of atomItems(body)){
   const id=field(item,"id"),title=field(item,"title");
   const timestamp=officialItemNativePublicationMs(field(item,"published"));
   if(!id||used.has(id)||id.length>500||
      !Number.isFinite(timestamp)||timestamp>now.getTime())continue;
   used.add(id);dated++;
   if(!MINERAL.test(title))continue;
   topics++;
   if(now.getTime()-timestamp<=30*86_400_000)recent++;
 }
 return {
   id:"canada_nrcan_geoscan_mineral_publications",iso3:"CAN",
   status:dated>0?"GEOSCAN_NETWORK_FAILED_NRCAN_NEWS_FALLBACK_OBSERVED":
          "GEOSCAN_NETWORK_FAILED_NRCan_NEWS_DATE_UNVERIFIED",
   upstream_actual_family:"nrcan",
   same_publisher_family_fallback_used:true,
   publisher_entries_with_native_publication_time:dated,
   qualifying_relevant_entries:topics,recent_native_publisher_items:recent,
   full_original_publication_verified:false,
   complete_current_month_data_verified:false,
   mineral_event_independently_verified:false
 };
}
async function textBody(response,maxBytes){
 if([401,403,429].includes(response.status))throw Error("MINERAL_DENIED_OR_QUOTA");
 if(!response.ok)throw Error("MINERAL_HTTP_UNAVAILABLE");
 if(Number(response.headers.get("content-length")||0)>maxBytes)throw Error("MINERAL_BODY_LIMIT");
 if(!response.body)throw Error("MINERAL_BODY_EMPTY");
 const reader=response.body.getReader();let total=0;const parts=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;
  total+=value.length;if(total>maxBytes)throw Error("MINERAL_BODY_LIMIT");parts.push(value);
 }}finally{try{await reader.cancel()}catch{}reader.releaseLock()}
 const b=new Uint8Array(total);let offset=0;
 for(const p of parts){b.set(p,offset);offset+=p.length}
 try{return new TextDecoder("utf-8",{fatal:true}).decode(b)}
 catch{throw Error("MINERAL_INVALID_UTF8")}
}
export async function observeTwoMineralIndices({fetchImpl=fetch,now=new Date()}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error("MINERAL_CLOCK_INVALID");
 const readings=[];let providerCalls=0;
 for(const spec of MINERAL_ORIGINAL_INDICES){
   try{
    providerCalls++;
    const response=await fetchImpl(spec.url,{
      method:"GET",redirect:"error",signal:AbortSignal.timeout(10000),
      headers:{accept:spec.format==="rss"?"application/rss+xml, application/xml":"text/html"}
    });
    const data=await textBody(response,spec.maxBytes);
    readings.push(summarizeMineralOriginalIndex(spec,data,now));
   }catch(e){
    const message=String(e?.message??"");
    const reason=/^MINERAL_[A-Z_]+$/u.test(message)?message:"MINERAL_NETWORK_FAILURE";
    let alternate=null;
    if(spec.iso3==="CAN"&&reason==="MINERAL_NETWORK_FAILURE"){
      providerCalls++;
      try{
        const response=await fetchImpl(NRCAN_OFFICIAL_NEWS_FALLBACK,{
          method:"GET",redirect:"error",signal:AbortSignal.timeout(10000),
          headers:{accept:"application/atom+xml, application/xml"}
        });
        const body=await textBody(response,NRCAN_ATOM_MAX_BYTES);
        alternate=summarizeNrcanNewsAtomFallback(body,now);
      }catch{alternate=null;}
    }
    readings.push(alternate??{id:spec.id,iso3:spec.iso3,status:"UNVERIFIED_OR_UNAVAILABLE",
      reason,
      publisher_entries_with_native_publication_time:0,qualifying_relevant_entries:0,
      recent_native_publisher_items:0,complete_current_month_data_verified:false});
   }
 }
 return {schema:"geomacro.two-national-mineral-index-observer.v1",checked_at:now.toISOString(),
  upstream_calls:providerCalls,
  conditional_fallback_calls:providerCalls-MINERAL_ORIGINAL_INDICES.length,
  sources:readings,healthy_source_count:readings.filter(r=>r.status==="MONTHLY_MINERAL_BULLETIN_INDEX_PRESENT"||r.status==="FIRST_PARTY_PUBLICATION_INDEX_DATES_OBSERVED"||r.status==="GEOSCAN_NETWORK_FAILED_NRCAN_NEWS_FALLBACK_OBSERVED").length,
  all_195_mineral_countries_verified:false,
  source_licences_for_paid_derived_outputs_verified:false,
  mine_disruption_or_trade_flow_verified:false,
  native_original_articles_verified:false,
  raw_source_bytes_stored:false,customer_paid_eligible:false,
  supabase_requests:0,d1_writes:0,b2_requests:0,payments:0};
}
