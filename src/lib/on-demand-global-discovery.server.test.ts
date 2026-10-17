import { describe, expect, it, vi } from "vitest";
import {
  discoverOnDemandGlobal, discoverOnDemandForPrivateQualification,
  inferOnDemandMineral,
} from "./on-demand-global-discovery.server";
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
    expect(result.reached_source_families).toBe(7);
    expect(result.network_attempts).toBe(10);
    // World Bank data is still read, but its country-name lookup is not
    // necessary for canonical 195 countries, leaving provider budget for
    // original government and international feeds.
    expect(fetchImpl).not.toHaveBeenCalledWith(expect.stringContaining("/v2/country/IND?"),expect.anything());
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
    await expect(discoverOnDemandGlobal({country_iso3:"ZZZ",categories:["macro"]},{fetchImpl,now}))
      .rejects.toThrow("ON_DEMAND_COUNTRY_NOT_IN_CANONICAL_REGISTRY");
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
    // When World Bank identity is unavailable, an approved offline name
    // enables existing independent publisher fallback (still <=12 calls).
    // The old one-GET shortcut silently disabled all 195-country discovery.
    expect(result.network_attempts).toBeGreaterThan(1);
    expect(result.network_attempts).toBeLessThanOrEqual(12);
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
    // Country-name fallback may attempt other publishers after the first
    // oversized World Bank response, but source-byte caps remain enforced.
    expect(proof.network_attempts).toBeGreaterThanOrEqual(3);
    expect(proof.network_attempts).toBeLessThanOrEqual(12);
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
    expect(proof.network_attempts).toBe(7);
    expect(requests).toHaveLength(7);
    expect(requests.every(({url,opts})=>url.startsWith("https://") &&
      opts?.redirect==="manual" && opts?.method==="GET")).toBe(true);
    expect(requests.every(({url})=>!url.includes("password") &&
      !url.includes("What%20are"))).toBe(true);
  });
});


