/** Dedicated first-party / route-reference corridor intake.
 * Not Website Intelligence, not OSINT and not a second risk-scoring engine.
 * The provider-specific UKMTO/ReCAAP readers derive metadata only. Portal
 * transport probes can never certify a vessel incident or route flow.
 */
import {directGlobalCorridorRouteSources,assertDirectCorridorWebsiteSeparation}
 from "./direct-global-corridor-sources.mjs";
import {observeUkmtoOfficialIndex} from "./ukmto-official-corridor-index.mjs";
import {observeIndependentMaritimeOfficialContext}
 from "./independent-maritime-official-context.mjs";

const TRANSPORT_ONLY=new Set(["ukmto_advisories","suez_navigation","panama_canal",
  "nyfed_gscpi","imb_piracy"]);
const MAX_BYTES=128*1024;
async function probePinnedPortal(spec,fetchImpl){
 let res;
 try{
   res=await fetchImpl(spec.url,{method:"GET",redirect:"error",
     headers:{accept:"text/html,application/xhtml+xml;q=0.9"},
     signal:AbortSignal.timeout(8000)});
 }catch{return {state:"NETWORK_UNAVAILABLE"};}
 if([401,403,429].includes(res.status))return {state:"DENIED_NO_RETRY"};
 if(res.status!==200)return {state:"HTTP_UNAVAILABLE"};
 const mime=(res.headers?.get?.("content-type")??"").toLowerCase();
 if(!mime.includes("text/html")&&!mime.includes("application/xhtml+xml"))
   return {state:"UNEXPECTED_MEDIA_TYPE"};
 if(Number(res.headers?.get?.("content-length")??0)>MAX_BYTES)
   return {state:"BODY_OVERSIZED"};
 if(!res.body)return {state:"NO_BODY"};
 const reader=res.body.getReader();let length=0;
 try{
   for(;;){
     const {done,value}=await reader.read();
     if(done)break;
     length+=value.byteLength;
     if(length>MAX_BYTES)return {state:"BODY_OVERSIZED"};
   }
 }catch{return {state:"BODY_UNREADABLE"};}
 finally{try{await reader.cancel()}catch{}reader.releaseLock();}
 return {state:length>0?"PORTAL_TRANSPORT_OBSERVED_NO_EVENT":"EMPTY_PAGE"};
}
// RSS reader is isolated from the Website Intelligence feed collector.
// Only counts native dated metadata; raw headlines, article URLs and XML
// never appear in the receipt or in canonical customer databases.
async function probeNativeCorridorRss(spec,fetchImpl,now){
 let res;
 try{
   res=await fetchImpl(spec.url,{method:"GET",redirect:"error",
     headers:{accept:"application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9"},
     signal:AbortSignal.timeout(8000)});
 }catch{return {state:"FEED_NETWORK_UNAVAILABLE",metadata_candidates:0};}
 if([401,403,429].includes(res.status))return {state:"DENIED_NO_RETRY",metadata_candidates:0};
 if(res.status!==200)return {state:"FEED_HTTP_UNAVAILABLE",metadata_candidates:0};
 if(Number(res.headers?.get?.("content-length")??0)>MAX_BYTES||!res.body)
   return {state:"FEED_BODY_UNAVAILABLE",metadata_candidates:0};
 const chunks=[];let n=0;const stream=res.body.getReader();
 try{
   for(;;){const {done,value}=await stream.read();if(done)break;
     n+=value.byteLength;if(n>MAX_BYTES)return {state:"FEED_BODY_OVERSIZED",metadata_candidates:0};
     chunks.push(value);
   }
 }catch{return {state:"FEED_READ_FAILED",metadata_candidates:0};}
 finally{try{await stream.cancel()}catch{}stream.releaseLock();}
 let xml;
 try{const bytes=new Uint8Array(n);let offset=0;
   for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
   xml=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
 }catch{return {state:"FEED_ENCODING_INVALID",metadata_candidates:0};}
 if(/<!DOCTYPE|<!ENTITY/iu.test(xml)||
    !/^\s*(?:<\?xml[^>]*>\s*)?<(?:rss|feed|rdf:RDF)\b/iu.test(xml))
   return {state:"NOT_A_NATIVE_FEED",metadata_candidates:0};
 const entries=[...xml.matchAll(/<(?:[a-z][\w.-]*:)?(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:[a-z][\w.-]*:)?(?:item|entry)>/giu)].slice(0,40);
 let dated=0;
 for(const item of entries){
   const raw=item[1].match(/<(?:pubDate|published)\b[^>]*>([^<]{8,100})<\/(?:pubDate|published)>/iu)?.[1]?.trim();
   if(!raw||/^\d{4}-\d{2}-\d{2}$/u.test(raw))continue;
   const ms=Date.parse(raw);
   if(Number.isFinite(ms)&&ms<=now.getTime()+5*60_000&&
      now.getTime()-ms<=72*3600_000)dated++;
 }
 return {state:dated>0?"NATIVE_FEED_METADATA_OBSERVED":"NO_RECENT_NATIVE_ITEM_DATE",
   metadata_candidates:dated};
}
export async function collectDirectCorridorSourceIntake({
 now=new Date(),fetchImpl=fetch,observeUkmto=observeUkmtoOfficialIndex,
 observeIndependent=observeIndependentMaritimeOfficialContext
}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
    typeof fetchImpl!=="function")throw Error("DIRECT_CORRIDOR_INTAKE_INVALID");
 assertDirectCorridorWebsiteSeparation();
 const corridor=directGlobalCorridorRouteSources();
 const states=[];
 const add=(spec,state,extra={})=>states.push({id:spec.id,
   state,reference_count:spec.source_references.length,
   candidate_corridor_ids:extra.candidate_corridor_ids??[],
   metadata_candidates:extra.metadata_candidates??0,
   event_verified:false,flow_verified:false,
   website_intelligence_enabled:false,commercial_eligible:false});
 const byId=new Map(corridor.map(s=>[s.id,s]));
 // Dedicated original route-authority observers; not website publishers.
 try{
   const receipt=await observeUkmto({now,fetchImpl});
   add(byId.get("ukmto_incidents"),receipt.status,{
     candidate_corridor_ids:receipt.candidate_corridor_ids??[],
     metadata_candidates:receipt.recent_index_report_candidates??0});
 }catch{add(byId.get("ukmto_incidents"),"PROVIDER_UNAVAILABLE");}
 try{
   const receipt=await observeIndependent({now,fetchImpl});
   const recaap=(receipt.sources??[]).find(x=>x.id==="recaap_isc_weekly_reports");
   add(byId.get("recaap_isc"),recaap?.index_state??"UNVERIFIED",{
     metadata_candidates:recaap?.metadata_candidate_count??0});
 }catch{add(byId.get("recaap_isc"),"PROVIDER_UNAVAILABLE");}
 // Existing bounded official site probes, no incident-body storage.
 for(const spec of corridor.filter(s=>TRANSPORT_ONLY.has(s.id))){
   const result=await probePinnedPortal(spec,fetchImpl);
   add(spec,result.state);
 }
 // Every explicitly listed native RSS is checked on the dedicated corridor
 // lane only; it never reaches reusable website news or private OSINT.
 for(const spec of corridor.filter(s=>s.format==="rss"&&
      ["POLL_DIRECT_FEED","EXISTING_DIRECT_FEED"].includes(s.state))){
   const result=await probeNativeCorridorRss(spec,fetchImpl,now);
   add(spec,result.state,{metadata_candidates:result.metadata_candidates});
 }
 // All other supplied destinations remain registered and visible, but are
 // never misrepresented as machine-readable event feeds. These must receive
 // provider-specific parser/credential acceptance before canonical cutover.
 for(const spec of corridor){
   if(states.some(x=>x.id===spec.id))continue;
   const state=spec.state==="REJECTED_REMOVED_LINK"?"NO_SOURCE_LINK_PROVIDED":
    spec.state==="REFERENCE_ONLY"?"REFERENCE_DOCUMENT_NOT_EVENT_FEED":
    spec.state==="CREDENTIAL_REQUIRED"?"PROVIDER_API_AUTH_REQUIRED":
    spec.state==="TRANSPORT_BLOCKED"?"TRANSPORT_BLOCKED_NOT_RETRIED":
    spec.state==="EXISTING_ADAPTER_UNVERIFIED"?"EXISTING_ADAPTER_CORRIDOR_CUTOVER_REQUIRED":
    spec.state==="EXISTING_DIRECT_FEED"?"EXISTING_ADAPTER_CORRIDOR_CUTOVER_REQUIRED":
    spec.state==="PORTAL_ENDPOINT_REQUIRED"?"PORTAL_DATA_ADAPTER_REQUIRED":
    "DIRECT_SOURCE_ADAPTER_UNVERIFIED";
   add(spec,state);
 }
 const known=new Set(states.map(x=>x.id));
 if(states.length!==corridor.length||known.size!==corridor.length||
    states.reduce((n,s)=>n+s.reference_count,0)!==38)
   throw Error("DIRECT_CORRIDOR_INTAKE_CENSUS_INCOMPLETE");
 return Object.freeze({
   schema:"geomacro.direct-corridor-source-intake.v2",
   checked_at:now.toISOString(),channel:"CORRIDOR_ONLY",
   source_count:corridor.length,source_link_occurrences:38,
   unique_linked_sources:36,missing_link_placeholders:1,
   source_checks:states,
   candidate_corridors:[...new Set(states.flatMap(s=>s.candidate_corridor_ids))].sort(),
   total_index_metadata_candidates:states.reduce((n,s)=>n+s.metadata_candidates,0),
   website_intelligence_writes:0,website_intelligence_enabled:false,
   source_news_collector_calls:0,
   native_event_evidence_written_to_canonical_db:false,
   d1_writes:0,b2_writes:0,supabase_writes:0,
   raw_publisher_body_saved:false,commercial_rights_verified:false,
   route_flow_verified:false,chargeable:false,signed_gro_generated:false,
   data_ready_for_verified_risk_gate:false
 });
}
