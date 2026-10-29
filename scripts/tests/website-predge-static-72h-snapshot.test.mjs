import test from "node:test";
import assert from "node:assert/strict";
import {buildWebsitePilotSnapshot,verifyWebsitePilotStaticReadback,WEBSITE_PILOT_MAX_ROWS}
 from "../lib/website-predge-static-72h-snapshot.mjs";

const now=Date.parse("2026-10-29T09:45:00.000Z");
const stamp="2026-10-29T08:00:00.000Z";
const row=(category,id,status="official_release_observed_unscored")=>({
 id:category+"-"+id,category,
 title:"Geomacro finds original development about sector policy updates",
 what_changed:"A dated official public monitoring input was observed and the event details require review.",
 why_it_matters:"The observation may matter for situational awareness but cannot establish price impact.",
 topic:"monetary policy",geography:null,
 development_type:status==="osint_feed_observed_unverified"?"unverified OSINT feed observation":"policy update",
 published_at:stamp,date_precision:"exact",observed_release_count:1,
 sources_credited:status==="osint_feed_observed_unverified"?
  ["Monitored feed: www.example.org"]:["Federal Reserve Board"],
 status,same_event_corrob_verified:false,severity:null,
});
test("single 72h Website cohort retains all three categories, IDs, clock and OSINT without conversion",()=>{
 const records=[row("geopolitics","12345678"),row("macro","abcdef12"),
  row("rare_earth","77778888","osint_feed_observed_unverified")];
 const got=buildWebsitePilotSnapshot(records,now);
 assert.equal(got.item_count,3);
 assert.deepEqual(got.counts,{geopolitics:1,macro:1,rare_earth:1});
 assert.equal(got.signals[0].published_at,stamp);
 assert.equal(got.signals.find(x=>x.category==="rare_earth").status,
  "osint_feed_observed_unverified");
 assert.match(got.source_native_ids_sha256,/^[a-f0-9]{64}$/);
 assert.equal(got.upstream_source_rights_automatically_granted,false);
 assert.equal(got.payments,0);
 assert.equal(got.signed,false);
});
test("expired originals are filtered by original clock, not re-ingestion",()=>{
 const old=row("macro","11111111");old.published_at="2026-10-20T12:00:00.000Z";
 const got=buildWebsitePilotSnapshot([old,row("rare_earth","22222222")],now);
 assert.deepEqual(got.counts,{geopolitics:0,macro:0,rare_earth:1});
});
test("conflicting/duplicate native IDs fail closed",()=>{
 const sample=row("macro","abcdef12");
 assert.throws(()=>buildWebsitePilotSnapshot([sample,sample],now),
  /DUPLICATE_SOURCE_NATIVE_ID/);
 assert.throws(()=>buildWebsitePilotSnapshot([sample,{...sample,title:sample.title+" revision"}],now),
  /CONFLICTING_SOURCE_NATIVE_ID/);
});
test("never truncate the 600-entry envelope silently",()=>{
 const rows=Array.from({length:WEBSITE_PILOT_MAX_ROWS+1},(_,i)=>
  row("macro",i.toString(16).padStart(8,"0")));
 assert.throws(()=>buildWebsitePilotSnapshot(rows,now),/CAPACITY_OVER_600_FAIL_CLOSED/);
});
test("never promote raw, unsafe or forged rows",()=>{
 for(const patch of [{url:"https://private.example.org"},{severity:90},
  {sources_credited:["https://publisher.test/article"]},
  {status:"signed_intelligence_verified"}]){
  assert.throws(()=>buildWebsitePilotSnapshot([{...row("macro","ffffffff"),...patch}],now),
   /INVALID_ARCHIVE_ROW/);
 }
});

test("exact static readback tolerates harmless no-op deployment clock, never changed native content",()=>{
 const expected=buildWebsitePilotSnapshot([row("geopolitics","12345678"),
   row("macro","abcdef12"),
   row("rare_earth","77778888","osint_feed_observed_unverified")],now);
 const live={...expected,checked_at:new Date(now-60_000).toISOString()};
 const r=verifyWebsitePilotStaticReadback(expected,live,now);
 assert.equal(r.same_website_archive_source_native_ids_verified,true);
 assert.equal(r.recent_rows,3);
 assert.equal(r.d1_reads,0);
 assert.throws(()=>verifyWebsitePilotStaticReadback(expected,{
  ...live,signals:live.signals.slice(1),item_count:2,
 },now),/EXACT_ID_PAYLOAD_ATTRIBUTION_MISMATCH/);
 assert.throws(()=>verifyWebsitePilotStaticReadback(expected,{
  ...live,checked_at:new Date(now-7*60*60_000).toISOString(),
 },now),/STALE_OR_FUTURE_DEPLOYMENT/);
});
