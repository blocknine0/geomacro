import {describe,it,expect,vi} from "vitest";
import {discoverOnDemandForPrivateQualification}
  from "./on-demand-global-discovery.server";

describe("bounded GDELT index requests on explicit three-category queries",()=>{
  it.each([429,403])("stops same-request index burst after HTTP %i but keeps original publishers eligible",async(code)=>{
    const seen:string[]=[];
    const now=new Date("2026-10-14T09:00:00.000Z");
    const fake=vi.fn(async(target:RequestInfo|URL):Promise<Response>=>{
      const uri=new URL(String(target));seen.push(uri.toString());
      if(uri.hostname==="api.worldbank.org"){
        if(uri.pathname==="/v2/country/IND")
          return Response.json([{page:1},[{id:"IND",name:"India"}]]);
        return Response.json([{page:1},[
          {date:"2025",value:3.3,countryiso3code:"IND"},
          {date:"2024",value:4.1,countryiso3code:"IND"},
        ]]);
      }
      if(uri.hostname==="api.gdeltproject.org")
        return new Response("quota or access restricted",{status:code,
          headers:code===429?{"retry-after":"3600"}:{}});
      if(uri.hostname==="news.un.org")
        return new Response('<rss><channel><item><title>India ceasefire security council conflict developments</title>'+
          '<pubDate>Wed, 14 Oct 2026 06:00:00 GMT</pubDate>'+
          '<link>https://news.un.org/en/story/2026/10/1123499</link></item></channel></rss>');
      if(uri.hostname==="www.federalreserve.gov")
        return new Response('<rss><channel><item><title>India inflation monetary policy outlook</title>'+
          '<pubDate>Wed, 14 Oct 2026 06:00:00 GMT</pubDate>'+
          '<link>https://www.federalreserve.gov/newsevents/pressreleases/monetary20261014a.htm</link>'+
          '</item></channel></rss>');
      if(uri.hostname==="www.gov.uk"){
        const title="India lithium critical minerals supply policy";
        return new Response('<feed><entry><title>'+title+'</title>'+
          '<published>2026-10-14T06:00:00Z</published>'+
          '<link rel="alternate" href="https://www.gov.uk/government/news/india-lithium-critical-minerals"/></entry></feed>');
      }
      return new Response("",{status:404});
    }) as typeof fetch;
    const result=await discoverOnDemandForPrivateQualification({
      country_iso3:"IND",
      categories:["geopolitics","macro","rare_earth"],
      topics:["conflict_geopolitics","macro_risk","critical_minerals"],
    },{fetchImpl:fake,now});
    const gdelt=result.discovery.source_probes.filter(x=>x.family==="gdelt_doc_discovery");
    expect(gdelt.map(x=>x.category).sort()).toEqual(["geopolitics","macro","rare_earth"]);
    expect(gdelt.filter(x=>x.attempted)).toHaveLength(1);
    expect(gdelt.filter(x=>!x.attempted && x.retrieval_state==="COOLDOWN_ACTIVE"))
      .toHaveLength(2);
    expect(gdelt.find(x=>x.attempted)?.retrieval_state)
      .toBe(code===429?"RATE_LIMITED":"ACCESS_RESTRICTED");
    expect(seen.filter(x=>new URL(x).hostname==="api.gdeltproject.org")).toHaveLength(1);
    expect(result.discovery.network_attempts).toBeLessThanOrEqual(12);
    expect(seen).toHaveLength(result.discovery.network_attempts);
    expect(result.discovery.source_probes.some(p=>
      p.family==="un_news_original_publisher" && p.reachable)).toBe(true);
    expect(result.discovery.source_probes.some(p=>
      p.family==="us_federal_reserve_original_publisher" && p.reachable)).toBe(true);
    expect(result.discovery.source_probes.some(p=>
      p.family==="uk_dbt_original_publisher" && p.reachable)).toBe(true);
    expect(result.discovery.payable).toBe(false);
    expect(result.discovery.signed_derived_intelligence_created).toBe(false);
    expect(result.discovery.settlement_attempted).toBe(false);
    expect(result.discovery.supabase_requests).toBe(0);
    expect(result.discovery.b2_requests).toBe(0);
  });
});
