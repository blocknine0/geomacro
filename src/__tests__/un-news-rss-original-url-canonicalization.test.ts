import { describe, expect, it, vi } from "vitest";
import { officialOriginalRssArticleUrl } from "../../scripts/lib/official-rss-original-link.mjs";
import { originalPublisherPrivateCandidates } from "../../scripts/lib/private-original-publisher-candidates.mjs";
import { EXPANDED_OFFICIAL_SOURCES, probeExpandedSource } from "../../scripts/ops/probe-expanded-official-source-mesh.mjs";

const now = new Date("2026-10-11T18:00:00Z");
const source = EXPANDED_OFFICIAL_SOURCES.find(
  (s: {id:string})=>s.id==="un_news_security_original_rss_review")!;
const canonical = "https://news.un.org/en/story/2026/10/1199001";
const routed = "https://news.un.org/feed/view/en/story/2026/10/1199001";
const item = (link=routed,guid=canonical,rel="true") =>
  "<item><title>Independent UN security agency statement on cross-border talks</title>"+
  "<pubDate>Sun, 11 Oct 2026 17:40:00 GMT</pubDate>"+
  "<link>"+link+"</link>"+
  '<guid isPermaLink="'+rel+'">'+guid+"</guid></item>";
const feed = (value:string) => '<rss version="2.0"><channel>'+value+"</channel></rss>";
const mock = (xml:string) => vi.fn(async()=>new Response(xml,{
  status:200,headers:{"content-type":"application/rss+xml"},
}));
describe("#2041 original UN News RSS canonical article identity",()=>{
  it("matches official feed/view and canonical GUID by exact story ID", async()=>{
    expect(officialOriginalRssArticleUrl(item(),source)).toBe(canonical);
    const xml=feed(item());
    const privateCandidates=originalPublisherPrivateCandidates(xml,source,now,{
      captureAllTopics:true,
    });
    expect(privateCandidates).toHaveLength(1);
    expect(privateCandidates[0].source_id).toBe(source.id);
    expect(privateCandidates[0].eligible_for_scoring).toBe(false);
    expect(privateCandidates[0].commercial_derived_use_rights_verified).toBe(false);
    const observation=await probeExpandedSource(source,{
      now,fetchImpl:mock(xml),openDiscovery:true,collectPrivateCandidates:true,
    });
    expect(observation.source_item_provenance_diagnostics).toMatchObject({
      entries_parsed:1,original_article_link_rejected:0,
      accepted_first_party_native_dated:1,
    });
    expect(observation.source_native_24h_release_items).toBe(1);
    expect(observation.private_original_article_candidates).toHaveLength(1);
    expect(observation.commercial_eligible).toBe(false);
  });
  it("still accepts direct canonical article links without a GUID",()=>{
    const direct=item(canonical,"","false");
    expect(officialOriginalRssArticleUrl(direct,source)).toBe(canonical);
    expect(originalPublisherPrivateCandidates(feed(direct),source,now,{
      captureAllTopics:true,
    })).toHaveLength(1);
  });
  it("never promotes mismatched, off-host, unsigned-permalink or ambiguous feed routes",()=>{
    const samples=[
      item(routed,"https://news.un.org/en/story/2026/10/1199002"),
      item(routed,canonical,"false"),
      item(routed,"https://evil.example/en/story/2026/10/1199001"),
      item("https://evil.example/feed/view/en/story/2026/10/1199001"),
      item("https://news.un.org/feed/view/en/story/2026/10/1199001?redirect=1"),
      item("https://news.un.org/feed/view/en/story/2026/10/1199001#frag"),
      item("https://news.un.org/feed/subscribe/en/news/all/rss.xml"),
      item("https://news.un.org/feed/view/en/story/2026/10/1199001/extra"),
    ];
    for(const untrusted of samples){
      expect(officialOriginalRssArticleUrl(untrusted,source)).toBeNull();
      expect(originalPublisherPrivateCandidates(feed(untrusted),source,now,{
        captureAllTopics:true,
      })).toHaveLength(0);
    }
  });
  it("does not treat an official RSS publisher as verified independent corroboration",async()=>{
    const observation=await probeExpandedSource(source,{
      now,fetchImpl:mock(feed(item())),openDiscovery:true,collectPrivateCandidates:true,
    });
    expect(observation.current_scored_intelligence_verified).toBe(false);
    expect(observation.same_event_independent_corroboration_verified).toBe(false);
    expect(observation.commercial_eligible).toBe(false);
  });
});
