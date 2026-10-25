import {describe,expect,it} from "vitest";
import {observeUndatedFirstPartyAtomFeed} from "../../scripts/lib/private-undated-feed-observations.mjs";
import {reconcileUndatedPrivateFeedObservations} from "../../scripts/lib/private-undated-feed-dedup.mjs";
import {EXPANDED_OFFICIAL_SOURCES} from "../../scripts/ops/probe-expanded-official-source-mesh.mjs";
const src=EXPANDED_OFFICIAL_SOURCES.find((s:{id:string})=>s.id==="statcan_prices_original_atom_review")!;
const now=new Date("2026-10-11T19:15:00.000Z");
const feedPath="https://www150.statcan.gc.ca/n1/other-statcan-releases/entry.atom";
const xml=(size:number,updated="2026-10-11T19:14:00Z")=>"<feed>"+
 Array.from({length:size},(_,i)=>'<entry>'+
  '<title type="html"><strong>Statistics Canada Daily news</strong></title>'+
  '<updated>'+updated+'</updated>'+
  '<summary>Statistics Canada feed record '+i+'</summary>'+
  '<link rel="alternate" href="'+feedPath+'"/></entry>').join("")+
 "</feed>";
describe("#2041 last-resort bounded opaque first-party feed identity",()=>{
  it("retains distinct 60 source entries with unsupported article link and HTML title, no native publication clock",()=>{
    const rows=observeUndatedFirstPartyAtomFeed(xml(60),src,{now});
    expect(rows).toHaveLength(60);
    expect(new Set(rows.map(x=>x.original_link_sha256)).size).toBe(60);
    expect(rows.every(x=>x.feed_entry_identity_kind==="OPAQUE_FIRST_PARTY_FEED_ENTRY")).toBe(true);
    expect(rows.every(x=>x.headline_fingerprint_verified===true)).toBe(true);
    expect(rows.every(x=>x.private_relevance_triage.status==="UNCLASSIFIED")).toBe(true);
    expect(rows.every(x=>x.eligible_for_scoring===false&&x.eligible_for_publication===false)).toBe(true);
    expect(rows.every(x=>x.publication_clock_status==="UNKNOWN")).toBe(true);
    expect(JSON.stringify(rows)).not.toContain("Statistics Canada Daily news");
    expect(JSON.stringify(rows)).not.toContain("www150.statcan");
    expect(JSON.stringify(rows)).not.toContain("<strong>");
  });
  it("decodes escaped Atom HTML into private topical hints without retaining title or URL",()=>{
    const data="<feed><entry>"+
      "<title type='html'>&lt;strong&gt;Canadian consumer price release&lt;/strong&gt;: inflation &amp; raw material prices</title>"+
      "<updated>2026-10-25T18:00:00Z</updated>"+
      "<link rel='alternate' href='"+feedPath+"'/>"+
      "</entry></feed>";
    const rows=observeUndatedFirstPartyAtomFeed(data,src,{now});
    expect(rows).toHaveLength(1);
    expect(rows[0].headline_fingerprint_verified).toBe(true);
    expect(rows[0].private_relevance_triage).toMatchObject({
      status:"RELATED_UNVERIFIED",reason_code:"TOPIC_HINT_ONLY",
      topic_codes:["INFLATION"],publication_clock_verified:false,
      article_country_verified:false,independent_event_verified:false,
      commercial_rights_verified:false,score_verified:false,
      customer_delivery_eligible:false,
    });
    expect(rows[0].eligible_for_scoring).toBe(false);
    expect(rows[0].eligible_for_publication).toBe(false);
    expect(JSON.stringify(rows)).not.toContain("Canadian consumer price release");
    expect(JSON.stringify(rows)).not.toContain("www150.statcan.gc.ca");
    expect(JSON.stringify(rows)).not.toContain("raw material prices");
  });
  it("excludes Atom <updated> from identity and dedups identical entry across two observed polling clocks",()=>{
    const a=observeUndatedFirstPartyAtomFeed(xml(60,"2026-10-11T19:14:00Z"),src,{now});
    const later=new Date(now.getTime()+30*60000);
    const b=observeUndatedFirstPartyAtomFeed(xml(60,"2026-10-11T19:44:00Z"),src,{now:later});
    expect(a.map(x=>x.original_link_sha256)).toEqual(b.map(x=>x.original_link_sha256));
    const initial=reconcileUndatedPrivateFeedObservations({
      domain:"macro",checkedAt:now.toISOString(),observations:a,
      previousHistory:[],
    });
    expect(initial.initial_backlog_entries_baselined).toBe(60);
    const next=reconcileUndatedPrivateFeedObservations({
      domain:"macro",checkedAt:later.toISOString(),observations:b,
      previousHistory:initial.recent_private_undated_feed_fingerprints,
    });
    expect(next.new_feed_entries_since_previous_observation).toBe(0);
    expect(next.existing_feed_entries_repeated).toBe(60);
  });
  it("requires source-linked HTTPS identity; never interprets offsite content as original",()=>{
    const offsite='<feed><entry><title>Official statistics public report</title>'+
      '<link rel="alternate" href="https://not-statcan.example/n1/rss/dai-quo/18-eng.atom"/>'+
      '<summary>Untrusted external</summary></entry></feed>';
    expect(observeUndatedFirstPartyAtomFeed(offsite,src,{now})).toEqual([]);
    const declaredPublished=xml(1).replace("</entry>",
      "<published>2026-10-12T20:00:00Z</published></entry>");
    expect(observeUndatedFirstPartyAtomFeed(declaredPublished,src,{now})).toEqual([]);
  });
});