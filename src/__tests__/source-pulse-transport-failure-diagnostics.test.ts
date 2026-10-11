import {describe,expect,it} from "vitest";
import {probe30MinThreeDomainPulse} from "../../scripts/ops/probe-30min-three-domain-pulse.mjs";
import {projectSourcePulseForD1} from "../../scripts/ops/write-30min-source-pulse-d1.mjs";

const now=new Date("2026-10-11T20:36:29Z");
const healthy=(s:{id:string;domain:string})=>({
  source_id:s.id,domain:s.domain,publisher_reachable:true,format_valid:true,
  original_publisher_topical_30m:0,original_publisher_topical_90m:0,
  original_publisher_topical_6h:0,original_publisher_open_24h_count:0,
  source_native_7d_release_items:0,
});
describe("#2041 private transport failures retain fixed safe reason codes",()=>{
  it("reveals why an independently sampled minerals publisher failed while keeping 1/2 status",async()=>{
    const report=await probe30MinThreeDomainPulse({now,probe:async(s:any)=>
      s.id==="nrcan_government_news_original_atom_review"
        ?{source_id:s.id,domain:s.domain,publisher_reachable:false,
          format_valid:false,reason:"SOURCE_CONTENT_TYPE_INVALID",
          primary_http_status:200}
        :healthy(s)});
    const mineral=report.actual_original_publisher_rows.find((r:any)=>r.domain==="rare_earth")!;
    expect(mineral.original_publishers_attempted).toBe(2);
    expect(mineral.original_publishers_successful).toBe(1);
    expect(mineral.independent_origin_pair_transport_healthy).toBe(false);
    expect(mineral.source_transport_failures).toEqual([{
      source_id:"nrcan_government_news_original_atom_review",
      reason:"SOURCE_CONTENT_TYPE_INVALID",http_status:200,fallback_http_status:null,
    }]);
    const persisted=projectSourcePulseForD1(report).find((r:any)=>r.domain==="rare_earth")!;
    expect(persisted.metadata.source_transport_failures).toEqual(mineral.source_transport_failures);
    expect(report.independently_verified_current_intelligence_count).toBe(0);
    expect(report.payments_performed).toBe(0);
    expect(report.supabase_requests).toBe(0);
  });
  it("never includes arbitrary upstream exceptions or unrecognized reason strings in metadata",async()=>{
    const report=await probe30MinThreeDomainPulse({now,probe:async(s:any)=>{
      if(s.id==="nrcan_government_news_original_atom_review")
        return {source_id:s.id,domain:s.domain,publisher_reachable:false,
          format_valid:false,reason:"secret-token-https://not-allowed.example",
          primary_http_status:"403",fallback_http_status:-1};
      return healthy(s);
    }});
    const failures=report.actual_original_publisher_rows.flatMap((r:any)=>r.source_transport_failures);
    expect(failures).toContainEqual({
      source_id:"nrcan_government_news_original_atom_review",
      reason:"SOURCE_PROBE_FAILED",http_status:null,fallback_http_status:null,
    });
    expect(JSON.stringify(projectSourcePulseForD1(report))).not.toContain("not-allowed");
  });
});
