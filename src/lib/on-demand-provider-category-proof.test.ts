import { describe, expect, it } from "vitest";
import { discoverOnDemandForPrivateQualification, inferOnDemandFreshnessSeconds } from "./on-demand-global-discovery.server";

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


describe("query-driven independent fallback without paid providers",()=>{
  it("keeps a relevant first-party original when GDELT is rate limited",async()=>{
    const now=new Date("2026-10-13T18:00:00Z");
    const seen:string[]=[];
    const fetchImpl=async (target:RequestInfo|URL):Promise<Response>=>{
      const url=new URL(String(target));seen.push(url.href);
      if(url.hostname==="api.worldbank.org")
        return Response.json([{page:1},[{id:"CHN",name:"China"}]]);
      if(url.hostname==="api.gdeltproject.org")
        return new Response("rate limited",{status:429});
      if(url.pathname.endsWith("/foreign-commonwealth-development-office.atom"))
        return new Response(
          '<feed><entry><title>China sanctions restrictions announced</title>'+
          '<published>2026-10-13T15:00:00Z</published>'+
          '<link rel="alternate" href="https://www.gov.uk/government/news/china-sanctions-restrictions"/></entry></feed>');
      if(url.hostname==="www.gov.uk")
        return new Response("<feed></feed>");
      return new Response("<rss><channel></channel></rss>");
    };
    const proof=await discoverOnDemandForPrivateQualification({
      country_iso3:"CHN",categories:["geopolitics"],
      topics:["sanctions_restrictions"],max_age_seconds:86_400,
    },{fetchImpl:fetchImpl as typeof fetch,now});
    expect(proof.discovery.source_probes.find(p=>p.family==="gdelt_doc_discovery")?.reachable).toBe(false);
    expect(proof.private_candidates).toHaveLength(1);
    expect(proof.private_candidates[0].publisher_family).toBe("uk_fcdo_original_publisher");
    expect(proof.private_candidates[0].feed_item_published_at).toBe("2026-10-13T15:00:00.000Z");
    expect(proof.private_candidates[0].source_native_feed_publication_date_verified).toBe(true);
    expect(proof.private_candidates[0].paid_delivery_allowed).toBe(false);
    expect(seen.filter(url=>url.includes("api.gdeltproject.org"))).toHaveLength(1);
    expect(proof.discovery.supabase_requests).toBe(0);
    expect(proof.discovery.b2_requests).toBe(0);
  });

  it("does not relabel stale or off-topic official reports as fresh matching evidence",async()=>{
    const now=new Date("2026-10-13T18:00:00Z");
    const fetchImpl=async(target:RequestInfo|URL):Promise<Response>=>{
      const url=new URL(String(target));
      if(url.hostname==="api.worldbank.org")
        return Response.json([{page:1},[{id:"CHN",name:"China"}]]);
      if(url.hostname==="api.gdeltproject.org")
        return Response.json({articles:[{title:"China nickel mining investments",url:"https://publisher.example/one"}]});
      if(url.pathname.endsWith(".atom"))return new Response(
        '<feed><entry><title>China nickel mining investments</title>'+
        '<published>2026-10-10T15:00:00Z</published>'+
        '<link rel="alternate" href="https://www.gov.uk/government/news/china-nickel"/></entry></feed>');
      return new Response("<rss><channel></channel></rss>");
    };
    const proof=await discoverOnDemandForPrivateQualification({
      country_iso3:"CHN",categories:["rare_earth"],mineral:"lithium",
      topics:["critical_minerals"],max_age_seconds:3600,
    },{fetchImpl:fetchImpl as typeof fetch,now});
    expect(proof.private_candidates).toHaveLength(0);
    expect(proof.discovery.source_probes.find(p=>p.family==="gdelt_doc_discovery")?.observed_record_count).toBe(0);
    expect(proof.discovery.payable).toBe(false);
  });
});

describe("natural-language freshness routing without payment/hash changes",()=>{
  it("supports explicit bounded rolling lookbacks",()=>{
    expect(inferOnDemandFreshnessSeconds("China sanctions in the last 48 hours")).toBe(172_800);
    expect(inferOnDemandFreshnessSeconds("Lithium exports within 7 days")).toBe(604_800);
    expect(inferOnDemandFreshnessSeconds("Inflation in the past 1 week")).toBe(604_800);
    expect(inferOnDemandFreshnessSeconds("Current inflation")).toBeNull();
    expect(inferOnDemandFreshnessSeconds("Last 2 weeks")).toBe(1_209_600);
    expect(()=>inferOnDemandFreshnessSeconds("Last 5 weeks")).toThrow("ON_DEMAND_FRESHNESS_UNSUPPORTED");
    expect(()=>inferOnDemandFreshnessSeconds("Last 2 hours and past 3 days")).toThrow("ON_DEMAND_FRESHNESS_AMBIGUOUS");
  });
});
