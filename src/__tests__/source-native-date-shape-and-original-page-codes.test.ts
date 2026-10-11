import {describe,expect,it,vi} from "vitest";
import {
  EXPANDED_OFFICIAL_SOURCES,probeExpandedSource,
} from "../../scripts/ops/probe-expanded-official-source-mesh.mjs";
import {probe30MinThreeDomainPulse} from "../../scripts/ops/probe-30min-three-domain-pulse.mjs";
import {projectSourcePulseForD1} from "../../scripts/ops/write-30min-source-pulse-d1.mjs";

const NOW=new Date("2026-10-11T15:00:00Z");
const fed=EXPANDED_OFFICIAL_SOURCES.find(
  (s:{id:string})=>s.id==="fed_monetary_original_press_rss_review")!;
const fcdo=EXPANDED_OFFICIAL_SOURCES.find(
  (s:{id:string})=>s.id==="uk_fcdo_original_foreign_policy_atom_review")!;
const article="https://www.gov.uk/government/news/foreign-secretary-discusses-diplomatic-options";
const undatedGovuk='<feed><entry><title>Foreign secretary diplomatic update</title>'+
  '<updated>2026-10-11T14:20:00Z</updated>'+
  '<link rel="alternate" href="'+article+'"/></entry></feed>';
const page='<html><head><meta property="article:published_time" '+
  'content="2026-10-11T14:05:00Z"></head></html>';
const good=(s:string,mime:string)=>new Response(s,{
  status:200,headers:{"content-type":mime},
});
describe("#2041 source-native date lexical and strict original page fallback reasons",()=>{
  it("classifies invalid Federal Reserve RSS date shape without retaining the actual clock",async()=>{
    const xml='<rss><channel>'+
      '<item><title>Monetary press guidance</title>'+
      '<link>https://www.federalreserve.gov/newsevents/pressreleases/monetary20261011a.htm</link>'+
      '<pubDate>NOT A LEGAL DATE</pubDate></item>'+
      '<item><title>Monetary press release</title>'+
      '<link>https://www.federalreserve.gov/newsevents/pressreleases/monetary20261011b.htm</link>'+
      '<pubDate>2026-13-88T99:99:99Z</pubDate></item>'+
      '<item><title>Monetary other press update</title>'+
      '<link>https://www.federalreserve.gov/newsevents/pressreleases/monetary20261011c.htm</link>'+
      '<pubDate><![CDATA[INVALID CDATA]]></pubDate></item></channel></rss>';
    const result=await probeExpandedSource(fed,{
      now:NOW,fetchImpl:async()=>good(xml,"application/rss+xml"),
      openDiscovery:true,collectPrivateCandidates:true,
    });
    expect(result.source_item_provenance_diagnostics.item_native_published_invalid_date)
      .toBe(3);
    expect(result.unparseable_native_rss_date_shapes).toMatchObject({
      OTHER:1,ISO_LIKE:1,CDATA_WRAPPER:1,
    });
    expect(JSON.stringify(result.unparseable_native_rss_date_shapes))
      .not.toContain("INVALID CDATA");
    expect(result.source_native_24h_release_items).toBe(0);
    expect(result.commercial_eligible).toBe(false);
    expect(result.private_original_article_candidates).toHaveLength(0);
  });
  it("exposes bounded official same-host page-date verification proof without using Atom updated",async()=>{
    const fetchImpl=vi.fn(async(url:string)=>{
      if(url===fcdo.url)return good(undatedGovuk,"application/atom+xml");
      if(url===article)return good(page,"text/html");
      throw Error("NO_UNREVIEWED_FETCH");
    });
    const result=await probeExpandedSource(fcdo,{
      now:NOW,fetchImpl,openDiscovery:true,collectPrivateCandidates:true,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.source_item_provenance_diagnostics.item_native_published_missing).toBe(1);
    expect(result.original_page_precise_date_checks).toBe(1);
    expect(result.original_page_precise_date_24h).toBe(1);
    expect(result.undated_atom_article_link_candidates).toBe(1);
    expect(result.first_party_original_page_probe_codes).toMatchObject({
      PRECISE_PUBLICATION_VERIFIED:1,
    });
    expect(result.private_original_article_candidates).toHaveLength(1);
    expect(result.private_original_article_candidates[0].native_published_at)
      .toBe("2026-10-11T14:05:00.000Z");
    expect(result.commercial_eligible).toBe(false);
  });
  it("never bypasses publisher HTTP 403, guesses page time, or promotes a private candidate",async()=>{
    const fetchImpl=vi.fn(async(url:string)=>url===fcdo.url
      ?good(undatedGovuk,"application/atom+xml")
      :new Response("denied",{status:403}));
    const result=await probeExpandedSource(fcdo,{
      now:NOW,fetchImpl,openDiscovery:true,collectPrivateCandidates:true,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.first_party_original_page_probe_codes).toMatchObject({
      HTTP_UNAUTHORIZED:1,
    });
    expect(result.original_page_precise_date_24h).toBe(0);
    expect(result.private_original_article_candidates).toHaveLength(0);
    expect(result.current_scored_intelligence_verified).toBe(false);
    expect(result.commercial_eligible).toBe(false);
  });
  it("keeps grammar and page-verification result counters in D1 without raw date or URLs",async()=>{
    const probe=vi.fn(async(s:{id:string;domain:string})=>({
      source_id:s.id,domain:s.domain,publisher_reachable:true,format_valid:true,
      original_publisher_topical_30m:0,original_publisher_topical_90m:0,
      original_publisher_topical_6h:0,original_publisher_open_24h_count:0,
      source_native_7d_release_items:0,private_original_article_candidates:[],
      unparseable_native_rss_date_shapes:s.id==="fed_monetary_original_press_rss_review"
        ?{CDATA_WRAPPER:0,RFC_ALPHA_ZONE:2,RFC_OTHER_ZONE:0,
          ISO_LIKE:0,SLASH_DATE_LIKE:0,OTHER:0}:null,
      undated_atom_article_link_candidates:s.id.includes("atom")?1:null,
      original_page_precise_date_checks:1,original_page_precise_date_24h:0,
      first_party_original_page_probe_codes:{PRECISE_PUBLICATION_UNVERIFIED:1},
    }));
    const pulse=await probe30MinThreeDomainPulse({now:NOW,probe});
    const rows=projectSourcePulseForD1(pulse);
    expect(rows).toHaveLength(3);
    for(const row of rows){
      expect(row.metadata.source_feed_recovery_diagnostics).toHaveLength(2);
      const p=row.metadata.source_feed_recovery_diagnostics[0];
      expect(p.original_page_result_codes.PRECISE_PUBLICATION_UNVERIFIED).toBe(1);
      expect(p.original_page_checked).toBe(1);
      expect(JSON.stringify(p)).not.toContain("https://");
    }
    expect(pulse.independently_verified_current_intelligence_count).toBe(0);
    expect(pulse.payments_performed).toBe(0);
  });
});