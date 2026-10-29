import {describe,expect,it,vi} from "vitest";
import {discoverOnDemandForPrivateQualification,type OnDemandSearchInput} from "./on-demand-global-discovery.server";

const now=new Date("2026-10-29T12:00:00.000Z");
const officialUrl="https://www.gov.uk/government/news/india-security-council-ceasefire-briefing";
const officialTitle="India security council ceasefire briefing";

function fetcher(resultRows:unknown[]=[]){
  const calls:Array<{url:string;init?:RequestInit}>=[];
  const fn=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=String(input);calls.push({url,init});
    if(url==="https://api.tavily.com/search")
      return Response.json({results:resultRows});
    if(url.startsWith("https://api.gdeltproject.org/"))
      return Response.json({articles:[]});
    return new Response("unavailable",{status:503});
  }) as unknown as typeof fetch;
  return {fn,calls};
}

const input:OnDemandSearchInput={country_iso3:"IND",categories:["geopolitics"],
  topics:["conflict_geopolitics"],max_age_seconds:86_400};

describe("optional Tavily lead-only original-source fallback",()=>{
  it("uses one domain-restricted request and keeps the result private and unqualified",async()=>{
    const upstream=fetcher([{title:officialTitle,url:officialUrl,
      content:"untrusted index snippet",published_date:"2099-01-01"}]);
    const result=await discoverOnDemandForPrivateQualification(input,{
      fetchImpl:upstream.fn,now,indexSearchApiKey:"test-key",enableTavilyLeadSearch:true,
    });
    const request=upstream.calls.find(call=>call.url==="https://api.tavily.com/search");
    expect(request).toBeDefined();
    expect(upstream.calls.filter(call=>call.url==="https://api.tavily.com/search")).toHaveLength(1);
    const payload=JSON.parse(String(request?.init?.body));
    expect(payload.include_domains).toContain("www.gov.uk");
    expect(payload).toMatchObject({include_answer:false,include_raw_content:false,
      include_usage:false,max_results:10,search_depth:"basic"});
    expect(payload.query).toContain("India");
    expect(payload.query).not.toContain("untrusted index snippet");
    expect(result.private_candidates).toContainEqual(expect.objectContaining({
      article_url:officialUrl,article_title:officialTitle,index_original_page_pending:true,
      source_native_feed_publication_date_verified:false,
      publisher_article_page_date_verified:false,independent_same_event_verified:false,
      derived_commercial_rights_verified:false,score_verified:false,
      signed_gro_verified:false,paid_delivery_allowed:false,
    }));
    expect(result.discovery.source_probes).toContainEqual(expect.objectContaining({
      family:"tavily_index_discovery",category:"geopolitics",reachable:true,
      publication_clock_verified:false,independent_claim_verified:false,
    }));
    const publicJson=JSON.stringify(result.discovery);
    expect(publicJson).not.toContain(officialUrl);
    expect(publicJson).not.toContain(officialTitle);
    expect(result.discovery.payable).toBe(false);
    expect(result.discovery.network_attempts).toBeLessThanOrEqual(12);
  });

  it("rejects third-party, query-bearing and non-HTTPS results",async()=>{
    for(const url of [
      "https://attacker.invalid/government/news/india-security-council-briefing",
      officialUrl+"?tracking=1",
      "http://www.gov.uk/government/news/india-security-council-ceasefire-briefing",
    ]){
      const upstream=fetcher([{title:officialTitle,url}]);
      const result=await discoverOnDemandForPrivateQualification(input,{
        fetchImpl:upstream.fn,now,indexSearchApiKey:"test-key",enableTavilyLeadSearch:true,
      });
      expect(result.private_candidates).toEqual([]);
      expect(result.discovery.payable).toBe(false);
    }
  });

  it("does not contact the index when disabled or when its key is absent",async()=>{
    for(const options of [
      {indexSearchApiKey:"test-key",enableTavilyLeadSearch:false},
      {enableTavilyLeadSearch:true},
    ]){
      const upstream=fetcher([{title:officialTitle,url:officialUrl}]);
      await discoverOnDemandForPrivateQualification(input,{fetchImpl:upstream.fn,now,...options});
      expect(upstream.calls.some(call=>call.url==="https://api.tavily.com/search")).toBe(false);
    }
  });
});
