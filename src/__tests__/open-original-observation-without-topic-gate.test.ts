import { describe, expect, it, vi } from "vitest";
import {
  originalPublisherPrivateCandidates,
} from "../../scripts/lib/private-original-publisher-candidates.mjs";
import {
  EXPANDED_OFFICIAL_SOURCES, probeExpandedSource,
} from "../../scripts/ops/probe-expanded-official-source-mesh.mjs";
import {probe30MinThreeDomainPulse} from "../../scripts/ops/probe-30min-three-domain-pulse.mjs";
import {projectSourcePulseForD1} from "../../scripts/ops/write-30min-source-pulse-d1.mjs";

const NOW=new Date("2026-10-11T12:00:00.000Z");
const source=EXPANDED_OFFICIAL_SOURCES.find(
  (s:{id:string})=>s.id==="un_news_security_original_rss_review")!;
const entry=(id:string,at:string,title:string)=>
  `<item><title>${title}</title><pubDate>${at}</pubDate><link>https://news.un.org/en/story/2026/10/${id}</link></item>`;
const feed=(body:string)=>`<?xml version="1.0" encoding="utf-8"?>
  <rss version="2.0"><channel>${body}</channel></rss>`;
const raw=feed(
  entry("199901","Sun, 11 Oct 2026 11:45:00 GMT","United Nations programme expands agricultural education")+
  entry("199902","Thu, 08 Oct 2026 10:00:00 GMT","United Nations disaster resilience programme")+
  entry("199903","Sun, 11 Oct 2026 12:30:00 GMT","Future-dated article must not enter discovery")
);
function fetchRss(){
  return vi.fn(async()=>new Response(raw,{status:200,
    headers:{"content-type":"application/rss+xml"}}));
}

describe("#1827 open first-party original discovery, no keyword admission gate",()=>{
  it("captures unexpected-topic original native-dated article without promoting to relevant intelligence",()=>{
    const prior=originalPublisherPrivateCandidates(raw,source,NOW);
    expect(prior).toEqual([]);
    const open=originalPublisherPrivateCandidates(raw,source,NOW,{captureAllTopics:true});
    expect(open).toHaveLength(1);
    expect(open[0].discovery_topic_matched).toBe(false);
    expect(open[0].article_category_relevance_verified).toBe(false);
    expect(open[0].original_article_content_verified).toBe(false);
    expect(open[0].commercial_derived_use_rights_verified).toBe(false);
    expect(open[0].eligible_for_scoring).toBe(false);
    expect(open[0].eligible_for_publication).toBe(false);
    expect(open[0].native_published_at).toBe("2026-10-11T11:45:00.000Z");
    expect(JSON.stringify(open)).not.toContain("news.un.org");
    expect(JSON.stringify(open)).not.toContain("agricultural education");
  });
  it("reports 24h open originals separately from 7d originals and 0 keyword hits",async()=>{
    const p=await probeExpandedSource(source,{
      now:NOW,fetchImpl:fetchRss(),openDiscovery:true,collectPrivateCandidates:true,
    });
    expect(p.publisher_reachable).toBe(true);
    expect(p.source_native_release_items).toBe(2);
    expect(p.source_native_24h_release_items).toBe(1);
    expect(p.source_native_7d_release_items).toBe(2);
    expect(p.original_publisher_open_24h_count).toBe(1);
    expect(p.original_publisher_topical_30m).toBe(0);
    expect(p.original_publisher_topical_6h).toBe(0);
    expect(p.private_original_article_candidates).toHaveLength(1);
    expect(p.private_original_article_candidates[0].discovery_topic_matched).toBe(false);
    expect(p.current_scored_intelligence_verified).toBe(false);
    expect(p.commercial_eligible).toBe(false);
    expect(p.same_event_independent_corroboration_verified).toBe(false);
    const ordinary=await probeExpandedSource(source,{
      now:NOW,fetchImpl:fetchRss(),collectPrivateCandidates:true,
    });
    expect(ordinary.private_original_article_candidates).toHaveLength(0);
  });
  it("half-hour pipeline records source article counts without claiming 3 category scored events",async()=>{
    const probe=vi.fn(async(src:{id:string;domain:string})=>({
      source_id:src.id,domain:src.domain,
      publisher_reachable:true,format_valid:true,
      original_publisher_topical_30m:0,
      original_publisher_topical_90m:0,
      original_publisher_topical_6h:0,
      original_publisher_open_24h_count:3,
      source_native_7d_release_items:7,
      private_original_article_candidates:[],
    }));
    const out=await probe30MinThreeDomainPulse({now:NOW,probe});
    expect(probe).toHaveBeenCalledTimes(6);
    expect(probe.mock.calls.every(([s])=>s.id)).toBe(true);
    expect(out.open_original_discovery_enabled).toBe(true);
    expect(out.original_article_keyword_admission_required).toBe(false);
    expect(out.actual_original_publisher_rows).toHaveLength(3);
    for(const x of out.actual_original_publisher_rows){
      expect(x.original_publisher_all_topics_24h_count).toBe(6);
      expect(x.original_publisher_all_topics_7d_count).toBe(14);
      expect(x.original_publisher_30m_topic_count).toBe(0);
      expect(x.articles_captured_before_relevance_classification).toBe(true);
      expect(x.chargeable_intelligence_ready).toBe(false);
      expect(x.unclassified_original_articles_are_verified_events).toBe(false);
    }
    const compact=projectSourcePulseForD1(out);
    expect(compact).toHaveLength(3);
    expect(compact[0].metadata.original_publisher_all_topics_24h_count).toBe(6);
    expect(compact[0].metadata.original_publisher_all_topics_7d_count).toBe(14);
    expect(compact[0].metadata.open_original_discovery_enabled).toBe(true);
    expect(compact[0].metadata.open_observation_is_commercial_intelligence).toBe(false);
    expect(out.publisher_rights_verified).toBe(false);
    expect(out.payments_performed).toBe(0);
    expect(out.supabase_requests).toBe(0);
  });
  it("never accepts a forged off-host URL, a future date or a false source MIME",async()=>{
    const forged=feed(entry("199905","Sun, 11 Oct 2026 11:55:00 GMT","Ordinary programme")
      .replace("news.un.org","news.un.org.attacker.example"));
    expect(originalPublisherPrivateCandidates(forged,source,NOW,{
      captureAllTopics:true,
    })).toEqual([]);
    const invalid=await probeExpandedSource(source,{
      now:NOW,openDiscovery:true,collectPrivateCandidates:true,
      fetchImpl:async()=>new Response("<html>fake</html>",{
        status:200,headers:{"content-type":"text/html"},
      }),
    });
    expect(invalid.format_valid).toBe(false);
    expect(invalid.publisher_reachable).toBe(false);
    expect(invalid.commercial_eligible).toBe(false);
  });
});
