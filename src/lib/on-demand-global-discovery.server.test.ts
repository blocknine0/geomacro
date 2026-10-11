import { describe, expect, it, vi } from "vitest";
import { discoverOnDemandGlobal, discoverOnDemandForPrivateQualification } from "./on-demand-global-discovery.server";
import { buildAgentQueryPlan } from "./agent-query-plan";

const now = new Date("2026-10-11T12:00:00.000Z");
function upstream(url: string) {
  const address = new URL(url);
  if (address.hostname === "api.worldbank.org" && address.pathname === "/v2/country/IND") {
    return Response.json([{page:1,total:1},[{id:"IND",name:"India"}]]);
  }
  if (address.hostname === "api.worldbank.org") {
    return Response.json([{page:1,total:1},[
      {countryiso3code:"IND",date:"2025",value:3.2},
      {countryiso3code:"IND",date:"2024",value:4.1},
    ]]);
  }
  if (address.hostname === "api.gdeltproject.org") {
    return Response.json({articles:[{
      title:"Indian government reports critical minerals review",
      url:"https://publisher.example.gov/india-minerals",
      seendate:"20261011110000",
    }]});
  }
  if (address.hostname === "api.reliefweb.int") {
    return Response.json({data:[{fields:{date:{original:"2026-10-11T06:00:00Z"}}}]});
  }
  if (address.hostname === "www.gov.uk") {
    const isForeign=address.pathname.includes("foreign-commonwealth");
    const title=isForeign?"India diplomatic security talks":"India lithium critical minerals agreement";
    const link=isForeign?"https://www.gov.uk/government/news/india-diplomatic-talks":
      "https://www.gov.uk/government/news/india-lithium-critical-minerals-agreement";
    return new Response('<feed><entry><title>'+title+'</title>'+
      '<published>2026-10-11T07:00:00Z</published>'+
      '<link rel="alternate" href="'+link+'"/></entry></feed>',
      {headers:{"content-type":"application/atom+xml"}});
  }
  if (address.hostname === "news.un.org") {
    return new Response('<rss><channel><item><title>India conflict security council review</title>'+
      '<pubDate>Sun, 11 Oct 2026 07:00:00 GMT</pubDate>'+
      '<link>https://news.un.org/en/story/2026/10/1150000</link></item></channel></rss>',
      {headers:{"content-type":"application/rss+xml"}});
  }
  if (address.hostname === "www.federalreserve.gov") {
    return new Response('<rss><channel><item><title>India inflation monetary policy review</title>'+
      '<pubDate>Sun, 11 Oct 2026 07:00:00 GMT</pubDate>'+
      '<link>https://www.federalreserve.gov/newsevents/pressreleases/monetary20261011a.htm</link>'+
      '</item></channel></rss>',{headers:{"content-type":"application/rss+xml"}});
  }
  if (address.hostname === "www.minister.industry.gov.au") {
    return new Response('<rss><channel><item><title>India lithium critical minerals cooperation</title>'+
      '<pubDate>Sun, 11 Oct 2026 07:00:00 GMT</pubDate>'+
      '<link>https://www.minister.industry.gov.au/t-ayres/media/releases/india-minerals</link>'+
      '</item></channel></rss>',{headers:{"content-type":"application/rss+xml"}});
  }
  throw Error("UNKNOWN_TEST_SOURCE");
}
const fetchImpl=vi.fn(async (input: RequestInfo | URL) => upstream(String(input))) as unknown as typeof fetch;

