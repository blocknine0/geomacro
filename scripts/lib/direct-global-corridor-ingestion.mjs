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
export async function collectDirectCorridorSourceIntake({
 now=new Date(),fetchImpl=fetch,observeUkmto=observeUkmtoOfficialIndex,
 observeIndependent=observeIndependentMaritimeOfficialContext
}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
    typeof fetchImpl!=="function")throw Error("DIRECT_CORRIDOR_INTAKE_INVALID");
 assertDirectCorridorWebsiteSeparation();
 const corridor=directGlobalCorridorRouteSources();
 const states=[];
 // Existing publisher-specific parser: original UKMTO report-index metadata.
 try{
   const receipt=await observeUkmto({now,fetchImpl});
   states.push({id:"ukmto_incidents",state:receipt.status,
     candidate_corridor_ids:receipt.candidate_corridor_ids??[],
     metadata_candidates:receipt.recent_index_report_candidates??0,
     event_verified:false,flow_verified:false});
 }catch{states.push({id:"ukmto_incidents",state:"PROVIDER_UNAVAILABLE",
   candidate_corridor_ids:[],metadata_candidates:0,event_verified:false,flow_verified:false});}
 // ReCAAP report-index parser is first-party; no global news projection.
 try{
   const receipt=await observeIndependent({now,fetchImpl});
   const recaap=(receipt.sources??[]).find(x=>x.id==="recaap_isc_weekly_reports");
   states.push({id:"recaap_isc",state:recaap?.index_state??"UNVERIFIED",
     candidate_corridor_ids:[],metadata_candidates:recaap?.metadata_candidate_count??0,
     event_verified:false,flow_verified:false});
 }catch{states.push({id:"recaap_isc",state:"PROVIDER_UNAVAILABLE",
   candidate_corridor_ids:[],metadata_candidates:0,event_verified:false,flow_verified:false});}
 // Remaining official public webpages are access checks, not incident parsers.
 for(const item of corridor.filter(s=>TRANSPORT_ONLY.has(s.id))){
   const r=await probePinnedPortal(item,fetchImpl);
   states.push({id:item.id,state:r.state,candidate_corridor_ids:[],
     metadata_candidates:0,event_verified:false,flow_verified:false});
 }
 const freight=corridor.find(s=>s.id==="freightos_fbx");
 if(freight)states.push({id:freight.id,state:"PROVIDER_API_AUTH_REQUIRED",
   candidate_corridor_ids:[],metadata_candidates:0,event_verified:false,flow_verified:false});
 if(states.length!==corridor.length||
   new Set(states.map(s=>s.id)).size!==corridor.length)
   throw Error("DIRECT_CORRIDOR_INTAKE_CENSUS_INCOMPLETE");
 return Object.freeze({
   schema:"geomacro.direct-corridor-source-intake.v1",
   checked_at:now.toISOString(),channel:"CORRIDOR_ONLY",
   source_count:corridor.length,
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
