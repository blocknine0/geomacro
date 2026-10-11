import {describe,it,expect} from "vitest";
import {classifyScheduledOriginalMesh} from "../../scripts/ops/probe-scheduled-official-active-mesh.mjs";
import {EXPANDED_OFFICIAL_SOURCES} from "../../scripts/ops/probe-expanded-official-source-mesh.mjs";
import {isQuarantinedOfficialRoute,quarantinedOfficialSourceReceipt} from "../../scripts/lib/official-source-quarantine.mjs";
const now="2026-10-11T07:26:00.000Z";
function fixture(){
 const sources=EXPANDED_OFFICIAL_SOURCES.map(s=>isQuarantinedOfficialRoute(s.id)
   ?quarantinedOfficialSourceReceipt(s):{
    source_id:s.id,domain:s.domain,
    format_valid:true,publisher_reachable:true,primary_http_status:200,
    source_native_release_items:1,source_native_24h_release_items:0,
    original_publisher_topical_6h:s.original_hosts?0:null,
    original_publisher_topical_90m:s.original_hosts?0:null,
    original_publisher_topical_30m:s.original_hosts?0:null,
    commercial_eligible:false,commercial_rights_verified:false,
    current_scored_intelligence_verified:false,country_coverage_verified:false,
   });
 return {
   schema:"geomacro.expanded-official-source-observation.v1",
   observed_at:now,active_source_transport_healthy:true,
   active_source_count:12,quarantined_source_count:3,
   commercial_eligible:false,source_rights_verified:false,
   verified_country_count:0,sources,
   original_publisher_native_24h_topic_counts:{geopolitics:0,macro:0,rare_earth:0},
 };
}
describe("#1827 canonical scheduler uses working first-party mesh",()=>{
 it("12 real transports; three known blocked routes remain quarantined and every category original floor observed",()=>{
   const a=classifyScheduledOriginalMesh(fixture());
   expect(a.status).toBe("ACTIVE_OFFICIAL_ISSUERS_HEALTHY");
   expect(a.categories.map((x:any)=>x.active_original_issuer_count)).toEqual([2,3,3]);
   expect(a.categories.every((x:any)=>x.independent_original_transport_floor_met)).toBe(true);
   expect(a.quarantined_not_polled).toBe(3);
   expect(a.original_events_qualified_for_scoring).toBe(0);
   expect(a.signed_current_intelligence_verified).toBe(false);
   expect(a.supabase_writes).toBe(0);
   expect(a.b2_requests).toBe(0);
 });
 it("does not mark entire scheduler source mesh green if even one active publisher failed",()=>{
   const a=fixture();const row=a.sources.find((x:any)=>x.source_id==="fed_monetary_original_press_rss_review")!;
   row.format_valid=false;row.publisher_reachable=false;row.primary_http_status=429;
   a.active_source_transport_healthy=false;
   const x=classifyScheduledOriginalMesh(a);
   expect(x.status).toBe("ACTIVE_OFFICIAL_ISSUERS_DEGRADED");
   expect(x.active_transport_failures).toBe(1);
   expect(x.commercial_eligible).toBe(false);
 });
 it("refuses misleading rights upgrades, invented source IDs or a missing quarantine",()=>{
   const a=fixture();
   a.sources[0].commercial_rights_verified=true;
   expect(()=>classifyScheduledOriginalMesh(a)).toThrow("STEP1_SOURCE_RECEIPT_NOT_TRUSTED");
   const b=fixture();b.sources.pop();
   expect(()=>classifyScheduledOriginalMesh(b)).toThrow("STEP1_SOURCE_RECEIPT_NOT_TRUSTED");
 });
});
