import {describe,expect,it,vi} from "vitest";
import {discoverOnDemandForPrivateQualification} from "./on-demand-global-discovery.server";

/** Authentic original-source event from the Fed, 13 October 2026:
 * https://www.federalreserve.gov/newsevents/pressreleases/monetary20261013a.htm
 * Publisher article states release 2:00pm EDT (18:00Z). The fixture mocks
 * first-party RSS transport; it is NOT live-source or commercial proof.
 */
const eventTitle="Minutes of the Board's discount rate meetings on August 17, September 9, and September 16, 2026";
const originalUrl="https://www.federalreserve.gov/newsevents/pressreleases/monetary20261013a.htm";
const now=new Date("2026-10-14T10:00:00Z");

describe("actual Fed 13 Oct discount-rate original: bounded on-demand matching",()=>{
  it("preserves the genuine native-dated US macro candidate without granting rights or signing",async()=>{
    const urls:string[]=[];
    const fetchImpl=vi.fn(async(input:RequestInfo|URL):Promise<Response>=>{
      const url=new URL(String(input));urls.push(url.href);
      if(url.hostname==="api.worldbank.org" && url.pathname==="/v2/country/USA")
        return Response.json([{page:1},[{id:"USA",name:"United States"}]]);
      if(url.hostname==="api.worldbank.org")
        return Response.json([{page:1},[]]);
      if(url.hostname==="www.federalreserve.gov")
        return new Response(
          '<rss><channel><item><title>'+eventTitle+'</title>'+
          '<pubDate>Tue, 13 Oct 2026 18:00:00 GMT</pubDate>'+
          '<link>'+originalUrl+'</link></item></channel></rss>',
          {headers:{"content-type":"application/rss+xml"}});
      if(url.hostname==="api.gdeltproject.org")
        return Response.json({articles:[]});
      if(url.pathname==="/api/search.json")return Response.json({results:[]});
      if(url.pathname.endsWith(".atom"))return new Response("<feed></feed>");
      return new Response("<rss><channel></channel></rss>");
    }) as typeof fetch;
    const result=await discoverOnDemandForPrivateQualification({
      country_iso3:"USA",categories:["macro"],topics:["macro_risk"],
      max_age_seconds:86_400,
    },{fetchImpl,now});
    const originals=result.private_candidates.filter(x=>
      x.publisher_family==="us_federal_reserve_original_publisher");
    expect(originals).toHaveLength(1);
    expect(originals[0]).toMatchObject({
      article_url:originalUrl,
      feed_item_published_at:"2026-10-13T18:00:00.000Z",
      source_native_feed_publication_date_verified:true,
      first_party_article_url_verified:true,
      paid_delivery_allowed:false,
      derived_commercial_rights_verified:false,
      signed_gro_verified:false,
    });
    expect(result.discovery.network_attempts).toBeLessThanOrEqual(12);
    expect(result.discovery.payable).toBe(false);
    expect(result.discovery.supabase_requests).toBe(0);
    expect(result.discovery.b2_requests).toBe(0);
    expect(urls.filter(x=>x.includes("/feeds/press_all.xml"))).toHaveLength(1);
  });
});
