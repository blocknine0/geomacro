import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  originalPublisherPrivateCandidates,
  classifyPrivateOriginalCandidateDuplicates,
} from "../../scripts/lib/private-original-publisher-candidates.mjs";
import { probeExpandedSource, EXPANDED_OFFICIAL_SOURCES } from "../../scripts/ops/probe-expanded-official-source-mesh.mjs";
import { probe30MinThreeDomainPulse } from "../../scripts/ops/probe-30min-three-domain-pulse.mjs";

const NOW = new Date("2026-10-10T18:10:00.000Z");
const news = EXPANDED_OFFICIAL_SOURCES.find(s=>s.id==="un_news_security_original_rss_review")!;
const rss=(items:string)=>`<?xml version="1.0"?><rss version="2.0"><channel>${items}</channel></rss>`;
const item=(url:string,date="Sat, 10 Oct 2026 18:00:00 GMT",title="Security Council warns of armed conflict")=>
  `<item><title>${title}</title><pubDate>${date}</pubDate><link>${url}</link></item>`;

describe("#1827 native article discovery, deterministic dedup, secure private scoring handoff",()=>{
  it("captures bounded first-party native dated article fingerprints, not headlines or URL",()=>{
    const feed=rss(item("https://news.un.org/en/story/2026/10/115000?utm_source=rss"));
    const candidates=originalPublisherPrivateCandidates(feed,news,NOW);
    expect(candidates).toHaveLength(1);
    const c=candidates[0];
    expect(c.domain).toBe("geopolitics");
    expect(c.original_publisher_organization_id).toBe("un_news");
    expect(c.native_published_at).toBe("2026-10-10T18:00:00.000Z");
    expect(c.original_article_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(c.original_article_content_verified).toBe(false);
    expect(c.commercial_derived_use_rights_verified).toBe(false);
    expect(c.eligible_for_scoring).toBe(false);
    expect(c.eligible_for_publication).toBe(false);
    const printable=JSON.stringify(c);
    expect(printable).not.toContain("news.un.org");
    expect(printable).not.toContain("Security Council warns");
    expect(printable).not.toContain("utm_source");
  });

  it("captures a third independent Australian government minerals article as private-only",()=>{
    const source=EXPANDED_OFFICIAL_SOURCES.find(x=>x.id==="australia_industry_minister_original_rss_review")!;
    const feed=rss(item("https://www.minister.industry.gov.au/t-ayres/media/construction-starts-arafura-rare-earths-project",
      "Sat, 10 Oct 2026 18:00:00 GMT",
      "Construction starts on Arafura Rare Earths Project"));
    const rows=originalPublisherPrivateCandidates(feed,source,NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0].original_publisher_organization_id).toBe("australian_industry_minister");
    expect(rows[0].eligible_for_scoring).toBe(false);
    expect(rows[0].commercial_derived_use_rights_verified).toBe(false);
    const index=feed.replace("/t-ayres/media/construction-starts-arafura-rare-earths-project","/subscribe");
    expect(originalPublisherPrivateCandidates(index,source,NOW)).toHaveLength(0);
  });

  it("same URL tracking variants suppressed, separate originals stay separate",()=>{
    const feed=rss(
      item("https://news.un.org/en/story/2026/10/115000?utm_campaign=a")+
      item("https://news.un.org/en/story/2026/10/115000?utm_campaign=b")+
      item("https://news.un.org/en/story/2026/10/115001",undefined as any,"Security Council confirms ceasefire")
    );
    const candidates=originalPublisherPrivateCandidates(feed,news,NOW);
    expect(candidates).toHaveLength(2);
    expect(new Set(candidates.map(c=>c.original_article_sha256)).size).toBe(2);
    expect(classifyPrivateOriginalCandidateDuplicates(candidates).exact_article_unique_count).toBe(2);
  });

  it("never accepts off-domain, HTTP, future, old, undated or non-topic feed entries",()=>{
    const mixed=rss(
      item("https://evil.test/en/story/2026/10/111")+
      item("https://news.un.org/en/news/topic/peace-and-security")+
      item("http://news.un.org/en/story/2026/10/112")+
      item("https://news.un.org/en/story/2026/10/113","Sun, 11 Oct 2026 18:00:00 GMT")+
      item("https://news.un.org/en/story/2026/10/114","Fri, 09 Oct 2026 18:00:00 GMT")+
      item("https://news.un.org/en/story/2026/10/115","", "Security Council crisis")+
      item("https://news.un.org/en/story/2026/10/116","Sat, 10 Oct 2026 18:00:00 GMT","Regular agriculture budget report")
    );
    expect(originalPublisherPrivateCandidates(mixed,news,NOW)).toHaveLength(0);
    expect(()=>originalPublisherPrivateCandidates("<!DOCTYPE rss>"+rss(""),news,NOW)).toThrow("PRIVATE_ORIGINAL_FEED_UNTRUSTED");
  });

  it("never calls same headline twice a legally or independently verified event",()=>{
    const c=originalPublisherPrivateCandidates(rss(item("https://news.un.org/en/story/2026/10/100")),news,NOW)[0];
    const other={...c,source_id:"uk_fcdo_original_foreign_policy_atom_review",
      original_publisher_organization_id:"uk_fcdo",original_article_sha256:"a".repeat(64)};
    const dedup=classifyPrivateOriginalCandidateDuplicates([c,c,other]);
    expect(dedup.observed_candidate_count).toBe(3);
    expect(dedup.exact_article_unique_count).toBe(2);
    expect(dedup.same_url_article_duplicates_suppressed).toBe(1);
    expect(dedup.possible_cross_publisher_same_headline_groups).toBe(1);
    expect(dedup.same_event_corroborated_count).toBe(0);
    expect(dedup.independently_scored_events_count).toBe(0);
    expect(dedup.signed_gro_published).toBe(false);
    expect(dedup.chargeable).toBe(false);
    expect(dedup.event_identity_review_required).toBe(true);
  });

  it("rejects tampered public/commercial candidate, prototype unsafe shape and oversized sets",()=>{
    const c=originalPublisherPrivateCandidates(rss(item("https://news.un.org/en/story/2026/10/100")),news,NOW)[0];
    expect(()=>classifyPrivateOriginalCandidateDuplicates([{...c,eligible_for_publication:true}])).toThrow();
    expect(()=>classifyPrivateOriginalCandidateDuplicates([{...c,original_article_sha256:"oops"}])).toThrow();
    expect(()=>classifyPrivateOriginalCandidateDuplicates(Array(241).fill(c))).toThrow();
  });

  it("real official probe only exposes candidate identities when explicitly opted in",async()=>{
    const fetchImpl=vi.fn(async()=>new Response(rss(item("https://news.un.org/en/story/2026/10/115000")),{
      status:200,headers:{"content-type":"application/rss+xml"}
    }));
    const baseline=await probeExpandedSource(news,{now:NOW,fetchImpl});
    expect(baseline.private_original_article_candidates).toBeUndefined();
    const opted=await probeExpandedSource(news,{now:NOW,fetchImpl,collectPrivateCandidates:true});
    expect(opted.private_original_article_candidates).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(opted.commercial_eligible).toBe(false);
  });

  it("30-minute monitoring hands only private hashed review candidates to D1 observer, no instant GRO",async()=>{
    const mock=vi.fn(async(source:any)=>({
      source_id:source.id,domain:source.domain,
      publisher_reachable:true,format_valid:true,
      original_publisher_topical_30m:1,
      original_publisher_topical_90m:1,
      original_publisher_topical_6h:1,
      private_original_article_candidates:[],
    }));
    const r=await probe30MinThreeDomainPulse({now:NOW,probe:mock});
    expect(r.private_original_candidate_dedup.same_event_corroborated_count).toBe(0);
    expect(r.private_original_candidate_dedup.signed_gro_published).toBe(false);
    expect(r.b2_reads+r.b2_writes+r.d1_writes+r.supabase_requests+r.payments_performed).toBe(0);
    const source=readFileSync("scripts/ops/write-30min-source-pulse-d1.mjs","utf8");
    expect(source).not.toContain("private_original_article_candidates");
  });
});