describe("PRIVATE original-article evidence for on-demand owned intelligence",()=>{
  it("retains bounded first-party item metadata transiently but never returns it from the public-safe discovery method",async()=>{
    const internal=await discoverOnDemandForPrivateQualification({
      country_iso3:"IND",categories:["geopolitics","macro","rare_earth"],
    },{fetchImpl,now});
    expect(internal.discovery.network_attempts).toBe(10);
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

  it("recovers legitimate UN permalink GUID and Federal Reserve CDATA for private query evidence",async()=>{
    const recovered=vi.fn(async (request:RequestInfo|URL)=>{
      const url=String(request);
      if(url.startsWith("https://news.un.org/"))return new Response(
        '<rss><channel><item><title><![CDATA[India conflict security council review]]></title>'+
        '<pubDate>Sun, 11 Oct 2026 07:00:00 GMT</pubDate>'+
        '<link>https://news.un.org/feed/view/en/story/2026/10/1150000</link>'+
        '<guid isPermaLink="true">https://news.un.org/en/story/2026/10/1150000</guid>'+
        '</item></channel></rss>');
      if(url.startsWith("https://www.federalreserve.gov/"))return new Response(
        '<rss><channel><item><title><![CDATA[India inflation monetary policy review]]></title>'+
        '<pubDate><![CDATA[Sun, 11 Oct 2026 07:00:00 GMT]]></pubDate>'+
        '<link><![CDATA[https://www.federalreserve.gov/newsevents/pressreleases/monetary20261011a.htm]]></link>'+
        '</item></channel></rss>');
      return upstream(url);
    }) as unknown as typeof fetch;
    const result=await discoverOnDemandForPrivateQualification({
      country_iso3:"IND",categories:["geopolitics","macro"],
    },{fetchImpl:recovered,now});
    expect(result.private_candidates.map(x=>x.article_url)).toContain(
      "https://news.un.org/en/story/2026/10/1150000");
    expect(result.private_candidates.map(x=>x.article_url)).toContain(
      "https://www.federalreserve.gov/newsevents/pressreleases/monetary20261011a.htm");
    expect(result.private_candidates.filter(x=>
      ["un_news_original_publisher","us_federal_reserve_original_publisher"].includes(x.publisher_family)))
      .toHaveLength(2);
    expect(result.discovery.payable).toBe(false);
    expect(result.discovery.signed_derived_intelligence_created).toBe(false);
    expect(JSON.stringify(result.discovery)).not.toContain("1150000");
  });

  it("never promotes wrong-ID, off-host, unsigned or query-bearing UN GUIDs",async()=>{
    const badGuids=[
      '<guid isPermaLink="true">https://news.un.org/en/story/2026/10/1159999</guid>',
      '<guid isPermaLink="true">https://evil.example/en/story/2026/10/1150000</guid>',
      '<guid>https://news.un.org/en/story/2026/10/1150000</guid>',
      '<guid isPermaLink="true">https://news.un.org/en/story/2026/10/1150000?tracking=1</guid>',
      '<guid isPermaLink="true"><![CDATA[https://news.un.org/en/story/2026/09/1150000]]></guid>',
    ];
    for(const guid of badGuids) {
      const denied=vi.fn(async (request:RequestInfo|URL)=>{
        const url=String(request);
        if(url.startsWith("https://news.un.org/"))return new Response(
          '<rss><channel><item><title>India conflict security council review</title>'+
          '<pubDate>Sun, 11 Oct 2026 07:00:00 GMT</pubDate>'+
          '<link>https://news.un.org/feed/view/en/story/2026/10/1150000</link>'+
          guid+'</item></channel></rss>');
        return upstream(url);
      }) as unknown as typeof fetch;
      const result=await discoverOnDemandForPrivateQualification({
        country_iso3:"IND",categories:["geopolitics"],
      },{fetchImpl:denied,now});
      expect(result.private_candidates.some(x=>x.publisher_family==="un_news_original_publisher")).toBe(false);
      expect(result.discovery.payable).toBe(false);
    }
  });

  it("rejects malformed CDATA and never borrows RSS lastBuildDate as publication",async()=>{
    const corrupted=vi.fn(async (request:RequestInfo|URL)=>{
      const url=String(request);
      if(url.startsWith("https://www.federalreserve.gov/"))return new Response(
        '<rss><channel><lastBuildDate>Sun, 11 Oct 2026 07:00:00 GMT</lastBuildDate>'+
        '<item><title>India inflation monetary policy review</title>'+
        '<pubDate><![CDATA[Sun, 11 Oct 2026 07:00:00 GMT]]>broken</pubDate>'+
        '<link>https://www.federalreserve.gov/newsevents/pressreleases/monetary20261011a.htm</link>'+
        '</item></channel></rss>');
      return upstream(url);
    }) as unknown as typeof fetch;
    const result=await discoverOnDemandForPrivateQualification({
      country_iso3:"IND",categories:["macro"],
    },{fetchImpl:corrupted,now});
    expect(result.private_candidates.some(x=>x.publisher_family==="us_federal_reserve_original_publisher")).toBe(false);
    expect(result.discovery.payable).toBe(false);
    expect(result.discovery.settlement_attempted).toBe(false);
  });


  it("retries UN on network/404/5xx only via fixed same-publisher RSS, as ONE source family",async()=>{
    const primary="https://news.un.org/feed/subscribe/en/news/topic/peace-and-security/feed/rss.xml";
    const alternate="https://news.un.org/feed/subscribe/en/news/all/rss.xml";
    for(const failure of ["network", "404", "503"]) {
      const seen:string[]=[];
      const recovering=vi.fn(async(request:RequestInfo|URL)=>{
        const url=String(request);seen.push(url);
        if(url===primary){
          if(failure==="network")throw Error("primary network failed");
          return new Response("publisher unavailable",{status:Number(failure)});
        }
        if(url===alternate)return new Response(
          '<rss><channel><item><title>India security council ceasefire review</title>'+
          '<pubDate>Sun, 11 Oct 2026 07:00:00 GMT</pubDate>'+
          '<link>https://news.un.org/en/story/2026/10/1150000</link>'+
          '</item></channel></rss>');
        return upstream(url);
      }) as unknown as typeof fetch;
      const result=await discoverOnDemandForPrivateQualification({
        country_iso3:"IND",categories:["geopolitics"],
      },{fetchImpl:recovering,now});
      expect(seen.filter(x=>x===primary)).toHaveLength(1);
      expect(seen.filter(x=>x===alternate)).toHaveLength(1);
      expect(result.discovery.network_attempts).toBe(4);
      expect(result.discovery.source_probes.filter(x=>x.family==="un_news_original_publisher")).toHaveLength(1);
      expect(result.private_candidates.some(x=>x.publisher_family==="un_news_original_publisher")).toBe(true);
      expect(result.discovery.payable).toBe(false);
      expect(result.discovery.settlement_attempted).toBe(false);
    }
  });


  it("enforces twelve real discovery requests even with optional approved ReliefWeb and UN failure",async()=>{
    const original=process.env.RELIEFWEB_APPROVED_APPNAME;
    process.env.RELIEFWEB_APPROVED_APPNAME="GeomacroApprovedTestOnly";
    try {
      const seen:string[]=[];
      const guarded=vi.fn(async (request:RequestInfo|URL)=>{
        const url=String(request);seen.push(url);
        if(url==="https://news.un.org/feed/subscribe/en/news/topic/peace-and-security/feed/rss.xml")
          throw Error("primary transport unavailable");
        return upstream(url);
      }) as unknown as typeof fetch;
      const result=await discoverOnDemandForPrivateQualification({
        country_iso3:"IND",categories:["geopolitics","macro","rare_earth"],
      },{fetchImpl:guarded,now});
      expect(result.discovery.network_attempts).toBe(12);
      expect(seen).toHaveLength(12);
      // The 12-call budget is the safety invariant. Serial GDELT attempts
      // may leave a legitimate slot for the already allowlisted UN transport
      // alternate; never mistake a backup from the SAME institution for an
      // independent original source.
      const unAlternate="https://news.un.org/feed/subscribe/en/news/all/rss.xml";
      if(seen.includes(unAlternate))
        expect(seen).toContain("https://news.un.org/feed/subscribe/en/news/topic/peace-and-security/feed/rss.xml");
      expect(result.discovery.payable).toBe(false);
      expect(result.discovery.settlement_attempted).toBe(false);
    } finally {
      if(original===undefined)delete process.env.RELIEFWEB_APPROVED_APPNAME;
      else process.env.RELIEFWEB_APPROVED_APPNAME=original;
    }
  });

  it("does not bypass UN auth/rate denials, or retry malformed 200 XML and stale articles",async()=>{
    const primary="https://news.un.org/feed/subscribe/en/news/topic/peace-and-security/feed/rss.xml";
    const alternate="https://news.un.org/feed/subscribe/en/news/all/rss.xml";
    for(const failure of ["401","403","429","bad-xml"]) {
      const seen:string[]=[];
      const blocked=vi.fn(async(request:RequestInfo|URL)=>{
        const url=String(request);seen.push(url);
        if(url===primary) return failure==="bad-xml"
          ? new Response("<html>not an RSS feed</html>")
          : new Response("upstream denied",{status:Number(failure)});
        return upstream(url);
      }) as unknown as typeof fetch;
      const result=await discoverOnDemandForPrivateQualification({
        country_iso3:"IND",categories:["geopolitics"],
      },{fetchImpl:blocked,now});
      expect(seen.filter(x=>x===alternate)).toHaveLength(0);
      expect(result.discovery.network_attempts).toBe(3);
      expect(result.private_candidates.some(x=>x.publisher_family==="un_news_original_publisher")).toBe(false);
      expect(result.discovery.payable).toBe(false);
    }
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
  it("rejects forged off-host UN links; only keeps unverified GOV.UK Atom link for independent page-date review",async()=>{
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
    expect(proof.private_candidates).toHaveLength(1);
    expect(proof.private_original_review_candidates).toHaveLength(1);
    const lead=proof.private_original_review_candidates[0];
    expect(lead.publisher_family).toBe("uk_fcdo_original_publisher");
    expect(lead.article_url).toBe("https://www.gov.uk/government/news/india-talks");
    expect(lead.feed_item_published_at).toBeNull();
    expect(lead.undated_atom_original_page_pending).toBe(true);
    expect(lead.source_native_feed_publication_date_verified).toBe(false);
    expect(lead.publisher_article_page_date_verified).toBe(false);
    expect(lead.independent_same_event_verified).toBe(false);
    expect(lead.derived_commercial_rights_verified).toBe(false);
    expect(lead.signed_gro_verified).toBe(false);
    expect(lead.paid_delivery_allowed).toBe(false);
    expect(proof.discovery.source_probes.find(x=>
      x.family==="uk_fcdo_original_publisher")?.publication_clock_verified).toBe(false);
    expect(proof.private_candidates.some(x=>x.publisher_family==="un_news_original_publisher")).toBe(false);
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

describe("simplified commodity-aware on-demand routing", () => {
  it("extracts only fixed mineral vocabulary without forwarding a freeform question", () => {
    expect(inferOnDemandMineral("What is the current lithium supply risk in China?")).toBe("lithium");
    expect(inferOnDemandMineral("Rare-earth export restrictions")).toBe("rare earth");
    expect(inferOnDemandMineral("What is the macro risk?")).toBeNull();
    expect(() => inferOnDemandMineral("Compare lithium and cobalt supply"))
      .toThrow("ON_DEMAND_MULTIPLE_MINERALS_UNSUPPORTED");
  });

  it("reuses the same global providers but narrows mineral news and first-party evidence", async () => {
    const urls: string[] = [];
    const captured = vi.fn(async (url: RequestInfo | URL) => {
      urls.push(String(url));
      return upstream(String(url));
    }) as unknown as typeof fetch;
    const lithium = await discoverOnDemandForPrivateQualification({
      country_iso3: "IND", categories: ["rare_earth"], mineral: "lithium",
    }, {fetchImpl: captured, now});
    const broad = await discoverOnDemandForPrivateQualification({
      country_iso3: "IND", categories: ["rare_earth"],
    }, {fetchImpl: captured, now});
    const cobalt = await discoverOnDemandForPrivateQualification({
      country_iso3: "IND", categories: ["rare_earth"], mineral: "cobalt",
    }, {fetchImpl: captured, now});

    expect(lithium.discovery.network_attempts).toBe(3);
    expect(lithium.private_candidates).toHaveLength(2);
    expect(lithium.private_candidates.every((c) => c.article_title.toLowerCase().includes("lithium")))
      .toBe(true);
    expect(cobalt.private_candidates).toHaveLength(0);
    expect(lithium.discovery.query_fingerprint_sha256).not.toBe(broad.discovery.query_fingerprint_sha256);
    expect(lithium.discovery.query_fingerprint_sha256).not.toBe(cobalt.discovery.query_fingerprint_sha256);
    const queries = urls.filter((url) => new URL(url).hostname === "api.gdeltproject.org").map((url) =>
      new URL(url).searchParams.get("query"));
    expect(queries).toContain('"India" AND "lithium"');
    expect(queries).toContain('"India" AND "cobalt"');
    expect(urls.every((url) => !url.includes("current%20lithium%20supply"))).toBe(true);
    for (const proof of [lithium, broad, cobalt]) {
      expect(proof.discovery.payable).toBe(false);
      expect(proof.discovery.signed_derived_intelligence_created).toBe(false);
      expect(proof.discovery.supabase_requests).toBe(0);
      expect(proof.discovery.b2_requests).toBe(0);
      expect(proof.private_candidates.every((candidate) => !candidate.paid_delivery_allowed)).toBe(true);
    }
  });

  it("rejects unsupported commodity scopes before performing any network call", async () => {
    const upstreamSpy = vi.fn(async () => { throw Error("should not fetch"); }) as unknown as typeof fetch;
    await expect(discoverOnDemandGlobal({
      country_iso3: "IND", categories: ["macro"], mineral: "lithium",
    }, {fetchImpl: upstreamSpy, now})).rejects.toThrow("ON_DEMAND_MINERAL_SCOPE_INVALID");
    await expect(discoverOnDemandGlobal({
      country_iso3: "IND", categories: ["rare_earth"], mineral: "unknown" as never,
    }, {fetchImpl: upstreamSpy, now})).rejects.toThrow("ON_DEMAND_MINERAL_SCOPE_INVALID");
    expect(upstreamSpy).not.toHaveBeenCalled();
  });
});
