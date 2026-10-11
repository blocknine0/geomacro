import {describe,it,expect,vi} from "vitest";
import {
  PUBLIC_ADAPTER_DOMAINS,probePublicSourcesIndependently,
} from "../../global-intelligence/scripts/probe-public-sources.mjs";

const t=()=>new Date("2026-10-11T10:00:00.000Z");
const valid=(id:string)=>({
  source_id:id,observations:1,
});

describe("#1827 real public-adapter three-domain source health",()=>{
  it("probes all 13 independently even if one provider is unavailable",async()=>{
    const probe=vi.fn(async(id:string)=>{
      if(id==="bgs")throw Error("provider read timed out");
      return valid(id);
    });
    const r=await probePublicSourcesIndependently({probe,now:t});
    expect(probe).toHaveBeenCalledTimes(13);
    expect(r.adapter_count).toBe(13);
    expect(r.working).toBe(12);
    expect(r.failed).toBe(1);
    expect(r.status).toBe("SOME_PUBLIC_ADAPTERS_DEGRADED");
    expect(r.per_domain.GEOPOLITICS.probed).toBe(2);
    expect(r.per_domain.MACRO.probed).toBe(9);
    expect(r.per_domain.CRITICAL_MINERALS.probed).toBe(2);
    expect(r.results.find((x:any)=>x.source_id==="bgs").status)
      .toBe("PROVIDER_UNAVAILABLE_OR_SHAPE_CHANGED");
    expect(r.d1_writes+r.supabase_writes+r.b2_requests).toBe(0);
    expect(r.commercial_eligible).toBe(false);
  });
  it("distinguishes a real empty data response from transport failure",async()=>{
    const r=await probePublicSourcesIndependently({
      now:t,probe:async(id:string)=>({source_id:id,observations:0}),
    });
    expect(r.failed).toBe(0);
    expect(r.working).toBe(13);
    expect(r.results.every((x:any)=>x.status==="WORKING_EMPTY_DATA_RESPONSE")).toBe(true);
    expect(r.original_events_scored).toBe(0);
  });
  it("does not expose upstream provider URL, text or potential credentials in error",async()=>{
    const r=await probePublicSourcesIndependently({
      now:t,probe:async()=>{
        throw Error("HTTP 403 https://user:secret@example.com/api?api_key=private-secret");
      },
    });
    expect(r.failed).toBe(13);
    const json=JSON.stringify(r);
    expect(json).not.toContain("private-secret");
    expect(json).not.toContain("example.com");
    expect(Object.keys(PUBLIC_ADAPTER_DOMAINS)).toHaveLength(13);
  });
});
