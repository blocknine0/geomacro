import {describe,it,expect,vi} from "vitest";
import {discoverOnDemandForPrivateQualification}
  from "./on-demand-global-discovery.server";

const primary="https://www.minister.industry.gov.au/feed/t-ayres/rss.xml";
const backup="https://www.minister.industry.gov.au/feed/media-releases/rss.xml";
const now=new Date("2026-10-14T09:00:00.000Z");
const rss='<rss><channel><item>'+
  '<title>Australian lithium critical minerals investment policy</title>'+
  '<pubDate>Wed, 14 Oct 2026 06:00:00 GMT</pubDate>'+
  '<link>https://www.minister.industry.gov.au/t-ayres/media/releases/australian-lithium-policy</link>'+
  '</item></channel></rss>';

function fakeProvider(primaryStatus:"transport"|"403"|"429"){
  const seen:string[]=[];
  const fetchImpl=vi.fn(async(target:RequestInfo|URL):Promise<Response>=>{
    const url=String(target);seen.push(url);
    const parsed=new URL(url);
    if(parsed.hostname==="api.worldbank.org" && parsed.pathname==="/v2/country/AUS")
      return Response.json([{page:1},[{id:"AUS",name:"Australia"}]]);
    if(parsed.hostname==="api.gdeltproject.org")
      return Response.json({articles:[]});
    if(url===primary){
      if(primaryStatus==="transport")throw Error("primary-unavailable");
      return new Response("denied",{status:Number(primaryStatus)});
    }
    if(url===backup)return new Response(rss,{headers:{"content-type":"application/rss+xml"}});
    if(parsed.hostname==="www.gov.uk") {
      if(parsed.pathname==="/api/search.json")
        return Response.json({results:[]});
      return new Response("<feed></feed>",{headers:{"content-type":"application/atom+xml"}});
    }
    throw Error("UNEXPECTED_TEST_PROVIDER");
  }) as typeof fetch;
  return {seen,fetchImpl};
}

describe("official Australian critical-minerals first-party transport fallback",()=>{
  it("recovers a dated lithium original via the institution's media RSS on transport error",async()=>{
    const {seen,fetchImpl}=fakeProvider("transport");
    const proof=await discoverOnDemandForPrivateQualification({
      country_iso3:"AUS",categories:["rare_earth"],
      topics:["critical_minerals"],mineral:"lithium",
    },{fetchImpl,now});
    expect(seen.filter(x=>x===primary)).toHaveLength(1);
    expect(seen.filter(x=>x===backup)).toHaveLength(1);
    expect(proof.discovery.network_attempts).toBeLessThanOrEqual(12);
    expect(seen).toHaveLength(proof.discovery.network_attempts);
    const aust=proof.discovery.source_probes.filter(x=>
      x.family==="australian_industry_original_publisher");
    expect(aust).toHaveLength(1);
    expect(aust[0]?.reachable).toBe(true);
    expect(proof.private_candidates.some(x=>
      x.publisher_family==="australian_industry_original_publisher" &&
      x.domain==="rare_earth" &&
      x.feed_item_published_at==="2026-10-14T06:00:00.000Z" &&
      x.source_native_feed_publication_date_verified &&
      !x.independent_same_event_verified &&
      !x.derived_commercial_rights_verified &&
      !x.paid_delivery_allowed)).toBe(true);
    expect(proof.discovery.signed_derived_intelligence_created).toBe(false);
    expect(proof.discovery.payable).toBe(false);
    expect(proof.discovery.supabase_requests).toBe(0);
    expect(proof.discovery.b2_requests).toBe(0);
  });

  it.each(["403","429"] as const)(
    "never uses same-institution backup to bypass an explicit upstream %s",async(status)=>{
      const {seen,fetchImpl}=fakeProvider(status);
      const proof=await discoverOnDemandForPrivateQualification({
        country_iso3:"AUS",categories:["rare_earth"],
        topics:["critical_minerals"],mineral:"lithium",
      },{fetchImpl,now});
      expect(seen.filter(x=>x===primary)).toHaveLength(1);
      expect(seen).not.toContain(backup);
      expect(proof.discovery.source_probes.find(x=>
        x.family==="australian_industry_original_publisher")?.retrieval_state)
        .toBe(status==="429"?"RATE_LIMITED":"ACCESS_RESTRICTED");
      expect(proof.private_candidates.some(x=>
        x.publisher_family==="australian_industry_original_publisher")).toBe(false);
      expect(proof.discovery.network_attempts).toBeLessThanOrEqual(12);
      expect(proof.discovery.payable).toBe(false);
      expect(proof.discovery.settlement_attempted).toBe(false);
    });
});
