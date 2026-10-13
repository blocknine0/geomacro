import { describe, expect, it } from "vitest";
import { discoverOnDemandForPrivateQualification } from "./on-demand-global-discovery.server";

// Regression: true upstream query hits must be counted once per original URL,
// and a successful Macro result must not be attributed to another category.
describe("on-demand provider attribution and index deduplication",()=>{
  it("records separate providers for all three categories and deduplicates repeated GDELT URLs",async()=>{
    const fetchImpl=async(input:RequestInfo|URL):Promise<Response>=>{
      const uri=new URL(String(input));
      if(uri.hostname==="api.worldbank.org" && uri.pathname==="/v2/country/CHN")
        return Response.json([{total:1},[{id:"CHN",name:"China"}]]);
      if(uri.hostname==="api.worldbank.org")
        return Response.json([{total:2},[
          {countryiso3code:"CHN",date:"2025",value:5.1},
          {countryiso3code:"CHN",date:"2024",value:4.9},
        ]]);
      if(uri.hostname==="api.gdeltproject.org")
        return Response.json({articles:[
          {title:"China mineral supply update",url:"https://example.org/story-1"},
          {title:"China mineral supply update",url:"https://example.org/story-1"},
          {title:"China supply chain update",url:"https://example.org/story-2"},
        ]});
      if(uri.pathname.endsWith(".atom"))
        return new Response("<feed></feed>");
      return new Response("<rss><channel></channel></rss>");
    };
    const result=await discoverOnDemandForPrivateQualification({
      country_iso3:"CHN",categories:["geopolitics","macro","rare_earth"],
      mineral:"lithium",
    },{fetchImpl:fetchImpl as typeof fetch,now:new Date("2026-10-13T12:00:00Z")});
    const gdelt=result.discovery.source_probes.filter(p=>p.family==="gdelt_doc_discovery");
    expect(gdelt.map(p=>p.category).sort()).toEqual(["geopolitics","macro","rare_earth"]);
    expect(gdelt.map(p=>p.observed_record_count)).toEqual([2,2,2]);
    expect(result.discovery.source_probes.filter(p=>
      p.category==="macro" && p.family.startsWith("world_bank_official_"))).toHaveLength(2);
    expect(result.discovery.source_probes.every(p=>p.category!==undefined)).toBe(true);
    expect(result.discovery.network_attempts).toBe(11);
    expect(result.discovery.supabase_requests).toBe(0);
    expect(result.discovery.b2_requests).toBe(0);
    expect(result.discovery.payable).toBe(false);
  });
});
