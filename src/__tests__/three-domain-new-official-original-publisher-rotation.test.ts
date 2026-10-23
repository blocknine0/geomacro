import {describe,it,expect,vi} from "vitest";
import {EXPANDED_OFFICIAL_SOURCES,probeExpandedSource}
 from "../../scripts/ops/probe-expanded-official-source-mesh.mjs";
import {THIRTY_MIN_PUBLISHER_PAIRS,select30MinPublishers}
 from "../../scripts/ops/probe-30min-three-domain-pulse.mjs";
import {originalPublisherPrivateCandidates}
 from "../../scripts/lib/private-original-publisher-candidates.mjs";
import {parsePulseRotatedOriginals}
 from "../../scripts/lib/pulse-rotated-original-scorer.mjs";
import {fetchVerifiedPublisherPageDate}
 from "../../scripts/lib/official-original-article-date.mjs";
import {createHash} from "node:crypto";

const NOW=new Date("2026-10-23T18:40:00.000Z");
const SOURCES=[
 {id:"un_geneva_press_original_rss_review",domain:"geopolitics",
  endpoint:"https://www.ungeneva.org/news-media/press-releases-list/rss.xml",
  original:"https://www.ungeneva.org/en/news-media/press-release/2026/10/security-council-ceasefire-statement",
  title:"Security Council discusses peace and armed conflict",
  org:"un_geneva"},
 {id:"boc_press_original_rss_review",domain:"macro",
  endpoint:"https://www.bankofcanada.ca/content_type/press-releases/feed/",
  original:"https://www.bankofcanada.ca/2026/10/monetary-policy-announcement/",
  title:"Bank of Canada monetary policy interest rates announcement",
  org:"bank_of_canada"},
 {id:"bc_minerals_original_rss_review",domain:"rare_earth",
  endpoint:"https://news.gov.bc.ca/ministries/mining-and-critical-minerals/feed",
  original:"https://news.gov.bc.ca/releases/2026MCM0001-000001",
  title:"British Columbia announces new critical minerals mining projects",
  org:"bc_ministry_mining"}
] as const;
const xml=(title:string,link:string,date="Fri, 23 Oct 2026 18:22:00 GMT")=>
 `<rss version="2.0"><channel><item>
 <title>${title}</title><link>${link}</link><pubDate>${date}</pubDate>
 </item></channel></rss>`;
const response=(s:string)=>new Response(s,{
 status:200,headers:{"content-type":"application/rss+xml"}
});
const digest=(s:string)=>createHash("sha256").update(s).digest("hex");

describe("three independently pinned public official feeds, no fake rights, 2 GET/domain budget",()=>{
 it("rotates every publisher in 5 half-hour opportunities without more source requests",()=>{
  for(const domain of ["geopolitics","macro","rare_earth"]){
   const ids=THIRTY_MIN_PUBLISHER_PAIRS[domain];
   expect(ids.length).toBeGreaterThanOrEqual(4);
   expect(ids.length).toBeLessThanOrEqual(6);
   const origins=new Set();
   for(let slot=0;slot<ids.length;slot++){
    const selected=select30MinPublishers(new Date(NOW.getTime()+slot*1800000))[domain];
    expect(selected).toHaveLength(2);
    selected.forEach((s:any)=>origins.add(s.id));
   }
   expect(origins).toEqual(new Set(ids));
  }
 });
 for(const def of SOURCES){
  it(`${def.domain}: date-native actual first-party RSS article is private candidate, not saleable`,async()=>{
   const source=EXPANDED_OFFICIAL_SOURCES.find(x=>x.id===def.id)!;
   expect(source).toBeDefined();
   expect(source.domain).toBe(def.domain);
   expect(source.url).toBe(def.endpoint);
   expect(source.rights).toBe("UNVERIFIED");
   expect(source.event_intelligence).toBe(false);
   expect(source.country_coverage_verified).toBe(false);
   const body=xml(def.title,def.original);
   const fetchImpl=vi.fn(async()=>response(body));
   const observed=await probeExpandedSource(source,{
    now:NOW,fetchImpl,collectPrivateCandidates:true,openDiscovery:true
   });
   expect(fetchImpl).toHaveBeenCalledTimes(1);
   expect(observed.publisher_reachable).toBe(true);
   expect(observed.format_valid).toBe(true);
   expect(observed.original_publisher_topical_90m).toBe(1);
   expect(observed.commercial_eligible).toBe(false);
   expect(observed.current_scored_intelligence_verified).toBe(false);
   const priv=originalPublisherPrivateCandidates(body,source,NOW,{
    captureAllTopics:true
   });
   expect(priv).toHaveLength(1);
   expect(priv[0].original_publisher_organization_id).toBe(def.org);
   expect(priv[0].native_published_at).toBe("2026-10-23T18:22:00.000Z");
   expect(priv[0].article_category_relevance_verified).toBe(false);
   expect(priv[0].commercial_derived_use_rights_verified).toBe(false);
   expect(priv[0].eligible_for_scoring).toBe(false);
   // Native RSS date is a review lead, not a trusted current event:
   // an independent same-origin HTML clock must remain verifiable.
   const nativePage='<html><head><meta property="article:published_time" '+
     'content="2026-10-23T18:22:00Z"></head><body>official article</body></html>';
   const pageFetcher=vi.fn(async()=>new Response(nativePage,{
     status:200,headers:{"content-type":"text/html"}
   }));
   expect(await fetchVerifiedPublisherPageDate(def.original,def.domain,{
     now:NOW,fetchImpl:pageFetcher
   })).toBe("2026-10-23T18:22:00.000Z");
   expect(pageFetcher).toHaveBeenCalledTimes(1);
   let network=0;
   for(const invalid of [
     def.original.replace("https://","http://"),
     def.original.replace("://","://evil."),
     def.original+"?redirect=evil",
   ]){
    const untrusted=await fetchVerifiedPublisherPageDate(invalid,def.domain,{
      now:NOW,fetchImpl:async()=>{network++;throw Error("UNEXPECTED_FETCH");},
    });
    expect(untrusted).toBeNull();
   }
   expect(network).toBe(0);
   const fromD1=parsePulseRotatedOriginals(body,source,{
    refs:new Set([digest(def.original)]),
    expectedClocks:new Map([[digest(def.original),"2026-10-23T18:22:00.000Z"]]),
    now:NOW,
   });
   expect(fromD1).toHaveLength(1);
   expect(fromD1[0].commercialEligible).toBe(false);
   const spoofs=[
    def.original.replace("https://","http://"),
    def.original.replace("://","://evil."),
    def.original+"?redirect=https://evil.example/",
    "https://unrelated.example.invalid/government/news/fake",
   ];
   for(const spoof of spoofs)
    expect(originalPublisherPrivateCandidates(xml(def.title,spoof),
      source,NOW,{captureAllTopics:true})).toHaveLength(0);
   expect(originalPublisherPrivateCandidates(xml(def.title,def.original,
     "Sat, 24 Oct 2026 18:22:00 GMT"),source,NOW,
      {captureAllTopics:true})).toHaveLength(0);
  });
 }
});
