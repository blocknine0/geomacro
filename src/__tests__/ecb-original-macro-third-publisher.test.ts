import {describe,expect,it,vi} from "vitest";
import {
  EXPANDED_OFFICIAL_SOURCES,probeExpandedSource,
} from "../../scripts/ops/probe-expanded-official-source-mesh.mjs";
import {originalPublisherPrivateCandidates} from "../../scripts/lib/private-original-publisher-candidates.mjs";
import {fetchVerifiedPublisherPageDate} from "../../scripts/lib/official-original-article-date.mjs";
import {
  THIRTY_MIN_PUBLISHER_PAIRS,select30MinPublishers,
  probe30MinThreeDomainPulse,
} from "../../scripts/ops/probe-30min-three-domain-pulse.mjs";

const NOW=new Date("2026-10-11T18:00:00.000Z");
const ECB=EXPANDED_OFFICIAL_SOURCES.find(
  (source:{id:string})=>source.id==="ecb_press_original_rss_review")!;
const ORIG="https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp261011~12345678ab.en.html";
const rss=(url:string,when="Sun, 11 Oct 2026 17:40:00 GMT")=>
  '<rss><channel><item><title>ECB statement on monetary policy and interest rates</title>'+
  '<link>'+url+'</link><pubDate>'+when+'</pubDate></item></channel></rss>';
const xml=(body:string)=>new Response(body,{
  status:200,headers:{"content-type":"application/rss+xml"},
});

describe("#2042 free third independent original-publisher Macro/FX route",()=>{
  it("uses the ECB own published RSS URL and preserves commercial rights as unverified",()=>{
    expect(ECB.url).toBe("https://www.ecb.europa.eu/rss/press.html");
    expect(ECB.domain).toBe("macro");
    expect(ECB.original_hosts).toEqual(["www.ecb.europa.eu"]);
    expect(ECB.rights).toBe("UNVERIFIED");
    expect(ECB.event_intelligence).toBe(false);
    expect(ECB.country_coverage_verified).toBe(false);
  });
  it("rotates Fed, StatCan and independent ECB as pairs, never more than two publisher probes in a 30m slot",async()=>{
    const list=THIRTY_MIN_PUBLISHER_PAIRS.macro;
    expect(list).toEqual([
      "fed_monetary_original_press_rss_review",
      "statcan_prices_original_atom_review",
      "ecb_press_original_rss_review",
      "uk_hmt_original_treasury_atom_review",
    ]);
    const all=new Set<string>();
    for(let i=0;i<4;i++){
      const now=new Date(NOW.getTime()+i*30*60*1000);
      const pair=select30MinPublishers(now).macro;
      expect(pair).toHaveLength(2);
      expect(pair[0].id).not.toBe(pair[1].id);
      pair.forEach(x=>all.add(x.id));
    }
    expect(all).toEqual(new Set(list));
    const probe=vi.fn(async(s:{id:string;domain:string})=>({
      source_id:s.id,domain:s.domain,publisher_reachable:true,format_valid:true,
      original_publisher_topical_30m:0,original_publisher_topical_90m:0,
      original_publisher_topical_6h:0,original_publisher_open_24h_count:0,
      source_native_7d_release_items:0,private_original_article_candidates:[],
    }));
    const sample=await probe30MinThreeDomainPulse({now:NOW,probe});
    expect(probe).toHaveBeenCalledTimes(6);
    expect(sample.actual_original_publisher_rows.find(x=>x.domain==="macro")
      .original_publishers_attempted).toBe(2);
    expect(sample.publisher_rights_verified).toBe(false);
    expect(sample.payments_performed).toBe(0);
    expect(sample.supabase_requests).toBe(0);
  });
  it("detects actual source-native 24h ECB original article metadata without signed promotion",async()=>{
    const body=rss(ORIG);
    const observed=await probeExpandedSource(ECB,{
      now:NOW,fetchImpl:async()=>xml(body),
      openDiscovery:true,collectPrivateCandidates:true,
    });
    expect(observed.publisher_reachable).toBe(true);
    expect(observed.source_native_release_items).toBe(1);
    expect(observed.source_native_24h_release_items).toBe(1);
    expect(observed.original_publisher_open_24h_count).toBe(1);
    const candidates=originalPublisherPrivateCandidates(body,ECB,NOW,{
      captureAllTopics:true,
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].original_publisher_organization_id).toBe("ecb");
    expect(candidates[0].native_published_at).toBe("2026-10-11T17:40:00.000Z");
    expect(candidates[0].original_article_content_verified).toBe(false);
    expect(candidates[0].commercial_derived_use_rights_verified).toBe(false);
    expect(candidates[0].eligible_for_scoring).toBe(false);
    expect(JSON.stringify(candidates)).not.toContain("ecb.europa.eu");
    expect(observed.current_scored_intelligence_verified).toBe(false);
    expect(observed.commercial_eligible).toBe(false);
  });
  it("recovers only a verified ECB first-party RSS double-slash press URL and never arbitrary double-slash paths",()=>{
    const doubled=ORIG.replace("www.ecb.europa.eu/press/","www.ecb.europa.eu//press/");
    const candidate=originalPublisherPrivateCandidates(rss(doubled),ECB,NOW,{
      captureAllTopics:true,
    });
    expect(candidate).toHaveLength(1);
    const single=originalPublisherPrivateCandidates(rss(ORIG),ECB,NOW,{
      captureAllTopics:true,
    });
    expect(candidate[0].original_article_sha256)
      .toBe(single[0].original_article_sha256);
    for(const bad of [
      doubled.replace("/press/pr/date/","/press/accounts/date/"),
      "https://www.ecb.europa.eu//evil.test/press/pr/date/2026/html/test1234.html",
      doubled+"?redirect=evil",
      doubled.replace("www.ecb.europa.eu","www.ecb.europa.eu.evil.example"),
    ]){
      expect(originalPublisherPrivateCandidates(rss(bad),ECB,NOW,{
        captureAllTopics:true,
      })).toHaveLength(0);
    }
  });
  it("rejects publisher impersonation, ECB RSS index and future original publication",async()=>{
    const bad=[
      rss(ORIG.replace("www.ecb.europa.eu","www.ecb.europa.eu.evil.example")),
      rss("https://www.ecb.europa.eu/rss/press.html"),
      rss(ORIG.replace("https://","http://")),
      rss(ORIG.replace("/press/pr/date/","/press/some-unknown/")),
      rss(ORIG,"Mon, 12 Oct 2026 17:40:00 GMT"),
    ];
    for(const body of bad){
      expect(originalPublisherPrivateCandidates(body,ECB,NOW,{
        captureAllTopics:true,
      })).toHaveLength(0);
    }
    const diagnostics={};
    const result=await fetchVerifiedPublisherPageDate(
      "https://www.ecb.europa.eu/rss/press.html","macro",{
        now:NOW,diagnostics,fetchImpl:async()=>{throw Error("NO_FETCH");},
      });
    expect(result).toBeNull();
    expect(diagnostics).toMatchObject({code:"URL_UNAPPROVED"});
  });
});