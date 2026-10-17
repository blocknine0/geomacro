import {describe,expect,it,vi} from "vitest";
import {readStatelessWebsiteIntelligence} from "../lib/stateless-public-intelligence.server";

describe("IEA critical-minerals failure diagnostics are truthful",()=>{
  it("classifies an unreachable official index as HTTP 4xx instead of unknown source failure",async()=>{
    const original=globalThis.fetch;
    const calls:string[]=[];
    try {
      vi.stubGlobal("fetch",vi.fn(async (input:RequestInfo|URL)=>{
        const url=input instanceof Request?input.url:String(input);
        calls.push(url);
        return new Response(null,{status:403});
      }));
      const lanes:{index:number;transport_ok:boolean;transport_failure_class?:string}[]=[];
      const report=await readStatelessWebsiteIntelligence("rare_earth",
        Date.parse("2026-10-17T12:00:00.000Z"),
        (index,diag)=>lanes.push({index,transport_ok:diag.transport_ok,
          transport_failure_class:diag.transport_failure_class}));
      expect(report.healthy_feed_count).toBe(0);
      // The IEA global-only feed comes last in the fixed rare-earth source list.
      const iea=lanes.at(-1);
      expect(iea).toMatchObject({transport_ok:false,transport_failure_class:"http_4xx"});
      expect(report.signals).toHaveLength(0);
      expect(calls.some(url=>url.startsWith("https://www.iea.org/news?"))).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      globalThis.fetch=original;
    }
  });
});
