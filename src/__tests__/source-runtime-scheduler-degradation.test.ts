import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {recognizeDegradedSourceRuntimeObservation} from "../../scripts/lib/scheduled-source-runtime-observation.mjs";

const categories=["geopolitics","macro-fx","critical-minerals"].map(category=>({
  category,source_families_attempted:5,source_families_readable:4,derived_context_count:0,
}));
const report=()=>({schema:"geomacro.supabase-free-source-runtime.v1",
  source_reads_healthy:false,d1_exact_readback_verified:true,
  raw_records_persisted:false,supabase_requests:0,b2_requests:0,payments:0,
  scored:false,independent_reviewed:false,chargeable:false,contexts:categories,
  replacements:{reader:"bounded local official-source observations"},
  gdelt_event:{archive_integrity_verified:true},gdelt_gkg:{archive_integrity_verified:true},
});
const observe=(value:unknown,code=3)=>recognizeDegradedSourceRuntimeObservation({
  code,stdout:JSON.stringify(value)+"\n",
});

describe("source-runtime degraded observation scheduling",()=>{
  it("accepts only exact-readback, no-write degraded observations for all three categories",()=>{
    expect(observe(report())).toEqual({observed:true,source_reads_healthy:false,
      unreadable_source_families:3,archive_integrity_failures:0,
      source_status:"degraded",d1_exact_readback_verified:true,
      raw_records_persisted:false,scored:false,chargeable:false});
  });
  it("keeps D1 errors, malformed reports, raw data and all-healthy exit 3 fatal",()=>{
    expect(observe(report(),2)).toBeNull();
    expect(observe("not json")).toBeNull();
    expect(observe({...report(),d1_exact_readback_verified:false})).toBeNull();
    expect(observe({...report(),supabase_requests:1})).toBeNull();
    expect(observe({...report(),raw_records_persisted:true})).toBeNull();
    expect(observe({...report(),contexts:categories.slice(0,2)})).toBeNull();
    expect(observe({...report(),contexts:categories.map(x=>({...x,source_families_readable:5}))})).toBeNull();
  });
  it("records degraded observations and schedules a bounded retry without calling them healthy",()=>{
    const orchestrator=readFileSync("scripts/intelligence-orchestrator.mjs","utf8");
    expect(orchestrator).toContain("recognizeDegradedSourceRuntimeObservation(result)");
    expect(orchestrator).toContain("new Date(attemptMs + RETRY_SECONDS * 1000)");
    expect(orchestrator).toContain("source_transport_degraded: observationDegraded");
    expect(orchestrator).toContain("commercial_eligible:false");
  });
});
