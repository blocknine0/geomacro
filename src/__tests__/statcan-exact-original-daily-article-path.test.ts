import {describe,expect,it,vi} from "vitest";
import {
  EXPANDED_OFFICIAL_SOURCES,probeExpandedSource,
} from "../../scripts/ops/probe-expanded-official-source-mesh.mjs";
import {originalPublisherPrivateCandidates} from "../../scripts/lib/private-original-publisher-candidates.mjs";
import {fetchVerifiedPublisherPageDate} from "../../scripts/lib/official-original-article-date.mjs";
import {probe30MinThreeDomainPulse} from "../../scripts/ops/probe-30min-three-domain-pulse.mjs";
import {projectSourcePulseForD1} from "../../scripts/ops/write-30min-source-pulse-d1.mjs";

const NOW=new Date("2026-10-11T18:00:00Z");
const statcan=EXPANDED_OFFICIAL_SOURCES.find(
  (s:{id:string})=>s.id==="statcan_prices_original_atom_review")!;
const valid="https://www150.statcan.gc.ca/n1/en/daily-quotidien/261011/dq261011a-eng.htm";
const forbidden="https://www150.statcan.gc.ca/n1/pub/261011/foo-eng.htm";
const link=(s:string)=>'<link rel="alternate" href="'+s+'"/>';
const entry=(l:string)=>'<entry><title>Canada prices release</title><updated>2026-10-11T17:48:00Z</updated>'+link(l)+'</entry>';
const feed=(entries:string)=>"<feed>"+entries+"</feed>";
const sourcePage='<html><head><meta property="article:published_time" content="2026-10-11T17:15:00Z"></head></html>';
const ok=(value:string,mime:string)=>new Response(value,{status:200,headers:{"content-type":mime}});
describe("#2041 exact StatCan original /n1/en/daily-quotidien article alias",()=>{
  it("recovers only original-publisher article date, not Atom updated",async()=>{
    const calls:string[]=[];
    const fetchImpl=vi.fn(async(url:string)=>{
      calls.push(url);
      if(url===statcan.url)return ok(feed(entry(valid)),"application/atom+xml");
      if(url===valid)return ok(sourcePage,"text/html");
      throw Error("NOT_ALLOWED_ORIGIN");
    });
    const observed=await probeExpandedSource(statcan,{now:NOW,fetchImpl,
      openDiscovery:true,collectPrivateCandidates:true});
    expect(calls).toEqual([statcan.url,valid]);
    expect(observed.source_native_release_items).toBe(0);
    expect(observed.undated_atom_link_diagnostic.valid_first_party_article_links).toBe(1);
    expect(observed.undated_atom_link_diagnostic.rejected_original_path).toBe(0);
    expect(observed.first_party_original_page_probe_codes.PRECISE_PUBLICATION_VERIFIED).toBe(1);
    expect(observed.original_page_precise_date_24h).toBe(1);
    expect(observed.private_original_article_candidates).toHaveLength(1);
    expect(observed.private_original_article_candidates[0].native_published_at)
      .toBe("2026-10-11T17:15:00.000Z");
    expect(observed.private_original_article_candidates[0].eligible_for_publication).toBe(false);
    expect(observed.commercial_eligible).toBe(false);
  });
  it("recovers a first-party original Daily article from official www root route without accepting any catalogue",async()=>{
    // Statistics Canada's own developer documentation lists the original
    // www.statcan.gc.ca/daily-quotidien/YYMMDD/dqYYMMDDa-eng.htm family.
    const daily="https://www.statcan.gc.ca/daily-quotidien/261011/dq261011a-eng.htm";
    const catalogue="https://www.statcan.gc.ca/en/subjects-start/prices_and_price_indexes";
    const canonical="https://www150.statcan.gc.ca/n1/daily-quotidien/261011/dq261011a-eng.htm";
    const actual=feed(entry(daily)+entry(catalogue)+entry(daily+"?download=1"));
    const called:string[]=[];
    const fetchImpl=vi.fn(async(url:string)=>{
      called.push(url);
      if(url===statcan.url)return ok(actual,"application/atom+xml");
      if(url===canonical)return ok(sourcePage,"text/html");
      throw Error("UNAPPROVED_PUBLISHER_URL");
    });
    const observed=await probeExpandedSource(statcan,{
      now:NOW,fetchImpl,openDiscovery:true,collectPrivateCandidates:true,
    });
    expect(called).toEqual([statcan.url,canonical]);
    expect(observed.undated_atom_article_link_candidates).toBe(1);
    expect(observed.undated_atom_link_diagnostic.valid_first_party_article_links).toBe(1);
    expect(observed.undated_atom_link_diagnostic.rejected_original_path).toBe(2);
    expect(observed.original_page_precise_date_24h).toBe(1);
    expect(observed.private_original_article_candidates).toHaveLength(1);
    expect(observed.private_original_article_candidates[0].native_published_at)
      .toBe("2026-10-11T17:15:00.000Z");
    expect(observed.private_original_article_candidates[0].eligible_for_publication).toBe(false);
    expect(observed.commercial_eligible).toBe(false);
  });
  it("rejects deceptive root Daily date mismatches, arbitrary names, query strings, off-hosts and update-only clocks",async()=>{
    const blocked=[
      "https://www.statcan.gc.ca/daily-quotidien/261011/dq261010a-eng.htm",
      "https://www.statcan.gc.ca/daily-quotidien/261011/index.html",
      "https://www.statcan.gc.ca/daily-quotidien/261011/dq261011a-eng.htm?download=1",
      "https://evil.example/daily-quotidien/261011/dq261011a-eng.htm",
      "https://www150.statcan.gc.ca/daily-quotidien/261011/dq261011a-eng.htm",
      "https://www.statcan.gc.ca/daily-quotidien/261011/dq261011a-eng.htm#summary",
    ];
    for(const url of blocked) {
      const diagnostics={};
      const fetchImpl=vi.fn(async()=>{throw Error("MUST_NOT_FETCH")});
      expect(await fetchVerifiedPublisherPageDate(url,"macro",{
        now:NOW,fetchImpl,diagnostics,
      })).toBeNull();
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(diagnostics).toMatchObject({code:"URL_UNAPPROVED"});
    }
    const daily="https://www.statcan.gc.ca/daily-quotidien/261011/dq261011a-eng.htm";
    const diagnostics={};
    expect(await fetchVerifiedPublisherPageDate(daily,"macro",{
      now:NOW,diagnostics,
      fetchImpl:async()=>ok('<html><meta name="dateModified" content="2026-10-11T17:15:00Z"></html>',"text/html"),
    })).toBeNull();
    expect(diagnostics).toMatchObject({code:"PRECISE_PUBLICATION_UNVERIFIED"});
  });
  it("never promotes Atom updated, forbidden StatCan product path or arbitrary article URL",async()=>{
    const bad=feed(entry(forbidden)+entry("https://evil.example/n1/en/daily-quotidien/261011/dq261011a-eng.htm"));
    const res=await probeExpandedSource(statcan,{now:NOW,
      openDiscovery:true,collectPrivateCandidates:true,
      fetchImpl:async()=>ok(bad,"application/atom+xml")});
    expect(res.undated_atom_link_diagnostic.rejected_original_path).toBe(1);
    expect(res.undated_atom_link_diagnostic.statcan_unapproved_path_families.N1_PUB).toBe(1);
    expect(res.undated_atom_link_diagnostic.rejected_publisher_host).toBe(1);
    expect(res.original_page_precise_date_checks).toBe(0);
    expect(res.private_original_article_candidates).toEqual([]);
    expect(res.current_scored_intelligence_verified).toBe(false);
    const diagnostics={};
    const page=await fetchVerifiedPublisherPageDate(valid+"?redirect=evil.test","macro",{
      now:NOW,diagnostics,fetchImpl:async()=>{throw Error("NO_REQUEST_ALLOWED");},
    });
    expect(page).toBeNull();
    expect(diagnostics).toMatchObject({code:"URL_UNAPPROVED"});
  });
  it("still denies synthetic future-dated original and does not sign any captured article",()=>{
    const f=feed('<entry><title>Canadian price update</title>'+
      '<published>2026-10-12T12:00:00Z</published>'+link(valid)+'</entry>');
    expect(originalPublisherPrivateCandidates(f,statcan,NOW,{captureAllTopics:true}))
      .toHaveLength(0);
  });
  it("projects only fixed counters to private D1 across the existing 3 domains",async()=>{
    const probe=vi.fn(async(s:{id:string;domain:string})=>({
      source_id:s.id,domain:s.domain,publisher_reachable:true,format_valid:true,
      original_publisher_topical_30m:0,original_publisher_topical_90m:0,
      original_publisher_topical_6h:0,original_publisher_open_24h_count:0,
      source_native_7d_release_items:0,private_original_article_candidates:[],
      undated_atom_link_diagnostic:{
        undated_entries:1,rel_missing_alternate_or_canonical:0,
        alternate_missing_href:0,valid_first_party_article_links:0,
        rejected_publisher_host:0,rejected_original_path:1,rejected_unsafe_or_malformed:0,
        statcan_unapproved_path_families:{
          N1_EN_DAILY:0,N1_DAILY:0,N1_PUB:1,N1_RSS:0,N1_EN_OTHER:0,OTHER:0,
        },
      },
    }));
    const pulse=await probe30MinThreeDomainPulse({now:NOW,probe});
    const rows=projectSourcePulseForD1(pulse);
    expect(rows).toHaveLength(3);
    const macro=rows.find(x=>x.domain==="macro")!;
    const s=macro.metadata.source_feed_recovery_diagnostics.find(
      (x:{source_id:string})=>x.source_id==="statcan_prices_original_atom_review");
    expect(s.atom_original_link_diagnostics.statcan_unapproved_path_families.N1_PUB).toBe(1);
    expect(JSON.stringify(s)).not.toContain("https://");
    expect(pulse.independently_verified_current_intelligence_count).toBe(0);
    expect(pulse.payments_performed).toBe(0);
    expect(pulse.supabase_requests).toBe(0);
  });
});