import {describe,it,expect,vi} from "vitest";
import {runSupabaseFreeSourceRuntime} from "../lib/supabase-free-source-runtime.server";
import {validOpenDataContext} from "../lib/category-open-data-contract";
import {readCategoryOpenData} from "../lib/category-open-data.server";
import {getSourceRuntimeContext,getSourceRuntimeStatus} from "../../workers/control-plane/src/source-runtime-status.mjs";
const now=new Date("2026-10-16T13:30:00.000Z"),at=now.getTime();
const context=(category:string)=>({schema_version:"geomacro.category-open-data-observations.v1",category,mode:"UNSCORED_OPEN_DATA_CONTEXT",
  checked_at:now.toISOString(),source_families_attempted:2,source_families_readable:1,source_families_unavailable:1,
  status:"NO_QUALIFYING_CONTEXT",findings:[],licensed_source_credits:[],observations_are_current_release_news:false,
  source_event_and_period_clocks_distinct:true,source_names_and_urls_private_except_required_credits:true,
  upstream_payloads_exposed:false,risk_score:null,independent_same_event_verification:false,signed_gro_generated:false,
  x402_payment_required:false,chargeable:false,paid_delivery_authorized:false,persistent_storage_written:false});
const fixture=()=>{
  const rows=new Map();return {rows,state:{loadRows:async()=>structuredClone(rows),persist:async(scope:string,payload:any,update:any)=>{
    rows.set(scope,{payload,last_success_at:update.last_success_at});return payload;}},
    readOpen:vi.fn(async(category:string)=>context(category)) as any,
    eventRead:vi.fn(async()=>({status:"STATIC_EVENT_BATCH_READ",archive_integrity_verified:true,original_news_freshness_verified:false})) as any,
    discoveryRead:vi.fn(async()=>({gdelt_static_bulk_discovery:{state:"CURRENT_GKG_BATCH_SCANNED_PRIVATE_DISCOVERY_ONLY",archive_integrity_verified:true}})) as any};
};
const workerEnv=(rows:Map<any,any>)=>({DB:{prepare:()=>({bind:(_pipeline:string,scope:string)=>({first:async()=>
  rows.has(scope)?{metadata_json:JSON.stringify(rows.get(scope).payload)}:null})})}});
describe("remaining source stages run without frozen Supabase",()=>{
  it("persists and exactly reads all three derived contexts and independent Event/GKG status",async()=>{
    const f=fixture();const r=await runSupabaseFreeSourceRuntime({...f,now});
    expect(r.d1_exact_readback_verified).toBe(true);expect(r.source_reads_healthy).toBe(true);
    expect(f.rows.size).toBe(4);expect(f.readOpen).toHaveBeenCalledTimes(3);
    expect(f.readOpen.mock.calls.every(c=>c[1].fallbackToD1===false)).toBe(true);
    const env=workerEnv(f.rows),status=await (await getSourceRuntimeStatus(env,at)).json();
    expect(status.status).toBe("ALL_CATEGORY_LANES_READABLE");expect(status.gdelt_index_clock_is_original_publication).toBe(false);
    for(const category of ["geopolitics","macro-fx","critical-minerals"])
      expect((await getSourceRuntimeContext(env,category,at)).status).toBe(200);
    expect((await getSourceRuntimeStatus(env,at+3*3600_000+1)).status).toBe(503);
  });
  it("retains a valid prior context with its old clock when upstream fails, and exposes degradation",async()=>{
    const f=fixture();await runSupabaseFreeSourceRuntime({...f,now});
    const later=new Date(at+90*60_000);
    f.readOpen=vi.fn(async category=>({...context(category),checked_at:later.toISOString(),
      source_families_readable:0,source_families_unavailable:2,status:"ALL_SOURCES_UNAVAILABLE"})) as any;
    const r=await runSupabaseFreeSourceRuntime({...f,now:later});
    expect(r.source_reads_healthy).toBe(false);
    const stored=f.rows.get("macro").payload;
    expect(stored.context.checked_at).toBe(now.toISOString());expect(stored.latest_reader_status).toBe("ALL_SOURCES_UNAVAILABLE");
    expect((await (await getSourceRuntimeStatus(workerEnv(f.rows),later.getTime())).json()).status).toBe("SOURCE_LANES_DEGRADED");
  });
  it("serves the actual D1 context from the existing reader without renewing its observation time",async()=>{
    const old={...context("macro-fx"),checked_at:new Date(at-3600_000).toISOString()};
    const fake=vi.fn(async(url:any)=>String(url).includes("source-runtime-context")?Response.json(old):new Response("",{status:503}));
    const result=await readCategoryOpenData("macro-fx",{now:at,fetcher:fake as any});
    expect(result).toEqual(old);expect(fake.mock.calls.filter(c=>String(c[0]).includes("source-runtime-context"))).toHaveLength(1);
  });
  it("never serves stale, cross-category, source-leaking or paid context as fallback",async()=>{
    for(const change of [{checked_at:new Date(at-4*3600_000).toISOString()},
      {category:"geopolitics"},{source_url:"https://private.invalid"},{paid_delivery_authorized:true}]){
      const bad={...context("macro-fx"),...change};expect(validOpenDataContext(bad,"macro-fx",at)).toBe(false);
      const fake=async(url:any)=>String(url).includes("source-runtime-context")?Response.json(bad):new Response("",{status:503});
      expect((await readCategoryOpenData("macro-fx",{now:at,fetcher:fake as any})).source_families_readable).toBe(0);
    }
  });
  it("rejects mismatched D1 readback and raw metadata before green completion",async()=>{
    const f=fixture();let reads=0;
    f.state.loadRows=async()=>{if(++reads>1)return new Map();return f.rows;};
    await expect(runSupabaseFreeSourceRuntime({...f,now})).rejects.toThrow();
    const g=fixture();g.eventRead=async()=>({archive_integrity_verified:true,source_url:"https://private.invalid"}) as any;
    await expect(runSupabaseFreeSourceRuntime({...g,now})).rejects.toThrow("SOURCE_RUNTIME_BOUNDARY_FAILED");
  });
});
