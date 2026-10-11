import { describe, expect, it, vi } from "vitest";
import { officialItemNativePublicationMs } from "../../scripts/lib/official-native-item-publication-date.mjs";
import { originalPublisherPrivateCandidates } from "../../scripts/lib/private-original-publisher-candidates.mjs";
import { EXPANDED_OFFICIAL_SOURCES, probeExpandedSource } from "../../scripts/ops/probe-expanded-official-source-mesh.mjs";

const now=new Date("2026-10-11T18:00:00Z");
const fed=EXPANDED_OFFICIAL_SOURCES.find(
  (item:{id:string})=>item.id==="fed_monetary_original_press_rss_review")!;
const article="https://www.federalreserve.gov/newsevents/pressreleases/monetary20261011a.htm";
const date="Sun, 11 Oct 2026 17:30:00 GMT";
const xml=(published:string|null,link=article)=>
  '<rss><channel><lastBuildDate>Sun, 11 Oct 2026 18:00:00 GMT</lastBuildDate>'+
  '<item><title>Federal Reserve monetary policy interest rate statement</title>'+
  '<link>'+link+'</link>'+
  (published===null?"":'<pubDate>'+published+'</pubDate>')+
  '</item></channel></rss>';
const fetchXML=(body:string)=>vi.fn(async()=>new Response(body,{
  status:200,headers:{"content-type":"application/rss+xml"},
}));

describe("#2041 CDATA original publisher publication clock recovery",()=>{
  it("parses one bounded valid original RSS CDATA pubDate, but no other clocks",()=>{
    const unwrapped=officialItemNativePublicationMs(date);
    const wrapped=officialItemNativePublicationMs("<![CDATA["+date+"]]>");
    expect(wrapped).toBe(unwrapped);
    expect(new Date(wrapped).toISOString()).toBe("2026-10-11T17:30:00.000Z");
    for(const invalid of [
      "<![CDATA["+date+"]]>garbage",
      "<![CDATA[<script>alert(1)</script>]]>",
      "<!DOCTYPE foo>",
      "Not-a-real-date",
      "",
      "&lt;bad&gt;",
    ])expect(officialItemNativePublicationMs(invalid)).toBeNaN();
  });
  it("returns genuine source-native dated Fed article metadata to private discovery, still no scoring/payment",async()=>{
    const feed=xml("<![CDATA["+date+"]]>");
    const result=await probeExpandedSource(fed,{
      now,fetchImpl:fetchXML(feed),openDiscovery:true,collectPrivateCandidates:true,
    });
    expect(result.publisher_reachable).toBe(true);
    expect(result.source_native_release_items).toBe(1);
    expect(result.source_native_24h_release_items).toBe(1);
    expect(result.original_publisher_open_24h_count).toBe(1);
    expect(result.source_item_provenance_diagnostics.item_native_published_invalid_date)
      .toBe(0);
    expect(result.unparseable_native_rss_date_shapes.CDATA_WRAPPER).toBe(0);
    const candidates=originalPublisherPrivateCandidates(feed,fed,now,{captureAllTopics:true});
    expect(candidates).toHaveLength(1);
    expect(candidates[0].native_published_at).toBe("2026-10-11T17:30:00.000Z");
    expect(candidates[0].eligible_for_publication).toBe(false);
    expect(candidates[0].commercial_derived_use_rights_verified).toBe(false);
    expect(result.current_scored_intelligence_verified).toBe(false);
    expect(result.commercial_eligible).toBe(false);
  });
  it("rejects future, missing per-item date and off-host article despite feed channel build date",async()=>{
    for(const body of [
      xml(null),
      xml("<![CDATA[Mon, 12 Oct 2026 17:30:00 GMT]]>"),
      xml("<![CDATA["+date+"]]>", "https://evil.example/newsevents/pressreleases/monetary20261011a.htm"),
    ]){
      const row=await probeExpandedSource(fed,{
        now,fetchImpl:fetchXML(body),openDiscovery:true,collectPrivateCandidates:true,
      });
      expect(row.source_native_24h_release_items).toBe(0);
      expect(row.private_original_article_candidates).toHaveLength(0);
      expect(row.current_scored_intelligence_verified).toBe(false);
      expect(row.commercial_eligible).toBe(false);
    }
  });
  it("does not inflate a recent window with a CDATA publication older than 24h",async()=>{
    const older=xml("<![CDATA[Thu, 08 Oct 2026 15:00:00 GMT]]>");
    const result=await probeExpandedSource(fed,{
      now,fetchImpl:fetchXML(older),openDiscovery:true,collectPrivateCandidates:true,
    });
    expect(result.source_native_release_items).toBe(1);
    expect(result.source_native_24h_release_items).toBe(0);
    expect(result.source_native_7d_release_items).toBe(1);
    expect(result.private_original_article_candidates).toHaveLength(0);
  });
});
