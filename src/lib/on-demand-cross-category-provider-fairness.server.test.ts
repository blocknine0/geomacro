import {describe,it,expect,vi} from "vitest";
import {discoverOnDemandForPrivateQualification}
  from "./on-demand-global-discovery.server";

describe("cross-category canonical on-demand bounded original-publisher recovery",()=>{
  it("prioritizes two distinct original publishers per category ahead of index-only discovery within cap",async()=>{
    const seen:string[]=[];
    const now=new Date("2026-10-14T09:00:00.000Z");
    const fake=vi.fn(async (target:RequestInfo|URL):Promise<Response>=>{
      const uri=new URL(String(target));seen.push(uri.toString());
      if(uri.hostname==="api.worldbank.org"){
        if(uri.pathname==="/v2/country/IND")
          return Response.json([{page:1},[{id:"IND",name:"India"}]]);
        return Response.json([{page:1},[
          {date:"2025",value:3.3,countryiso3code:"IND"},
          {date:"2024",value:4.2,countryiso3code:"IND"},
        ]]);
      }
      if(uri.hostname==="api.gdeltproject.org")
        return Response.json({articles:[]});
      if(uri.hostname==="news.un.org")
        return new Response("rate limit",{status:429});
      if(uri.hostname==="www.gov.uk"){
        const isGeo=uri.pathname.includes("foreign-commonwealth");
        const title=isGeo?"India diplomatic ceasefire security talks":
          "India lithium critical minerals agreement";
        const url=isGeo
          ?"https://www.gov.uk/government/news/india-diplomatic-ceasefire-talks"
          :"https://www.gov.uk/government/news/india-lithium-critical-minerals-agreement";
        return new Response('<feed><entry><title>'+title+'</title>'+
          '<published>2026-10-14T06:00:00Z</published>'+
          '<link rel="alternate" href="'+url+'"/></entry></feed>');
      }
      if(uri.hostname==="www.federalreserve.gov")
        return new Response('<rss><channel><item><title>India inflation monetary policy review</title>'+
          '<pubDate>Wed, 14 Oct 2026 06:00:00 GMT</pubDate>'+
          '<link>https://www.federalreserve.gov/newsevents/pressreleases/monetary20261014a.htm</link>'+
          '</item></channel></rss>');
      throw Error("UNEXPECTED_TEST_ENDPOINT");
    }) as typeof fetch;
    const result=await discoverOnDemandForPrivateQualification({
      country_iso3:"IND",categories:["geopolitics","macro","rare_earth"],
      topics:["conflict_geopolitics","macro_risk","critical_minerals"],
    },{fetchImpl:fake,now});
    expect(result.discovery.network_attempts).toBeLessThanOrEqual(12);
    expect(result.discovery.network_attempts).toBeGreaterThanOrEqual(6);
    expect(seen).toHaveLength(result.discovery.network_attempts);
    const gdelt=result.discovery.source_probes.filter(p=>p.family==="gdelt_doc_discovery");
    // Three domains x two distinct originating publishers, one annual
    // WDI context read, and three index-only GDELT scopes = 10 primary
    // GETs, leaving two slots for approved country original issuer search.
    expect(gdelt.map(p=>p.category).sort()).toEqual(["geopolitics","macro","rare_earth"]);
    expect(seen.filter(x=>new URL(x).hostname==="api.gdeltproject.org")).toHaveLength(3);
    expect(result.discovery.source_probes.filter(p=>
      p.family.startsWith("world_bank_official_"))).toHaveLength(1);
    for(const domain of ["geopolitics","macro","rare_earth"] as const){
      const attempted=result.discovery.source_probes.filter(p=>
        p.category===domain &&
        p.family!=="gdelt_doc_discovery" &&
        !p.family.startsWith("world_bank_official_") &&
        p.family!=="reliefweb_discovery" &&
        p.attempted);
      expect(new Set(attempted.map(p=>p.family)).size).toBeGreaterThanOrEqual(2);
    }
    const titles=result.private_candidates;
    expect(new Set(titles.map(c=>c.domain))).toEqual(
      new Set(["geopolitics","macro","rare_earth"]));
    // A 429 from UN never promotes an index URL; independent FCDO may recover.
    expect(result.discovery.source_probes.find(p=>p.family==="un_news_original_publisher")
      ?.retrieval_state).toBe("RATE_LIMITED");
    expect(result.discovery.source_probes.find(p=>p.family==="uk_fcdo_original_publisher")
      ?.reachable).toBe(true);
    expect(titles.some(x=>x.publisher_family==="uk_fcdo_original_publisher")).toBe(true);
    expect(titles.some(x=>x.publisher_family==="us_federal_reserve_original_publisher")).toBe(true);
    expect(titles.some(x=>x.publisher_family==="uk_dbt_original_publisher")).toBe(true);
    expect(titles.every(x=>x.paid_delivery_allowed===false &&
      x.publisher_article_page_date_verified===false)).toBe(true);
    expect(result.discovery.signed_derived_intelligence_created).toBe(false);
    expect(result.discovery.payable).toBe(false);
    expect(result.discovery.settlement_attempted).toBe(false);
    expect(result.discovery.supabase_requests).toBe(0);
    expect(result.discovery.b2_requests).toBe(0);
    expect(result.private_original_review_candidates.every(x=>
      x.country_iso3==="IND" && x.independent_same_event_verified===false &&
      x.derived_commercial_rights_verified===false)).toBe(true);
    const publicSummary=JSON.stringify(result.discovery);
    expect(publicSummary).not.toContain("india-lithium-critical");
    expect(publicSummary).not.toContain("diplomatic-ceasefire");
  });
});