import {describe,expect,it,vi} from "vitest";
import {officialOriginalRssArticleUrl} from "../../scripts/lib/official-rss-original-link.mjs";
import {originalPublisherPrivateCandidates} from "../../scripts/lib/private-original-publisher-candidates.mjs";
import {EXPANDED_OFFICIAL_SOURCES,probeExpandedSource} from "../../scripts/ops/probe-expanded-official-source-mesh.mjs";
const now=new Date("2026-10-11T18:00:00Z");
const fed=EXPANDED_OFFICIAL_SOURCES.find((x:{id:string})=>
  x.id==="fed_monetary_original_press_rss_review")!;
const url="https://www.federalreserve.gov/newsevents/pressreleases/monetary20261011a.htm";
const pub="Sun, 11 Oct 2026 17:40:00 GMT";
const feed=(value:string)=>
  '<rss><channel><item><title>Federal Reserve interest rate announcement</title>'+
  '<pubDate><![CDATA['+pub+']]></pubDate>'+
  '<link>'+value+'</link></item></channel></rss>';
const mock=(xml:string)=>vi.fn(async()=>new Response(xml,{
  status:200,headers:{"content-type":"application/rss+xml"},
}));
describe("#2041 first-party Fed original link CDATA compatibility",()=>{
  it("accepts one complete CDATA URL and produces correct first-party original SHA only",async()=>{
    const link="<![CDATA["+url+"]]>";
    const xml=feed(link);
    const item=xml.split("<item>")[1].split("</item>")[0];
    expect(officialOriginalRssArticleUrl(item,fed)).toBe(url);
    const obs=await probeExpandedSource(fed,{
      now,fetchImpl:mock(xml),openDiscovery:true,collectPrivateCandidates:true,
    });
    expect(obs.source_native_release_items).toBe(1);
    expect(obs.source_native_24h_release_items).toBe(1);
    expect(obs.source_item_provenance_diagnostics.original_article_link_rejected).toBe(0);
    const candidates=originalPublisherPrivateCandidates(xml,fed,now,{captureAllTopics:true});
    expect(candidates).toHaveLength(1);
    expect(candidates[0].eligible_for_scoring).toBe(false);
    expect(candidates[0].commercial_derived_use_rights_verified).toBe(false);
    expect(obs.current_scored_intelligence_verified).toBe(false);
  });
  it("fails closed on malformed CDATA, URL suffix injection, off-domain and redirects",()=>{
    const bad=[
      "<![CDATA["+url+"]]><script>extra</script>",
      "<![CDATA[https://evil.example/newsevents/pressreleases/monetary20261011a.htm]]>",
      "<![CDATA["+url+"?redirect=https://evil.example]]>",
      "<![CDATA[http://www.federalreserve.gov/newsevents/pressreleases/monetary20261011a.htm]]>",
      "<![CDATA["+url+"#anchor]]>",
      "<![CDATA[https://www.federalreserve.gov/feeds/press_all.xml]]>",
    ];
    for(const value of bad) {
      expect(originalPublisherPrivateCandidates(feed(value),fed,now,{captureAllTopics:true}))
        .toHaveLength(0);
    }
  });
  it("retains ordinary non-CDATA Fed RSS links and source-native time",()=>{
    const rows=originalPublisherPrivateCandidates(feed(url),fed,now,{captureAllTopics:true});
    expect(rows).toHaveLength(1);
    expect(rows[0].native_published_at).toBe("2026-10-11T17:40:00.000Z");
  });
});