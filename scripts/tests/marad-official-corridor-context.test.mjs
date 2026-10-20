import test from "node:test";
import assert from "node:assert/strict";
import {
 MARAD_OFFICIAL_RSS_URL,summarizeMaradCorridorContext
} from "../lib/marad-official-corridor-context.mjs";
import {
 PRODUCTION_FREE_UPDATE_SOURCES,summarizeFreeSourceUpdates
} from "../lib/free-source-production-updates.mjs";
import {validateFreeLineupProbePayload} from "../lib/free-no-key-source-probe.mjs";
const at=new Date("2026-10-20T07:00:00Z");
const date="Tue, 20 Oct 2026 06:00:00 GMT";
const marad=(suffix,title,clock=date,host="www.maritime.dot.gov")=>
  "<item><title>"+title+"</title><link>https://"+host+
  "/msci/"+suffix+"</link><guid>https://"+host+"/msci/"+suffix+
  "</guid><pubDate>"+clock+"</pubDate></item>";
const rss=x=>'<rss version="2.0"><channel>'+x+"</channel></rss>";
const item1=marad("2026-013-red-sea-bab-el-mandeb-houthi-attacks",
 "2026-013-Red Sea, Bab el Mandeb Strait, Gulf of Aden");
const item2=marad("2026-011-persian-gulf-strait-hormuz-iranian-attacks",
 "2026-011-Persian Gulf, Strait of Hormuz and Gulf of Oman");
test("catalogue activates only canonical MARAD family in current 30m reader",()=>{
 const reader=PRODUCTION_FREE_UPDATE_SOURCES.filter(s=>s.id==="marad_advisories");
 assert.equal(reader.length,1);
 assert.equal(reader[0].category,"geopolitics");
 assert.equal(reader[0].format,"rss");
 assert.equal(reader[0].poll_minutes,30);
 assert.equal(reader[0].url,MARAD_OFFICIAL_RSS_URL);
 assert.equal(reader[0].maxBytes,256000);
});
test("native dated first-party advisory titles map to canonical route candidates only",()=>{
 const parsed=summarizeMaradCorridorContext(rss(item1+item2),at);
 assert.deepEqual(parsed.candidate_corridor_ids,[
   "bab_el_mandeb","gulf_of_aden_somali_basin","strait_of_hormuz"
 ]);
 assert.equal(parsed.advisory_items_with_corridor_terms,2);
 assert.equal(parsed.first_party_issuer_feed_items_with_native_date,2);
 assert.equal(parsed.actual_maritime_incidents_verified,0);
 assert.equal(parsed.rss_item_date_is_verified_article_page_date,false);
 assert.equal(parsed.commercial_rights_verified,false);
 assert.equal(JSON.stringify(parsed).includes("2026-013"),false);
 const spec=PRODUCTION_FREE_UPDATE_SOURCES.find(s=>s.id==="marad_advisories");
 assert.equal(validateFreeLineupProbePayload(spec,rss(item1)).valid,true);
 const summary=summarizeFreeSourceUpdates(spec,rss(item1+item2),at);
 assert.equal(summary.corridor_advisory_candidate_count,2);
 assert.deepEqual(summary.candidate_corridor_ids,parsed.candidate_corridor_ids);
 assert.equal(summary.independently_verified_event,false);
 assert.equal(summary.corridor_current_disruption_verified,false);
});
test("unverified off-domain, unrelated, stale, future and date-only items cannot populate routes",()=>{
 const payload=rss(
   marad("2026-013-red-sea-bab-el-mandeb-houthi-attacks","2026-013-Red Sea",date,"example.org")+
   marad("2026-010-red-sea-note","2026-010-Red Sea","2026-10-20")+
   marad("2026-009-red-sea-note","2026-009-Red Sea","Wed, 21 Oct 2026 06:00:00 GMT")+
   marad("2026-001-red-sea-note","2026-001-Red Sea","Mon, 12 Jan 2026 06:00:00 GMT")+
   marad("2026-008-global-advice","2026-008 Worldwide resources")+
   item1+item1
 );
 const p=summarizeMaradCorridorContext(payload,at);
 assert.equal(p.advisory_items_with_corridor_terms,1);
 assert.deepEqual(p.candidate_corridor_ids,["bab_el_mandeb","gulf_of_aden_somali_basin"]);
 assert.equal(p.publisher_advisory_current_status_verified,false);
 assert.equal(p.corridor_disruption_verified,false);
 assert.throws(()=>summarizeMaradCorridorContext("<html>Not RSS</html>",at),/MARAD_RSS_INVALID/);
 assert.throws(()=>summarizeMaradCorridorContext(rss(item1),new Date("invalid")),/MARAD_CLOCK_INVALID/);
});
test("existing source clock treats transport as candidate, never MARAD incident certification",()=>{
 const spec=PRODUCTION_FREE_UPDATE_SOURCES.find(s=>s.id==="marad_advisories");
 const noClock=rss(marad("2026-013-red-sea-bab-el-mandeb-houthi-attacks",
  "2026-013-Red Sea",""));
 const summary=summarizeFreeSourceUpdates(spec,noClock,at);
 assert.equal(summary.corridor_advisory_candidate_count,0);
 assert.deepEqual(summary.candidate_corridor_ids,[]);
 assert.equal(summary.latest_native_publication_at,null);
});