describe("Global on-demand private retrieval, not pre-generated GRO",()=>{
  it("searches geopolitical, macro and minerals provider families concurrently and redacts original raw data",async()=>{
    const result=await discoverOnDemandGlobal({
      country_iso3:"IND",categories:["geopolitics","macro","rare_earth"],
    },{fetchImpl,now});
    expect(result.categories).toEqual(["geopolitics","macro","rare_earth"]);
    expect(result.reached_source_families).toBe(8);
    expect(result.network_attempts).toBe(12);
    expect(result.source_probes.some(x=>x.family==="world_bank_official_FP.CPI.TOTL.ZG" &&
      x.observed_record_count===2)).toBe(true);
    expect(result.source_probes.find(x=>x.family==="gdelt_doc_discovery")?.publication_clock_verified)
      .toBe(false);
    expect(result.source_probes.every(x=>x.independent_claim_verified===false &&
      x.derived_commercial_rights_verified===false)).toBe(true);
    expect(result.source_probes.filter(p=>
      ["un_news_original_publisher","uk_fcdo_original_publisher",
       "us_federal_reserve_original_publisher",
       "australian_industry_original_publisher"].includes(p.family) &&
      p.publication_clock_verified && p.observed_record_count===1)).toHaveLength(4);
    expect(result.payable).toBe(false);
    expect(result.signed_derived_intelligence_created).toBe(false);
    expect(result.settlement_attempted).toBe(false);
    expect(result.supabase_requests).toBe(0);
    expect(result.b2_requests).toBe(0);
    const publicText=JSON.stringify(result);
    expect(publicText).not.toContain("publisher.example.gov");
    expect(publicText).not.toContain("agreement");
    expect(publicText).not.toContain("3.2");
    expect(result.query_fingerprint_sha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it("rejects invalid country, duplicate family scope and oversized category fanout",async()=>{
    await expect(discoverOnDemandGlobal({country_iso3:"IND/path",categories:["macro"]},{fetchImpl,now}))
      .rejects.toThrow("ON_DEMAND_ISO3_INVALID");
    await expect(discoverOnDemandGlobal({country_iso3:"IND",categories:["macro","macro"]},{fetchImpl,now}))
      .rejects.toThrow("ON_DEMAND_CATEGORIES_INVALID");
    await expect(discoverOnDemandGlobal({country_iso3:"IND",categories:["unknown" as never]},{fetchImpl,now}))
      .rejects.toThrow("ON_DEMAND_CATEGORIES_INVALID");
  });
  it("makes source/metadata outages a no-charge degraded result, never a fake signed item",async()=>{
    const failing=vi.fn(async () => {throw Error("provider blocked");}) as unknown as typeof fetch;
    const result=await discoverOnDemandGlobal({
      country_iso3:"IND",categories:["geopolitics","rare_earth"],
    },{fetchImpl:failing,now});
    expect(result.network_attempts).toBe(1);
    expect(result.status).toBe("DISCOVERY_DEGRADED");
    expect(result.payable).toBe(false);
    expect(result.reached_source_families).toBe(0);
  });
  it("hash-binds explicit live discovery without disabling explicit GRO/risk gate requirements",()=>{
    const base={
      subjects:[{type:"country",country_iso3:"IND"}],
      question:"What is the current macroeconomic risk in India?",
    };
    const published=buildAgentQueryPlan(base);
    const live=buildAgentQueryPlan({...base,fulfillment_mode:"live_on_demand"});
    expect(published.required_modules).toContain("signed_risk_object");
    expect(published.required_modules).toContain("hot_topics");
    expect(live.required_modules).not.toContain("signed_risk_object");
    expect(live.required_modules).not.toContain("hot_topics");
    expect(live.required_modules).toContain("macro_monetary");
    expect(live.query_plan_hash).not.toBe(published.query_plan_hash);
    const explicit=buildAgentQueryPlan({
      subjects:[{type:"country",country_iso3:"IND"}],
      topics:["risk_object"],fulfillment_mode:"live_on_demand",
    });
    expect(explicit.required_modules).toContain("signed_risk_object");
  });
});

describe("Live source free-tier quota and memory safety",()=>{
  it("never buffers an oversized upstream body without Content-Length",async()=>{
    const responses=vi.fn(async () => new Response("x".repeat(192*1024+1),{
      status:200,
      headers:{"content-type":"application/json"},
    })) as unknown as typeof fetch;
    const proof=await discoverOnDemandGlobal({
      country_iso3:"IND",categories:["macro"],
    },{fetchImpl:responses,now});
    expect(proof.reached_source_families).toBe(0);
    expect(proof.status).toBe("DISCOVERY_DEGRADED");
    expect(proof.payable).toBe(false);
    expect(proof.settlement_attempted).toBe(false);
    expect(proof.network_attempts).toBe(3);
  });
  it("requests fixed HTTPS source URLs without redirects or customer freeform strings",async()=>{
    const requests: Array<{url:string;opts:RequestInit|undefined}>=[];
    const caller=vi.fn(async (request: RequestInfo|URL,opts?:RequestInit)=>{
      requests.push({url:String(request),opts});
      return upstream(String(request));
    }) as unknown as typeof fetch;
    const proof=await discoverOnDemandGlobal({
      country_iso3:"IND",categories:["macro","geopolitics"],
    },{fetchImpl:caller,now});
    expect(proof.network_attempts).toBe(9);
    expect(requests).toHaveLength(9);
    expect(requests.every(({url,opts})=>url.startsWith("https://") &&
      opts?.redirect==="error" && opts?.method==="GET")).toBe(true);
    expect(requests.every(({url})=>!url.includes("password") &&
      !url.includes("What%20are"))).toBe(true);
  });
});


describe("PRIVATE original-article evidence for on-demand owned intelligence",()=>{
  it("retains bounded first-party item metadata transiently but never returns it from the public-safe discovery method",async()=>{
    const internal=await discoverOnDemandForPrivateQualification({
      country_iso3:"IND",categories:["geopolitics","macro","rare_earth"],
    },{fetchImpl,now});
    expect(internal.discovery.network_attempts).toBe(12);
    const articles=internal.private_candidates;
    expect(articles.length).toBe(5);
    expect(articles.map(x=>x.publisher_family).sort()).toEqual([
      "australian_industry_original_publisher",
      "uk_dbt_original_publisher",
      "uk_fcdo_original_publisher",
      "un_news_original_publisher",
      "us_federal_reserve_original_publisher",
    ]);
    for(const article of articles) {
      expect(article.article_url).toMatch(/^https:\/\//);
      expect(article.article_title).toContain("India");
      expect(article.feed_item_published_at).toBe("2026-10-11T07:00:00.000Z");
      expect(article.article_identity_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(article.first_party_article_url_verified).toBe(true);
      expect(article.source_native_feed_publication_date_verified).toBe(true);
      expect(article.publisher_article_page_date_verified).toBe(false);
      expect(article.independent_same_event_verified).toBe(false);
      expect(article.derived_commercial_rights_verified).toBe(false);
      expect(article.score_verified).toBe(false);
      expect(article.signed_gro_verified).toBe(false);
      expect(article.paid_delivery_allowed).toBe(false);
    }
    const safe=await discoverOnDemandGlobal({
      country_iso3:"IND",categories:["geopolitics","macro","rare_earth"],
    },{fetchImpl,now});
    const serialized=JSON.stringify(safe);
    expect(serialized).not.toContain("article_url");
    expect(serialized).not.toContain("article_title");
    expect(serialized).not.toContain("India lithium");
    expect(serialized).not.toContain("https://www.gov.uk/government/news");
  });
  it("rejects future original feed dates rather than treating retrieval as native publication",async()=>{
    const proof=await discoverOnDemandForPrivateQualification({
      country_iso3:"IND",categories:["rare_earth","geopolitics"],
    },{fetchImpl,now:new Date("2026-10-11T06:00:00.000Z")});
    expect(proof.private_candidates).toHaveLength(0);
    // ReliefWeb may carry an earlier provider report date, which is metadata,
    // NOT a verified originating-publisher article. Only genuine original
    // issuer feed dates must fail here under the future-time test.
    expect(proof.discovery.source_probes.filter(p=>
      p.family.endsWith("_original_publisher") &&
      p.publication_clock_verified)).toHaveLength(0);
  });
  it("never keeps forged off-host UN articles or fake updated-date Atom items",async()=>{
    const fake=vi.fn(async (input:RequestInfo|URL)=>{
      const url=String(input);
      if (url.startsWith("https://news.un.org/")) return new Response(
        '<rss><channel><item><title>India conflict security council review</title>'+
        '<pubDate>Sun, 11 Oct 2026 07:00:00 GMT</pubDate>'+
        '<link>https://evil.example/syndicated/2026/10/1150000</link></item></channel></rss>',
      );
      if (url.includes("foreign-commonwealth-development-office.atom")) return new Response(
        '<feed><entry><title>India diplomatic security talks</title>'+
        '<updated>2026-10-11T07:00:00Z</updated>'+
        '<link rel="alternate" href="https://www.gov.uk/government/news/india-talks"/></entry></feed>',
      );
      return upstream(url);
    }) as unknown as typeof fetch;
    const proof=await discoverOnDemandForPrivateQualification({
      country_iso3:"IND",categories:["geopolitics"],
    },{fetchImpl:fake,now});
    expect(proof.private_candidates).toHaveLength(0);
    expect(proof.discovery.payable).toBe(false);
  });
});


describe("fair private source evidence under publisher flood",()=>{
  it("keeps every independent original institution represented in a 16-entry budget",async()=>{
    const mkItems=(title:string,link:(i:number)=>string,atom:boolean)=>
      Array.from({length:5},(_,i)=> atom
        ? '<entry><title>'+title+' '+i+'</title><published>2026-10-11T07:00:00Z</published>'+
          '<link rel="alternate" href="'+link(i)+'"/></entry>'
        : '<item><title>'+title+' '+i+'</title><pubDate>Sun, 11 Oct 2026 07:00:00 GMT</pubDate>'+
          '<link>'+link(i)+'</link></item>'
      ).join("");
    const flooded=vi.fn(async (request:RequestInfo|URL)=>{
      const uri=new URL(String(request));
      let body:string|null=null;
      let atom=false;
      if(uri.hostname==="news.un.org")
        body=mkItems("India conflict security council update",i=>
          "https://news.un.org/en/story/2026/10/115000"+i,false);
      if(uri.hostname==="www.federalreserve.gov")
        body=mkItems("India inflation monetary policy update",i=>
          "https://www.federalreserve.gov/newsevents/pressreleases/monetary20261011"+i+".htm",false);
      if(uri.hostname==="www.minister.industry.gov.au")
        body=mkItems("India lithium critical minerals update",i=>
          "https://www.minister.industry.gov.au/t-ayres/media/releases/india-"+i,false);
      if(uri.hostname==="www.gov.uk"){
        atom=true;
        const fcdo=uri.pathname.includes("foreign-commonwealth");
        body=mkItems(fcdo?"India diplomatic security update":"India lithium minerals update",i=>
          "https://www.gov.uk/government/news/india-"+(fcdo?"diplomatic-":"minerals-")+i,true);
      }
      if(body!==null) return new Response(atom?"<feed>"+body+"</feed>":"<rss><channel>"+body+"</channel></rss>");
      return upstream(String(request));
    }) as unknown as typeof fetch;
    const result=await discoverOnDemandForPrivateQualification({
      country_iso3:"IND",categories:["rare_earth","macro","geopolitics"],
    },{fetchImpl:flooded,now});
    expect(result.private_candidates).toHaveLength(16);
    const unique=new Set(result.private_candidates.map(x=>x.publisher_family));
    expect(unique.size).toBe(5);
    expect(new Set(result.private_candidates.map(x=>x.domain)))
      .toEqual(new Set(["geopolitics","macro","rare_earth"]));
    expect(result.private_candidates.every(x=>!x.paid_delivery_allowed)).toBe(true);
  });
});
