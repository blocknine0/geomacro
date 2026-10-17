import {describe,expect,it} from "vitest";
import {discoverOnDemandForPrivateQualification} from "./on-demand-global-discovery.server";

const now=new Date("2026-10-15T12:00:00.000Z");
const officialFamilies=new Set([
  "us_federal_reserve_original_publisher",
  "uk_hmt_original_publisher",
  "ecb_original_publisher",
]);
const samples=[
  {iso3:"GBR",name:"United Kingdom",issuer:"uk_hmt_original_publisher"},
  {iso3:"BGR",name:"Bulgaria",issuer:"ecb_original_publisher"},
  {iso3:"DEU",name:"Germany",issuer:"ecb_original_publisher"},
  {iso3:"USA",name:"United States",issuer:"us_federal_reserve_original_publisher"},
  {iso3:"POL",name:"Poland",issuer:"us_federal_reserve_original_publisher"},
] as const;

describe("195-country original-source issuer priority without Telegram dependency",()=>{
  it.each(samples)("reserves the original issuer slot for $iso3, while retaining strict paid gates",async sample=>{
    const seen:string[]=[];
    const fetchImpl=async(request:RequestInfo|URL):Promise<Response>=>{
      const url=new URL(String(request));seen.push(url.toString());
      if(url.hostname==="api.worldbank.org" && url.pathname.includes("/indicator/"))
        return Response.json([{page:1,pages:0},[]]);
      if(url.hostname==="api.worldbank.org")
        return Response.json([{page:1,pages:1},[{id:sample.iso3,name:sample.name}]]);
      if(url.hostname==="api.gdeltproject.org")return Response.json({articles:[]});
      if(url.hostname==="www.gov.uk" && url.pathname==="/api/search.json")
        return Response.json({results:[]});
      if(url.pathname.endsWith(".atom") || url.hostname==="api.io.canada.ca")
        return new Response("<feed></feed>",{headers:{"content-type":"application/atom+xml"}});
      return new Response("<rss><channel></channel></rss>",{
        headers:{"content-type":"application/rss+xml"},
      });
    };
    const result=await discoverOnDemandForPrivateQualification({
      country_iso3:sample.iso3,
      categories:["geopolitics","macro","rare_earth"],
      topics:["conflict_geopolitics","macro_risk","critical_minerals"],
      max_age_seconds:86_400,
    },{fetchImpl:fetchImpl as typeof fetch,now,disableDiscoveryIndex:true});
    const macroOriginals=result.discovery.source_probes.filter(p=>
      p.category==="macro" && officialFamilies.has(p.family));
    expect(macroOriginals[0]?.family).toBe(sample.issuer);
    expect(result.discovery.network_attempts).toBeLessThanOrEqual(12);
    expect(seen.length).toBe(result.discovery.network_attempts);
    expect(seen.every(u=>u.startsWith("https://"))).toBe(true);
    expect(result.discovery.supabase_requests).toBe(0);
    expect(result.discovery.b2_requests).toBe(0);
    expect(result.discovery.settlement_attempted).toBe(false);
    expect(result.discovery.payable).toBe(false);
    expect(result.private_original_review_candidates).toHaveLength(0);
    expect(result.discovery.signed_derived_intelligence_created).toBe(false);
  });
  it("does not mistake an unrelated euro-country or the ECB feed for a country-specific original",async()=>{
    // A registered monetary issuer is only transport evidence. The existing
    // country mention + real first-party article-date verifier owns promotion.
    const country="BGR";
    const res=await discoverOnDemandForPrivateQualification({
      country_iso3:country,categories:["macro","rare_earth","geopolitics"],
      topics:["macro_risk","critical_minerals","conflict_geopolitics"],
    },{fetchImpl:(async(url:RequestInfo|URL)=>{
      const u=new URL(String(url));
      if(u.hostname==="api.worldbank.org"&&u.pathname.includes("/indicator/"))
        return Response.json([{page:1,pages:0},[]]);
      if(u.hostname==="api.worldbank.org")
        return Response.json([{page:1},[{id:country,name:"Bulgaria"}]]);
      if(u.hostname==="www.ecb.europa.eu")
        return new Response('<rss><channel><item><title>German economic activity and inflation</title>'+
          '<pubDate>Thu, 15 Oct 2026 10:00:00 GMT</pubDate>'+
          '<link>https://www.ecb.europa.eu/press/pr/date/2026/html/foreign.en.html</link>'+
          '</item></channel></rss>');
      if(u.pathname.endsWith(".atom"))return new Response("<feed></feed>");
      return new Response("<rss><channel></channel></rss>");
    }) as typeof fetch,now,disableDiscoveryIndex:true});
    expect(res.discovery.payable).toBe(false);
    expect(res.private_original_review_candidates.some(x=>
      x.publisher_family==="ecb_original_publisher")).toBe(false);
  });
});
