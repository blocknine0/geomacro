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
import {collectDirectCorridorNativeNews} from "./direct-corridor-native-news.mjs";
import {collectCorridorOfficialReferences} from "./corridor-official-reference-adapters.mjs";
import {collectCredentialCorridorContext} from "./corridor-credential-context.mjs";

const TRANSPORT_ONLY=new Set(["asean_customs","ukmto_advisories","suez_navigation","panama_canal",
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
 observeIndependent=observeIndependentMaritimeOfficialContext,
 observeOfficial=collectCorridorOfficialReferences,
 observeCredential=collectCredentialCorridorContext
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
 const nativeSources=corridor.filter(s=>s.format==="rss"&&
      ["POLL_DIRECT_FEED","EXISTING_DIRECT_FEED"].includes(s.state));
 const native=await collectDirectCorridorNativeNews({sources:nativeSources,fetchImpl,now});
 for(const check of native.source_checks)
   add(byId.get(check.id),check.state,{metadata_candidates:check.metadata_candidates});
 // Independent official batch/series adapters, not headline news.
 // IMF PortWatch is an existing supplementary named-route family outside
 // the 37 source URLs; no extra registration or website routing implied.
 const official=await observeOfficial({now,fetchImpl});
 if(official?.schema!=="geomacro.corridor-official-reference-intake.v1"||
   official.channel!=="CORRIDOR_ONLY"||
   !Array.isArray(official.source_checks)||official.source_checks.length!==5||
   !Array.isArray(official.observations)||
   official.observation_count!==official.observations.length||
   official.observation_count>60||
   official.website_intelligence_writes!==0||
   official.commercial_rights_verified!==false)
   throw Error("CORRIDOR_OFFICIAL_SOURCE_CONTRACT_INVALID");
 const updated=new Set();
 for(const check of official.source_checks){
   if(check.id==="imf_portwatch")continue;
   if(!byId.has(check.id)||updated.has(check.id))
     throw Error("CORRIDOR_OFFICIAL_SOURCE_MAPPING_INVALID");
   updated.add(check.id);
   add(byId.get(check.id),check.state,{metadata_candidates:check.observations});
 }
 if(updated.size!==4)throw Error("CORRIDOR_OFFICIAL_SOURCE_MAPPING_INCOMPLETE");
 // Approved credentials are opt-in, supplied only by GitHub production secrets.
 // When absent, all credential providers report explicit non-active states.
 const credentials=await observeCredential({now,fetchImpl});
 if(credentials?.schema!=="geomacro.corridor-credential-context-intake.v1"||
   credentials.channel!=="CORRIDOR_ONLY"||
   !Array.isArray(credentials.source_checks)||credentials.source_checks.length!==4||
   !Array.isArray(credentials.observations)||
   credentials.observation_count!==credentials.observations.length||
   credentials.observation_count>5||
   credentials.website_intelligence_writes!==0||
   credentials.commercial_rights_verified!==false)
   throw Error("CORRIDOR_CREDENTIAL_SOURCE_CONTRACT_INVALID");
 const credentialIds=new Set();
 for(const check of credentials.source_checks){
   if(!byId.has(check.id)||credentialIds.has(check.id)||
     states.some(x=>x.id===check.id))
     throw Error("CORRIDOR_CREDENTIAL_SOURCE_MAPPING_INVALID");
   credentialIds.add(check.id);
   add(byId.get(check.id),check.state,{metadata_candidates:check.observations});
 }
 if(credentialIds.size!==4)throw Error("CORRIDOR_CREDENTIAL_SOURCE_MAPPING_INCOMPLETE");
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
    states.reduce((n,s)=>n+s.reference_count,0)!==39)
   throw Error("DIRECT_CORRIDOR_INTAKE_CENSUS_INCOMPLETE");
 return Object.freeze({
   schema:"geomacro.direct-corridor-source-intake.v2",
   checked_at:now.toISOString(),channel:"CORRIDOR_ONLY",
   source_count:corridor.length,source_link_occurrences:39,
   unique_linked_sources:37,missing_link_placeholders:0,
   source_checks:states,
   candidate_corridors:[...new Set(states.flatMap(s=>s.candidate_corridor_ids))].sort(),
   total_index_metadata_candidates:states.reduce((n,s)=>n+s.metadata_candidates,0),
   native_news_sources_polled:native.feed_count,
   news_candidate_count:native.candidate_count,
   news_candidates:native.news_candidates,
   native_news_event_verification:false,
   news_candidate_retention_hours:72,
   official_reference_source_checks:[...official.source_checks,...credentials.source_checks],
   official_reference_observation_count:official.observation_count+credentials.observation_count,
   official_reference_observations:[...official.observations,...credentials.observations],
   official_reference_events_verified:false,
   website_intelligence_writes:0,website_intelligence_enabled:false,
   source_news_collector_calls:0,
   native_event_evidence_written_to_canonical_db:false,
   d1_writes:0,b2_writes:0,supabase_writes:0,
   raw_publisher_body_saved:false,commercial_rights_verified:false,
   route_flow_verified:false,chargeable:false,signed_gro_generated:false,
   data_ready_for_verified_risk_gate:false
 });
}
