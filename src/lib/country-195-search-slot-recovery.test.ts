import {describe,expect,it} from "vitest";
import {discoverOnDemandForPrivateQualification,
  verifyOnDemandOriginalArticlePages} from "./on-demand-global-discovery.server";

const now=new Date("2026-10-15T12:00:00Z");
const original="/government/news/zambia-lithium-critical-minerals-policy";
const upstream=async(target:RequestInfo|URL):Promise<Response>=>{
  const url=new URL(String(target));
  if(url.hostname==="api.worldbank.org" && url.pathname.includes("/indicator/"))
    return Response.json([{page:1,pages:0},[]]);
  if(url.hostname==="api.worldbank.org")
    return Response.json([{page:1,pages:1},[{id:"ZMB",name:"Zambia"}]]);
  if(url.hostname==="api.gdeltproject.org")return Response.json({articles:[]});
  if(url.hostname==="www.gov.uk" && url.pathname==="/api/search.json") {
    if(url.searchParams.get("filter_organisations")==="department-for-business-innovation-science-and-trade")
      return Response.json({results:[{
        title:"Zambia lithium critical minerals production agreement",
        description:"UK and Zambia lithium mining cooperation",
        link:original,
        // Search index freshness may NOT become publisher original date.
        public_timestamp:"2026-10-15T11:55:00Z",
      }]});
    return Response.json({results:[]});
  }
  if(url.hostname==="www.gov.uk" && url.pathname===original)
    return new Response('<html><head><meta name="govuk:first-published-at" '+
      'content="2026-10-15T10:00:00Z"></head></html>',{
      headers:{"content-type":"text/html"},
    });
  if(url.pathname.endsWith(".atom") || url.hostname==="api.io.canada.ca")
    return new Response("<feed></feed>",{headers:{"content-type":"application/atom+xml"}});
  return new Response("<rss><channel></channel></rss>",{
    headers:{"content-type":"application/rss+xml"},
  });
};

describe("global original-source country search survives fixed 12-request selection",()=>{
  it("ZMB three-domain query reaches a country-matching GOV.UK original missed by all rolling feeds",async()=>{
    const requests:string[]=[];
    const fetchImpl=async(target:RequestInfo|URL)=>{
      requests.push(String(target));
      return upstream(target);
    };
    const r=await discoverOnDemandForPrivateQualification({
      country_iso3:"ZMB",categories:["geopolitics","macro","rare_earth"],
      topics:["conflict_geopolitics","macro_risk","critical_minerals"],
      max_age_seconds:86_400,
    },{fetchImpl:fetchImpl as typeof fetch,now});
    const searches=requests.filter(x=>new URL(x).pathname==="/api/search.json");
    expect(searches.length).toBeGreaterThanOrEqual(1);
    expect(searches.length).toBeLessThanOrEqual(2);
    expect(searches.some(x=>new URL(x).searchParams.get("filter_organisations")===
      "department-for-business-innovation-science-and-trade")).toBe(true);
    const minerals=r.private_original_review_candidates.filter(x=>
      x.domain==="rare_earth" && x.publisher_family==="uk_dbt_search_original_page");
    expect(minerals).toHaveLength(1);
    expect(minerals[0].article_title).toContain("Zambia");
    expect(minerals[0].search_index_original_page_pending).toBe(true);
    expect(minerals[0].source_native_feed_publication_date_verified).toBe(false);
    expect(minerals[0].publisher_article_page_date_verified).toBe(false);
    expect(r.discovery.network_attempts).toBeLessThanOrEqual(12);
    expect(requests).toHaveLength(r.discovery.network_attempts);
    expect(r.discovery.payable).toBe(false);
    expect(r.discovery.b2_requests).toBe(0);
    expect(r.discovery.supabase_requests).toBe(0);
    expect(r.discovery.settlement_attempted).toBe(false);
    expect(JSON.stringify(r.discovery)).not.toContain(original);
    const page=await verifyOnDemandOriginalArticlePages(
      r.private_original_review_candidates,{fetchImpl:fetchImpl as typeof fetch,now,maxAgeSeconds:86_400});
    expect(page.attempted).toBeLessThanOrEqual(4);
    expect(page.verified_candidates.some(x=>x.article_url.endsWith(original) &&
      x.page_original_published_at==="2026-10-15T10:00:00.000Z")).toBe(true);
    expect(page.verified_candidates.every(x=>x.paid_delivery_allowed===false)).toBe(true);
  });
  it("does not spend more than two early government index lookups when none match",async()=>{
    const hit:string[]=[];
    const empty=async(target:RequestInfo|URL):Promise<Response>=>{
      const url=new URL(String(target));
      hit.push(url.toString());
      if(url.pathname==="/api/search.json")return Response.json({results:[]});
      if(url.hostname==="api.worldbank.org"&&url.pathname.includes("/indicator/"))
        return Response.json([{page:1,pages:0},[]]);
      if(url.hostname==="api.worldbank.org")
        return Response.json([{page:1,pages:1},[{id:"ZMB",name:"Zambia"}]]);
      if(url.hostname==="api.gdeltproject.org")return Response.json({articles:[]});
      if(url.pathname.endsWith(".atom"))return new Response("<feed></feed>");
      return new Response("<rss><channel></channel></rss>");
    };
    const r=await discoverOnDemandForPrivateQualification({
      country_iso3:"ZMB",categories:["geopolitics","macro","rare_earth"],
      topics:["conflict_geopolitics","macro_risk","critical_minerals"],
      max_age_seconds:86_400,
    },{fetchImpl:empty as typeof fetch,now});
    const searches=hit.filter(x=>new URL(x).pathname==="/api/search.json");
    expect(searches.length).toBeLessThanOrEqual(2);
    expect(r.discovery.network_attempts).toBeLessThanOrEqual(12);
    expect(r.private_original_review_candidates).toHaveLength(0);
    expect(r.discovery.payable).toBe(false);
  });
});
