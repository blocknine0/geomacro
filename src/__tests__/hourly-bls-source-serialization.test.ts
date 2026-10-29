import {describe,expect,it,vi} from "vitest";
import {readStatelessWebsiteIntelligence} from "../lib/stateless-public-intelligence.server";

describe("BLS native Atom hourly source transport",()=>{
  it("reads the three BLS feeds sequentially, but keeps other official lanes parallel",async()=>{
    let activeBls=0,peakBls=0;
    const requested:string[]=[];
    const fetchMock=vi.fn(async (input:RequestInfo|URL)=>{
      const url=input instanceof Request?input.url:String(input);
      if(url.startsWith("https://www.bls.gov/feed/")){
        activeBls++;
        peakBls=Math.max(peakBls,activeBls);
        await new Promise(resolve=>setTimeout(resolve,4));
        activeBls--;
        requested.push(new URL(url).pathname);
        return new Response("<feed xmlns=\"http://www.w3.org/2005/Atom\"></feed>",{
          status:200,headers:{"Content-Type":"application/atom+xml"},
        });
      }
      return new Response(null,{status:403});
    });
    vi.stubGlobal("fetch",fetchMock);
    try{
      const diagnostics:{index:number;ok:boolean}[]=[];
      const report=await readStatelessWebsiteIntelligence("macro",
        Date.parse("2026-10-17T15:00:00Z"),
        (index,lane)=>diagnostics.push({index,ok:lane.transport_ok}));
      expect(peakBls).toBe(1);
      expect(requested).toEqual(["/feed/cpi.rss","/feed/empsit.rss","/feed/ximpim.rss"]);
      expect(report.feed_count).toBe(24);
      expect(report.healthy_feed_count).toBe(3);
      expect(diagnostics).toHaveLength(report.feed_count);
      expect(diagnostics.map(x=>x.index)).toEqual([...diagnostics.keys()]);
      expect(report.signals).toEqual([]);
    }finally{
      vi.unstubAllGlobals();
    }
  });
});
