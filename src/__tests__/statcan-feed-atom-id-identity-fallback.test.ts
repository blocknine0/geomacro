import {describe,expect,it} from "vitest";
import {observeUndatedFirstPartyAtomFeed} from "../../scripts/lib/private-undated-feed-observations.mjs";
import {reconcileUndatedPrivateFeedObservations} from "../../scripts/lib/private-undated-feed-dedup.mjs";
import {EXPANDED_OFFICIAL_SOURCES} from "../../scripts/ops/probe-expanded-official-source-mesh.mjs";
const source=EXPANDED_OFFICIAL_SOURCES.find((x:{id:string})=>x.id==="statcan_prices_original_atom_review")!;
const now=new Date("2026-10-11T19:00:00.000Z");
const entry=(id:string,published="")=>
  '<entry><title>Statistics Canada consumer prices data release</title>'+
  '<id>tag:www150.statcan.gc.ca,2026:release:'+id+'</id>'+
  '<updated>2026-10-11T18:59:00Z</updated>'+
  published+
  '<link rel="alternate" href="https://www150.statcan.gc.ca/n1/rss/dai-quo/18-eng.atom"/>'+
  '</entry>';
const feed=(i:number)=>"<feed>"+
  Array.from({length:i},(_,k)=>entry("daily-"+k)).join("")+"</feed>";
describe("Atom stable entry ID fallback does not imply original article publication",()=>{
  it("keeps all 60 distinct original feed entries despite unavailable canonical article paths",()=>{
    const result=observeUndatedFirstPartyAtomFeed(feed(60),source,{now});
    expect(result).toHaveLength(60);
    expect(result.every(x=>x.feed_entry_identity_kind==="OFFICIAL_ATOM_ENTRY_ID")).toBe(true);
    expect(new Set(result.map(x=>x.original_link_sha256)).size).toBe(60);
    expect(result[0].publication_clock_status).toBe("UNKNOWN");
    expect(result[0].eligible_for_scoring).toBe(false);
    expect(result[0].eligible_for_publication).toBe(false);
    expect(JSON.stringify(result)).not.toContain("tag:www150");
    expect(JSON.stringify(result)).not.toContain("consumer prices data release");
    expect(JSON.stringify(result)).not.toContain("https://");
  });
  it("uses entry IDs even when every alternate path is official-host but unapproved for article fetch",()=>{
    const data="<feed>"+entry("independent-42")+"</feed>";
    const found=observeUndatedFirstPartyAtomFeed(data,source,{now});
    expect(found).toHaveLength(1);
    expect(found[0].original_article_path_verified).toBe(false);
  });
  it("never re-labels Atom updated as published or overrides explicit future published",()=>{
    const input="<feed>"+entry("future",'<published>2026-10-12T20:00:00Z</published>')+"</feed>";
    expect(observeUndatedFirstPartyAtomFeed(input,source,{now})).toEqual([]);
  });
  it("initially baselines old feed IDs; then detects only a brand new feed ID",()=>{
    const first=observeUndatedFirstPartyAtomFeed(feed(60),source,{now});
    const old=reconcileUndatedPrivateFeedObservations({
      domain:"macro",checkedAt:now.toISOString(),observations:first,
      previousHistory:[],
    });
    expect(old.initial_baseline_run).toBe(true);
    expect(old.initial_backlog_entries_baselined).toBe(60);
    expect(old.new_feed_entries_since_previous_observation).toBe(0);
    const nextAt=new Date(now.getTime()+30*60000);
    const next=observeUndatedFirstPartyAtomFeed("<feed>"+entry("daily-22")+entry("new-61")+"</feed>",
      source,{now:nextAt});
    const second=reconcileUndatedPrivateFeedObservations({
      domain:"macro",checkedAt:nextAt.toISOString(),observations:next,
      previousHistory:old.recent_private_undated_feed_fingerprints,
    });
    expect(second.new_feed_entries_since_previous_observation).toBe(1);
    expect(second.existing_feed_entries_repeated).toBe(1);
    expect(second.publication_clock_verified).toBe(false);
    expect(second.chargeable).toBe(false);
  });
});