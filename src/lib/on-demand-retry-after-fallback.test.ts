import {describe,it,expect,vi} from "vitest";
import {discoverOnDemandForPrivateQualification,retryAfterCooldownMs}
  from "./on-demand-global-discovery.server";

describe("original provider rate-limit and fallback budget",()=>{
  const at=Date.parse("2026-10-14T08:00:00.000Z");
  it("honors numeric Retry-After seconds instead of silently replacing long cooldowns with 15 minutes",()=>{
    expect(retryAfterCooldownMs("3600",at)).toBe(3_600_000);
    expect(retryAfterCooldownMs(" 7200 ",at)).toBe(7_200_000);
    expect(retryAfterCooldownMs("15",at)).toBe(900_000);
    expect(retryAfterCooldownMs(null,at)).toBe(900_000);
    expect(retryAfterCooldownMs("not-a-time",at)).toBe(900_000);
    expect(retryAfterCooldownMs(new Date(at+2*3_600_000).toUTCString(),at)).toBe(7_200_000);
    expect(retryAfterCooldownMs("99999999",at)).toBe(31*86_400_000);
  });

  it("does not call issuer search after an independent original feed fallback already found a matching macro record",async()=>{
    const requested:string[]=[];
    const now=new Date("2026-10-14T09:00:00.000Z");
    const fetchImpl=vi.fn(async(input:RequestInfo|URL):Promise<Response>=>{
      const uri=new URL(String(input));requested.push(uri.toString());
      if(uri.hostname==="api.worldbank.org"){
        if(uri.pathname==="/v2/country/CHN")
          return Response.json([{page:1},[{id:"CHN",name:"China"}]]);
        return Response.json([{page:1},[
          {date:"2025",value:3.2,countryiso3code:"CHN"},
          {date:"2024",value:2.8,countryiso3code:"CHN"},
        ]]);
      }
      if(uri.hostname==="api.gdeltproject.org")
        return new Response("rate limit",{status:429,headers:{"retry-after":"3600"}});
      if(uri.hostname==="news.un.org")
        return new Response('<rss><channel><item><title>China ceasefire security council peace plan</title>'+
          '<pubDate>Wed, 14 Oct 2026 06:00:00 GMT</pubDate>'+
          '<link>https://news.un.org/en/story/2026/10/1123499</link></item></channel></rss>');
      if(uri.hostname==="www.federalreserve.gov")
        return new Response('<rss><channel></channel></rss>');
      if(uri.hostname==="www.gov.uk"){
        if(uri.pathname==="/api/search.json")throw Error("DUPLICATE_ISSUER_SEARCH");
        const title=uri.pathname.includes("hm-treasury")
          ?"China inflation financial treasury monetary policy update"
          :"China lithium critical minerals supply agreement";
        const article=uri.pathname.includes("hm-treasury")
          ?"https://www.gov.uk/government/news/china-financial-treasury-policy"
          :"https://www.gov.uk/government/news/china-lithium-critical-minerals-agreement";
        return new Response('<feed><entry><title>'+title+'</title>'+
          '<published>2026-10-14T06:00:00Z</published>'+
          '<link rel="alternate" href="'+article+'"/></entry></feed>');
      }
      throw Error("UNEXPECTED_HOST");
    }) as typeof fetch;
    const receipt=await discoverOnDemandForPrivateQualification({
      country_iso3:"CHN",categories:["geopolitics","macro","rare_earth"],
      topics:["conflict_geopolitics","macro_risk","critical_minerals"],
    },{fetchImpl,now});
    expect(receipt.discovery.network_attempts).toBeLessThanOrEqual(12);
    expect(requested).toHaveLength(receipt.discovery.network_attempts);
    expect(requested.some(url=>new URL(url).pathname==="/api/search.json")).toBe(false);
    expect(receipt.private_candidates.some(x=>
      x.domain==="macro"&&x.publisher_family==="uk_hmt_original_publisher")).toBe(true);
    expect(receipt.discovery.source_probes.filter(p=>p.family==="gdelt_doc_discovery"))
      .toHaveLength(3);
    expect(receipt.discovery.payable).toBe(false);
    expect(receipt.discovery.signed_derived_intelligence_created).toBe(false);
    expect(receipt.discovery.supabase_requests).toBe(0);
    expect(receipt.discovery.b2_requests).toBe(0);
  });
});
