import {describe,expect,it,vi} from "vitest";
import {
  EXPANDED_OFFICIAL_SOURCES,probeExpandedSource,
} from "../../scripts/ops/probe-expanded-official-source-mesh.mjs";
import {probe30MinThreeDomainPulse,select30MinPublishers} from "../../scripts/ops/probe-30min-three-domain-pulse.mjs";

const now=new Date("2026-10-12T02:00:00.000Z");
const un=EXPANDED_OFFICIAL_SOURCES.find(
  (x:{id:string})=>x.id==="un_news_security_original_rss_review")!;
const original=(date:string,link="https://news.un.org/en/story/2026/10/1152000")=>
  "<rss><channel><item><title>Security Council agrees ceasefire after armed conflict</title>"+
  "<pubDate>"+date+"</pubDate><link>"+link+
  "</link></item></channel></rss>";
const oldFeed=original("Fri, 09 Oct 2026 02:00:00 GMT");
const freshFeed=original("Mon, 12 Oct 2026 01:30:00 GMT");
const response=(body:string,headers:Record<string,string>={"content-type":"application/rss+xml"})=>
  new Response(body,{headers});

describe("#2041 UN same-publisher zero-current private original discovery",()=>{
  it("checks only pinned UN all-topic RSS when security feed has zero native-dated 24h originals",async()=>{
    const called:string[]=[];
    const fetchImpl=vi.fn(async(url:string,init:RequestInit)=>{
      called.push(url);
      expect(init.redirect).toBe("error");
      return response(url===un.url?oldFeed:freshFeed);
    });
    const x=await probeExpandedSource(un,{now,fetchImpl,
      collectPrivateCandidates:true,openDiscovery:true});
    expect(called).toEqual([un.url,un.alternate_url]);
    expect(x.publisher_reachable).toBe(true);
    expect(x.official_same_publisher_zero_fresh_expansion_attempted).toBe(true);
    expect(x.official_same_publisher_zero_fresh_expansion_used).toBe(true);
    expect(x.original_publisher_open_24h_count).toBe(1);
    expect(x.original_publisher_topical_30m).toBe(1);
    expect(x.private_original_article_candidates).toHaveLength(1);
    expect(x.private_original_article_candidates[0]).toMatchObject({
      domain:"geopolitics",original_publisher_organization_id:"un_news",
      eligible_for_publication:false,eligible_for_scoring:false,
      original_article_content_verified:false,
      commercial_derived_use_rights_verified:false,
    });
    expect(x.same_event_independent_corroboration_verified).toBe(false);
    expect(x.current_scored_intelligence_verified).toBe(false);
    expect(x.commercial_eligible).toBe(false);
    expect(JSON.stringify(x)).not.toContain("Security Council agrees");
    expect(JSON.stringify(x)).not.toContain("news.un.org/en/story");
  });

  it("never runs extra GET on non-open discovery or when primary has fresh originals",async()=>{
    for(const [openDiscovery,primary] of [[false,oldFeed],[true,freshFeed]] as const){
      const calls:string[]=[];
      const x=await probeExpandedSource(un,{
        now,openDiscovery,collectPrivateCandidates:true,
        fetchImpl:vi.fn(async(url:string)=>{
          calls.push(url);return response(primary);
        }),
      });
      expect(calls).toEqual([un.url]);
      expect(x.official_same_publisher_zero_fresh_expansion_attempted).toBe(false);
      expect(x.official_same_publisher_zero_fresh_expansion_used).toBe(false);
      expect(x.commercial_eligible).toBe(false);
    }
  });

  it("does not promote denied, off-host, undated, oversized, malformed or failed alternate",async()=>{
    const denied=[
      () => new Response("provider denied",{status:403}),
      () => new Response("rate limited",{status:429}),
      () => response(original("Mon, 12 Oct 2026 01:30:00 GMT",
         "https://fake.example/en/story/2026/10/1152000")),
      () => response('<rss><channel><lastBuildDate>Mon, 12 Oct 2026 01:59:00 GMT</lastBuildDate>'+
          '<item><title>Security Council ceasefire</title>'+
          '<link>https://news.un.org/en/story/2026/10/1152000</link></item></channel></rss>'),
      () => response(freshFeed,{"content-type":"application/rss+xml",
         "content-length":"999999999"}),
      () => response("<!DOCTYPE rss><rss><channel><item></item></channel></rss>"),
      () => response("<html>page is not RSS</html>",{"content-type":"text/html"}),
      () => {throw Error("secret upstream text");},
    ];
    for(const answer of denied) {
      const calls:string[]=[];
      const x=await probeExpandedSource(un,{now,openDiscovery:true,
        collectPrivateCandidates:true,
        fetchImpl:async(url:string)=>{
          calls.push(url);
          return url===un.url?response(oldFeed):answer();
        },
      });
      expect(calls).toEqual([un.url,un.alternate_url]);
      expect(x.official_same_publisher_zero_fresh_expansion_attempted).toBe(true);
      expect(x.official_same_publisher_zero_fresh_expansion_used).toBe(false);
      expect(x.format_valid).toBe(true);
      expect(x.original_publisher_open_24h_count).toBe(0);
      expect(x.private_original_article_candidates).toEqual([]);
      expect(x.commercial_eligible).toBe(false);
      expect(JSON.stringify(x)).not.toContain("secret upstream text");
    }
  });
  it("carries safe UN expansion booleans through the three-domain private pulse",async()=>{
    const base=new Date("2026-10-12T02:00:00.000Z");
    const now=Array.from({length:3},(_,i)=>
      new Date(base.getTime()+i*30*60000)).find(t=>
      select30MinPublishers(t).geopolitics.some(x=>
        x.id==="un_news_security_original_rss_review"))!;
    const monitor=await probe30MinThreeDomainPulse({now,probe:async(source:{id:string,domain:string})=>({
      source_id:source.id,domain:source.domain,
      publisher_reachable:true,format_valid:true,
      original_publisher_topical_30m:0,
      original_publisher_topical_90m:0,
      original_publisher_topical_6h:0,
      official_same_publisher_zero_fresh_expansion_attempted:
        source.id==="un_news_security_original_rss_review",
      official_same_publisher_zero_fresh_expansion_used:
        source.id==="un_news_security_original_rss_review",
    })});
    const proof=monitor.actual_original_publisher_rows.flatMap(x=>
      x.source_feed_recovery_diagnostics);
    const unProof=proof.find(x=>x.source_id==="un_news_security_original_rss_review");
    expect(unProof).toMatchObject({
      same_issuer_zero_fresh_expansion_attempted:true,
      same_issuer_zero_fresh_expansion_used:true,
    });
    expect(proof.filter(x=>x.same_issuer_zero_fresh_expansion_attempted)).toHaveLength(1);
    expect(monitor.independently_verified_current_intelligence_count).toBe(0);
    expect(monitor.publisher_rights_verified).toBe(false);
    expect(monitor.user_api_delivery_verified).toBe(false);
    expect(JSON.stringify(proof)).not.toContain("Security Council agrees");
    expect(JSON.stringify(proof)).not.toContain("https://news.un.org/en/story");
  });

});
