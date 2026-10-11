import {describe,expect,it,vi} from "vitest";
import {EXPANDED_OFFICIAL_SOURCES,probeExpandedSource} from "../../scripts/ops/probe-expanded-official-source-mesh.mjs";
import {probe30MinThreeDomainPulse} from "../../scripts/ops/probe-30min-three-domain-pulse.mjs";
import {projectSourcePulseForD1} from "../../scripts/ops/write-30min-source-pulse-d1.mjs";

const now=new Date("2026-10-11T18:00:00Z");
const statcan=EXPANDED_OFFICIAL_SOURCES.find((s:{id:string})=>
  s.id==="statcan_prices_original_atom_review")!;
const link=(url:string,rel="alternate")=>'<link rel="'+rel+'" href="'+url+'"/>';
const entry=(links:string)=>'<entry><title>Canada consumer price update</title>'+
  '<updated>2026-10-11T17:40:00Z</updated>'+links+'</entry>';
const base="https://www150.statcan.gc.ca/n1/daily-quotidien/261011/dq261011a-eng.htm";
const sample='<feed>'+
  entry(link(base))+entry(link("https://evil.example/n1/daily-quotidien/261011/dq261011a-eng.htm"))+
  entry(link("https://www150.statcan.gc.ca/n1/rss/dai-quo/18-eng.atom"))+
  entry('<link rel="alternate"/>')+
  entry('<link rel="self" href="'+base+'"/>')+
  '</feed>';
const http=(body:string,mime:string)=>new Response(body,{
  status:200,headers:{"content-type":mime},
});
describe("#2041 Atom missing-date original-link safe rejection categorization",()=>{
  it("separates real first-party candidates, disallowed hosts/paths, missing href and nonarticle rel",async()=>{
    const fetchImpl=vi.fn(async(url:string)=>url===statcan.url
      ?http(sample,"application/atom+xml"):new Response("403",{status:403}));
    const result=await probeExpandedSource(statcan,{
      now,fetchImpl,openDiscovery:true,collectPrivateCandidates:true,
    });
    expect(result.source_native_release_items).toBe(0);
    expect(result.source_item_provenance_diagnostics.item_native_published_missing).toBe(5);
    expect(result.undated_atom_link_diagnostic).toEqual({
      undated_entries:5,
      rel_missing_alternate_or_canonical:1,
      alternate_missing_href:1,
      valid_first_party_article_links:1,
      rejected_publisher_host:1,
      rejected_original_path:1,
      rejected_unsafe_or_malformed:0,
      statcan_unapproved_path_families:{
        N1_EN_DAILY:0,N1_DAILY:0,N1_PUB:0,
        N1_RSS:1,N1_EN_OTHER:0,OTHER:0,
      },
      statcan_other_path_shapes:{
        ROOT:0,N1_OTHER:0,NON_N1:0,SUFFIX_HTML:0,SUFFIX_XML:0,SUFFIX_OTHER:0,QUERY_PRESENT:0,
      },
    });
    expect(result.undated_atom_article_link_candidates).toBe(1);
    expect(result.original_page_precise_date_checks).toBe(1);
    expect(result.first_party_original_page_probe_codes.HTTP_UNAUTHORIZED).toBe(1);
    expect(JSON.stringify(result.undated_atom_link_diagnostic)).not.toContain("http");
    expect(result.commercial_eligible).toBe(false);
    expect(result.private_original_article_candidates).toHaveLength(0);
  });
  it("distinguishes upstream no-entry from all published fields missing",async()=>{
    const empty=await probeExpandedSource(statcan,{now,openDiscovery:true,
      fetchImpl:async()=>http("<feed></feed>","application/atom+xml")});
    const undated=await probeExpandedSource(statcan,{now,openDiscovery:true,
      fetchImpl:async()=>http('<feed>'+entry('<link rel="self" href="'+base+'"/>')+'</feed>',
        "application/atom+xml")});
    expect(empty.undated_atom_link_diagnostic.undated_entries).toBe(0);
    expect(undated.undated_atom_link_diagnostic.undated_entries).toBe(1);
    expect(undated.undated_atom_link_diagnostic.rel_missing_alternate_or_canonical).toBe(1);
    expect(undated.source_native_24h_release_items).toBe(0);
  });
  it("includes only numeric per-issuer Atom link results in D1 across all 3 categories",async()=>{
    const probe=vi.fn(async(src:{id:string;domain:string})=>({
      source_id:src.id,domain:src.domain,publisher_reachable:true,format_valid:true,
      original_publisher_topical_30m:0,original_publisher_topical_90m:0,
      original_publisher_topical_6h:0,source_native_7d_release_items:0,
      original_publisher_open_24h_count:0,private_original_article_candidates:[],
      undated_atom_link_diagnostic:{
        undated_entries:60,rel_missing_alternate_or_canonical:59,
        alternate_missing_href:0,valid_first_party_article_links:0,
        rejected_publisher_host:0,rejected_original_path:1,
        rejected_unsafe_or_malformed:0,
      },
      original_page_precise_date_checks:0,original_page_precise_date_24h:0,
    }));
    const pulse=await probe30MinThreeDomainPulse({now,probe});
    const projected=projectSourcePulseForD1(pulse);
    expect(projected).toHaveLength(3);
    for(const row of projected){
      const codes=row.metadata.source_feed_recovery_diagnostics[0]
        .atom_original_link_diagnostics;
      expect(codes.undated_entries).toBe(60);
      expect(codes.rel_missing_alternate_or_canonical).toBe(59);
      expect(JSON.stringify(codes)).not.toContain("https://");
      expect(row.metadata.commercial_eligible).toBe(false);
    }
    expect(pulse.independently_verified_current_intelligence_count).toBe(0);
    expect(pulse.payments_performed).toBe(0);
  });
});