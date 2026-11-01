import {test} from "node:test";
import assert from "node:assert/strict";
import {buildDailyOfficialFinds,PUBLIC_DAILY_FINDS_SCHEMA} from "../lib/public-daily-official-finds.mjs";
const now=Date.parse("2026-11-01T18:00:00Z");
const official=(category,id,date,credits=["Statistics Canada"])=>({
 id,category,title:"Geomacro finds Federal Reserve issued FOMC statement on inflation and interest rates",
 what_changed:"Federal Reserve issued FOMC statement on inflation and interest rates. Actual rate changes require confirmation.",
 published_at:date,date_precision:date.length===10?"day":"exact",status:"official_release_observed_unscored",
 sources_credited:credits
});
test("daily shortlist keeps credited officials, balances 3 categories, forbids OSINT",()=>{
 const rows=[
  official("geopolitics","geo-1","2026-10-31T12:00:00Z",["Contains public sector information licensed under the Open Government Licence v3.0."]),
  official("macro","macro-1","2026-10-30",["Statistics Canada"]),
  official("rare_earth","mineral-1","2026-10-28",["Natural Resources Canada"]),
  {...official("rare_earth","osint-1","2026-11-01T15:00:00Z"),status:"osint_feed_observed_unverified"},
 ];
 const output=buildDailyOfficialFinds(rows,now);
 assert.equal(output.schema,PUBLIC_DAILY_FINDS_SCHEMA);
 assert.equal(output.official_only,true);
 assert.equal(output.chargeable,false);
 assert.equal(output.scored,false);
 assert.equal(output.source_urls_returned,false);
 assert.equal(output.mandatory_source_credits_preserved,true);
 assert.deepEqual(output.signals.map(s=>s.category).sort(),["geopolitics","macro","rare_earth"]);
 assert(output.signals.some(s=>s.sources_credited[0].includes("Government Licence")));
 assert(!output.signals.some(s=>s.id==="osint-1"));
});
test("do not relabel old originals or invent today's headline",()=>{
 const result=buildDailyOfficialFinds([official("macro","historical","2026-10-07")],now);
 assert.equal(result.signals[0]?.published_at,"2026-10-07");
 assert.equal(result.generated_at,"2026-11-01T18:00:00.000Z");
 assert.equal(buildDailyOfficialFinds([],now).signals.length,0);
});
test("day-only embargo, 30d bound and bad template are fail closed",()=>{
 const rows=[official("macro","future-day","2026-11-01"),
  official("macro","old","2026-09-29"),
  {...official("macro","bad","2026-10-30"),what_changed:"Source-feed observation of potential inflation impact"}];
 assert.equal(buildDailyOfficialFinds(rows,now).signals.length,0);
});
