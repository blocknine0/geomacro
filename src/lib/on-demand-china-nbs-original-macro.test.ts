import {describe,expect,it,vi} from "vitest";
import {discoverOnDemandForPrivateQualification,type OnDemandSearchInput} from "./on-demand-global-discovery.server";
import {originalPublisherMatchesCountry} from "./on-demand-original-subject-matching";

const now=new Date("2026-10-29T12:00:00.000Z");
const releaseUrl="https://www.stats.gov.cn/english/PressRelease/202610/t20261029_1966000.html";
const releaseTitle="Consumer Price Inflation in September 2026";
const nbsRss=`<?xml version="1.0"?><rss version="2.0"><channel><item>
  <title>${releaseTitle}</title><link>${releaseUrl}</link>
  <pubDate>Thu, 29 Oct 2026 09:00:00 +0800</pubDate>
  <description><![CDATA[China's consumer prices and inflation release.]]></description>
</item></channel></rss>`;
const input:OnDemandSearchInput={country_iso3:"CHN",categories:["macro"],
  topics:["macro_risk"],max_age_seconds:86_400};

describe("official China NBS macro release recovery",()=>{
  it("uses the registered first-party dated release and keeps every paid gate closed",async()=>{
    const calls:string[]=[];
    const fetchImpl=vi.fn(async(request:RequestInfo|URL)=>{
      const url=String(request);calls.push(url);
      if(url==="https://www.stats.gov.cn/english/PressRelease/rss.xml")
        return new Response(nbsRss,{headers:{"content-type":"application/rss+xml"}});
      return new Response("unavailable",{status:503});
    }) as unknown as typeof fetch;
    const result=await discoverOnDemandForPrivateQualification(input,{fetchImpl,now});
    expect(calls).toContain("https://www.stats.gov.cn/english/PressRelease/rss.xml");
    expect(result.private_candidates).toContainEqual(expect.objectContaining({
      domain:"macro",publisher_family:"china_nbs_original_macro_publisher",
      article_url:releaseUrl,article_title:releaseTitle,
      feed_item_published_at:"2026-10-29T01:00:00.000Z",
      first_party_article_url_verified:true,
      source_native_feed_publication_date_verified:true,
      publisher_article_page_date_verified:false,
      independent_same_event_verified:false,
      derived_commercial_rights_verified:false,
      score_verified:false,signed_gro_verified:false,paid_delivery_allowed:false,
    }));
    expect(result.discovery.payable).toBe(false);
    expect(result.discovery.source_probes).toContainEqual(expect.objectContaining({
      family:"china_nbs_original_macro_publisher",category:"macro",
      reachable:true,publication_clock_verified:true,
    }));
    expect(JSON.stringify(result.discovery)).not.toContain(releaseUrl);
    expect(JSON.stringify(result.discovery)).not.toContain(releaseTitle);
    expect(result.discovery.network_attempts).toBeLessThanOrEqual(12);
  });

  it("binds issuer-only country relevance only to China and this exact source family",()=>{
    expect(originalPublisherMatchesCountry(releaseTitle,"", "CHN","China",
      "china_nbs_original_macro_publisher")).toBe(true);
    expect(originalPublisherMatchesCountry(releaseTitle,"", "JPN","Japan",
      "china_nbs_original_macro_publisher")).toBe(false);
    expect(originalPublisherMatchesCountry(releaseTitle,"", "CHN","China",
      "un_economy_original_publisher")).toBe(false);
  });

  it("rejects stale NBS feed publication dates",async()=>{
    const stale=nbsRss.replace("Thu, 29 Oct 2026 09:00:00 +0800",
      "Thu, 23 Oct 2026 09:00:00 +0800");
    const fetchImpl=vi.fn(async(request:RequestInfo|URL)=>
      String(request)==="https://www.stats.gov.cn/english/PressRelease/rss.xml"
        ?new Response(stale,{headers:{"content-type":"application/rss+xml"}})
        :new Response("unavailable",{status:503})) as unknown as typeof fetch;
    const result=await discoverOnDemandForPrivateQualification(input,{fetchImpl,now});
    expect(result.private_candidates).toEqual([]);
    expect(result.discovery.payable).toBe(false);
  });
});
