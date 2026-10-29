import {describe,expect,it,vi} from "vitest";
import {readStatelessWebsiteIntelligence} from "../lib/stateless-public-intelligence.server";

describe("Official Macro/FX and critical-minerals global source expansion",()=>{
  it("accepts bounded same-publisher GOV.UK search and an independent native-date DOE RSS",async()=>{
    const called:string[]=[];
    vi.stubGlobal("fetch",vi.fn(async(input:RequestInfo|URL)=>{
      const url=input instanceof Request?input.url:String(input);
      called.push(url);
      if(url.includes("/api/search.json?q=international%20trade&")||
         url.includes("/api/search.json?q=rare%20earth&")){
        return new Response(JSON.stringify({total:0,results:[]}),{
          status:200,headers:{"Content-Type":"application/json"},
        });
      }
      if(url==="https://www.energy.gov/rss/energygov/2193718"){
        const xml=`<rss version="2.0"><channel><title>DOE News</title>
          <item><title>DOE announces critical minerals recovery programme</title>
          <link>https://www.energy.gov/articles/critical-minerals-recovery-programme</link>
          <pubDate>Sat, 17 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>`;
        return new Response(xml,{status:200,headers:{"Content-Type":"application/rss+xml"}});
      }
      return new Response(null,{status:403});
    }));
    try{
      const at=Date.parse("2026-10-17T13:00:00Z");
      const macro=await readStatelessWebsiteIntelligence("macro",at);
      const minerals=await readStatelessWebsiteIntelligence("rare_earth",at);
      expect(macro.feed_count).toBe(24);
      expect(minerals.feed_count).toBe(18); // +one first-party DOE HTML fallback; fixed read-only budget
      expect(macro.healthy_feed_count).toBe(1);
      expect(minerals.healthy_feed_count).toBe(2);
      expect(called.some(s=>s.includes("q=international%20trade&"))).toBe(true);
      expect(called.some(s=>s.includes("q=rare%20earth&"))).toBe(true);
      expect(called).toContain("https://www.energy.gov/rss/energygov/2193718");
      // No claim that a search result's indexing time is a real original.
      expect(macro.signals).toEqual([]);
      // A real first-party link and native publication clock can qualify an
      // unscored derived signal, never paid GRO/current 195-country risk.
      expect(minerals.signals.every(s=>
        s.category==="rare_earth"&&s.status==="official_release_observed_unscored"&&
        s.same_event_corrob_verified===false&&s.severity===null)).toBe(true);
    }finally{vi.unstubAllGlobals();}
  });
  it("rejects fabricated original clocks and unrelated DOE hosts",async()=>{
    vi.stubGlobal("fetch",vi.fn(async(input:RequestInfo|URL)=>{
      const url=input instanceof Request?input.url:String(input);
      if(url==="https://www.energy.gov/rss/energygov/2193718"){
        const xml=`<rss version="2.0"><channel><lastBuildDate>Sat, 17 Oct 2026 12:00:00 GMT</lastBuildDate>
        <item><title>DOE critical minerals project</title>
        <link>https://www.energy.gov.evil.example/articles/critical-minerals-project</link>
        <description>Publisher data without original date</description></item></channel></rss>`;
        return new Response(xml,{status:200,headers:{"Content-Type":"application/rss+xml"}});
      }
      if(url.includes("/api/search.json?q=rare%20earth&"))
        return new Response(JSON.stringify({total:0,results:[]}),{
          headers:{"Content-Type":"application/json"},
        });
      return new Response(null,{status:403});
    }));
    try{
      const report=await readStatelessWebsiteIntelligence("rare_earth",
        Date.parse("2026-10-17T13:00:00Z"));
      expect(report.healthy_feed_count).toBe(2);
      expect(report.signals).toEqual([]);
    }finally{vi.unstubAllGlobals();}
  });
});
