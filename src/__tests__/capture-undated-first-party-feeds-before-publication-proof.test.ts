import { describe,expect,it,vi } from "vitest";
import { observeUndatedFirstPartyAtomFeed } from "../../scripts/lib/private-undated-feed-observations.mjs";
import { reconcileUndatedPrivateFeedObservations } from "../../scripts/lib/private-undated-feed-dedup.mjs";
import { EXPANDED_OFFICIAL_SOURCES,probeExpandedSource } from "../../scripts/ops/probe-expanded-official-source-mesh.mjs";
import { probe30MinThreeDomainPulse } from "../../scripts/ops/probe-30min-three-domain-pulse.mjs";
import { write30MinSourcePulseToD1 } from "../../scripts/ops/write-30min-source-pulse-d1.mjs";

const now=new Date("2026-10-11T19:05:00.000Z");
const source=EXPANDED_OFFICIAL_SOURCES.find((x:{id:string})=>
  x.id==="statcan_prices_original_atom_review")!;
const url=(i:number)=>"https://www150.statcan.gc.ca/daily-content/official-release-"+i;
const entry=(u:string, extra="")=>
  '<entry><title>Canadian official consumer price report in detail</title>'+
  '<updated>2026-10-11T19:03:00Z</updated>'+extra+
  '<link rel="alternate" href="'+u+'"/></entry>';
