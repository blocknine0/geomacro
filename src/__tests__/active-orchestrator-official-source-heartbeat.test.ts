import {describe,it,expect,vi} from "vitest";
import {EXPANDED_OFFICIAL_SOURCES} from "../../scripts/ops/probe-expanded-official-source-mesh.mjs";
import {quarantinedOfficialSourceReceipt,isQuarantinedOfficialRoute} from "../../scripts/lib/official-source-quarantine.mjs";
import {summarizeOrchestratorOfficialSourceHeartbeat} from "../../scripts/ops/run-active-official-source-heartbeat.mjs";

const receipt=()=>{
  const sources=EXPANDED_OFFICIAL_SOURCES.map((s:any)=>
    isQuarantinedOfficialRoute(s.id)?quarantinedOfficialSourceReceipt(s):{
      source_id:s.id,domain:s.domain,format_valid:true,publisher_reachable:true,
      primary_http_status:200,reason:"PRIVATE_SOURCE_TRANSPORT_ONLY",
      source_native_release_items:0,source_native_24h_release_items:0,
      original_publisher_topical_6h:s.original_hosts?0:null,
      original_publisher_topical_90m:s.original_hosts?0:null,
      original_publisher_topical_30m:s.original_hosts?0:null,
      commercial_eligible:false,commercial_rights_verified:false,
      country_coverage_verified:false,current_scored_intelligence_verified:false,
    });
  return {
    schema:"geomacro.expanded-official-source-observation.v1",
    observed_at:"2026-10-11T07:07:12.714Z",
    sources,active_source_count:11,quarantined_source_count:3,
    active_source_transport_healthy:true,status:"ACTIVE_SOURCE_TRANSPORT_OBSERVED_WITH_QUARANTINE",
    original_publisher_native_24h_topic_counts:{geopolitics:0,macro:0,rare_earth:0},
    commercial_eligible:false,source_rights_verified:false,verified_country_count:0,
  };
};
describe("#1827 recover scheduler official source heartbeat",()=>{
 it("treats 11 active publishers plus 3 quarantines as transport-only; never invents current news",()=>{
  const out=summarizeOrchestratorOfficialSourceHeartbeat(receipt());
  expect(out.source_transport_ok).toBe(true);
  expect(out.original_issuer_quorum_by_category.map((r:any)=>r.minimum_two_issuers_ok))
    .toEqual([true,true,true]);
  expect(out.original_24h_topical_counts).toEqual({geopolitics:0,macro:0,rare_earth:0});
  expect(out.country_article_relevance_and_rights_verified).toBe(false);
  expect(out.signed_live_gro_verified).toBe(false);
  expect(out.commercial_eligible).toBe(false);
  expect(out.d1_writes+out.b2_requests+out.supabase_writes).toBe(0);
 });
 it("any live inactive publisher transport cannot claim all sources healthy",()=>{
  const x=receipt();const row=x.sources.find((r:any)=>r.source_id==="fed_monetary_original_press_rss_review")!;
  row.format_valid=false;row.publisher_reachable=false;row.primary_http_status=null;
  x.active_source_transport_healthy=false;x.status="ACTIVE_SOURCE_TRANSPORT_DEGRADED";
  const out=summarizeOrchestratorOfficialSourceHeartbeat(x);
  expect(out.source_transport_ok).toBe(false);
  expect(out.active_source_failures).toBe(1);
 });
 it("requires actual distinct original organizations, not same institution two feeds",()=>{
  const x=receipt();
  for(const id of ["un_news_security_original_rss_review","statcan_prices_original_atom_review",
    "nrcan_government_news_original_atom_review"]){
    const row=x.sources.find((r:any)=>r.source_id===id)!;
    row.format_valid=false;row.publisher_reachable=false;row.primary_http_status=null;
  }
  x.active_source_transport_healthy=false;x.status="ACTIVE_SOURCE_TRANSPORT_DEGRADED";
  const out=summarizeOrchestratorOfficialSourceHeartbeat(x);
  expect(out.source_transport_ok).toBe(false);
  expect(out.original_issuer_quorum_by_category.some((r:any)=>!r.minimum_two_issuers_ok)).toBe(true);
 });
 it("rejects paid flags and untrusted source inventories",()=>{
  const x=receipt();x.sources[0].commercial_eligible=true;
  expect(()=>summarizeOrchestratorOfficialSourceHeartbeat(x)).toThrow();
  const y=receipt();y.sources.pop();
  expect(()=>summarizeOrchestratorOfficialSourceHeartbeat(y)).toThrow();
 });
});
