import {describe,it,expect} from "vitest";
import {checkedDerivedNews} from "@/lib/public-derived-news-client";

const now=Date.parse("2026-10-25T11:40:00.000Z");
const base={
 id:"macro-abcdef12",category:"macro",
 title:"Geomacro finds monetary policy source-feed observation",
 why_it_matters:"A monitored central bank feed can inform further checks of currency-related and macroeconomic exposure without an independently verified price movement.",
 topic:"monetary policy",what_changed:"A monitored source feed contains a dated item about monetary policy. Specific changes have not yet been independently verified.",
 geography:null,development_type:"unverified OSINT feed observation",
 published_at:"2026-10-25T11:25:00.000Z",date_precision:"exact",
 observed_release_count:1,sources_credited:["Monitored feed: www.bankofcanada.ca"],
 status:"osint_feed_observed_unverified",same_event_corrob_verified:false,severity:null,
} as const;
function read(item:unknown) {
 return checkedDerivedNews({ok:true,schema:"geomacro.website-derived-news-feed.v1",
   original_release_delay_minutes:0,retention_days:3,retention_hours:72,
   delivery_scope:"free_website_only",signals:[item]},now);
}
describe("site reads monitored feed source hostname without relaxing source safety",()=>{
 it("shows only source host (www included), never a raw source URL",()=>{
   expect(read(base)).toHaveLength(1);
   expect(read({...base,sources_credited:["Monitored feed: news.google.com (aggregator; original publisher not verified)"]})).toHaveLength(1);
   expect(read({...base,sources_credited:["Monitored feed: https://www.bankofcanada.ca/raw"]})).toHaveLength(0);
   expect(read({...base,title:"Geomacro finds https://www.bankofcanada.ca/raw"})).toHaveLength(0);
   expect(read({...base,severity:20})).toHaveLength(0);
   expect(read({...base,status:"official_release_observed_unscored"})).toHaveLength(0);
 });
});