const feed=(contents:string)=>"<feed>"+contents+"</feed>";
const valid=feed(Array.from({length:60},(_,i)=>entry(url(i))).join(""));
function getObs(data:string,at=now) {
  return observeUndatedFirstPartyAtomFeed(data,source,{now:at});
}
describe("#2041 publication-unknown data no longer vanishes before discovery",()=>{
  it("captures unexpected exact same-host first-party Atom link PATHs without pretending published date",()=>{
    const xs=getObs(valid);
    expect(xs).toHaveLength(60);
    expect(xs[0]).toMatchObject({
      schema:"geomacro.private-undated-first-party-observation.v1",
      domain:"macro",source_id:source.id,
      publication_clock_status:"UNKNOWN",
      original_article_path_verified:false,
      original_article_content_verified:false,
      article_category_relevance_verified:false,
      eligible_for_scoring:false,eligible_for_publication:false,
      commercial_derived_use_rights_verified:false,
    });
    expect(xs[0].original_link_sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(xs)).not.toContain("daily-content");
    expect(JSON.stringify(xs)).not.toContain("consumer price report");
    expect(JSON.stringify(xs)).not.toContain("<updated>");
  });
  it("rejects host spoof, nonalternate, source feed, unsafe HTTP and ANY per-item published tag",()=>{
    const data=feed(
      entry("https://evil.example/daily-content/release")+
      entry("http://www150.statcan.gc.ca/daily-content/release")+
      entry("https://www150.statcan.gc.ca/n1/rss/dai-quo/18-eng.atom")+
      entry(url(1),"<published>2026-10-12T20:00:00Z</published>")+
      '<entry><title>Other original release under review</title>'+
        '<updated>2026-10-11T19:04:00Z</updated>'+
        '<link rel="self" href="'+url(2)+'"/></entry>'
    );
    expect(getObs(data)).toHaveLength(0);
    expect(()=>getObs('<feed><!DOCTYPE bad><entry></entry></feed>')).toThrow();
  });
  it("separates first run backlog from a genuinely new feed URL in the next 30m poll",()=>{
    const first=getObs(valid);
    const before=reconcileUndatedPrivateFeedObservations({
      domain:"macro",checkedAt:now.toISOString(),observations:first,
    });
    expect(before.initial_baseline_run).toBe(true);
    expect(before.initial_backlog_entries_baselined).toBe(60);
    expect(before.new_feed_entries_since_previous_observation).toBe(0);
    const later=new Date("2026-10-11T19:35:00.000Z");
    const next=getObs(feed(entry(url(60))+entry(url(1))),later);
    const second=reconcileUndatedPrivateFeedObservations({
      domain:"macro",checkedAt:later.toISOString(),observations:next,
      previousHistory:before.recent_private_undated_feed_fingerprints,
    });
    expect(second.initial_baseline_run).toBe(false);
    expect(second.new_feed_entries_since_previous_observation).toBe(1);
    expect(second.existing_feed_entries_repeated).toBe(1);
    expect(second.publication_clock_verified).toBe(false);
    expect(second.chargeable).toBe(false);
    expect(second.tracked_first_party_feed_entries).toBe(61);
    expect(()=>reconcileUndatedPrivateFeedObservations({
      domain:"macro",checkedAt:now.toISOString(),
      observations:[{...first[0],eligible_for_publication:true}],
    })).toThrow();
    expect(()=>reconcileUndatedPrivateFeedObservations({
      domain:"rare_earth",checkedAt:now.toISOString(),
      observations:[first[0]],
    })).toThrow();
  });
  it("retains existing native-dated count at zero but actually finds 60 unclassified first-party feed entries",async()=>{
    const r=await probeExpandedSource(source,{
      now,openDiscovery:true,collectPrivateCandidates:true,
      fetchImpl:async()=>new Response(valid,{status:200,
        headers:{"content-type":"application/atom+xml"}}),
    });
    expect(r.publisher_reachable).toBe(true);
    expect(r.source_native_24h_release_items).toBe(0);
    expect(r.original_publisher_open_24h_count).toBe(0);
    expect(r.private_original_article_candidates).toEqual([]);
    expect(r.undated_observed_entry_count).toBe(60);
    expect(r.private_undated_feed_observations).toHaveLength(60);
    expect(r.commercial_eligible).toBe(false);
  });
  it("creates private 3-domain D1 baseline then 1 new undated observation only; no charge",async()=>{
    const db=new Map<string,any>();
    const client=()=>({
      persist:vi.fn(async (domain:string,state:any,args:any)=>{
        db.set(domain,{last_attempt_at:args.last_attempt_at,payload:{...state}});
      }),
      loadRows:async()=>db,
    });
    const inputs=[valid,feed(entry(url(60))+entry(url(1)))];
    for(let idx=0;idx<2;idx++){
      const at=new Date(now.getTime()+idx*30*60000);
      const xs=getObs(inputs[idx],at);
      const probe=vi.fn(async (s:{id:string;domain:string})=>({
        source_id:s.id,domain:s.domain,publisher_reachable:true,format_valid:true,
        original_publisher_topical_30m:0,original_publisher_topical_90m:0,
        original_publisher_topical_6h:0,
        source_native_7d_release_items:0,original_publisher_open_24h_count:0,
        private_original_article_candidates:[],
        private_undated_feed_observations:s.id===source.id?xs:[],
        undated_observed_entry_count:s.id===source.id?xs.length:0,
      }));
      const pulse=await probe30MinThreeDomainPulse({now:at,probe});
      expect(pulse.independently_verified_current_intelligence_count).toBe(0);
      const receipt=await write30MinSourcePulseToD1({report:pulse,createClient:client});
      expect(receipt.d1_readback_verified).toBe(true);
      expect(receipt.new_private_original_article_fingerprints).toBe(0);
      expect(receipt.undated_feed_original_publication_verified).toBe(false);
      expect(receipt.payment_performed).toBe(false);
      if(idx===0){
        expect(receipt.undated_feed_first_observation_baseline_count).toBe(60);
        expect(receipt.undated_feed_new_since_previous_poll_count).toBe(0);
      }else{
        expect(receipt.undated_feed_first_observation_baseline_count).toBe(0);
        expect(receipt.undated_feed_new_since_previous_poll_count).toBe(1);
      }
    }
    expect(db.get("macro").payload.recent_private_undated_feed_fingerprints.length)
      .toBe(61);
    expect(JSON.stringify(db.get("macro"))).not.toContain("https://");
    expect(JSON.stringify(db.get("macro"))).not.toContain("consumer price report");
  });
});