import {describe,it,expect} from "vitest";
import {checkedDerivedNews} from "@/lib/public-derived-news-client";
import {projectSourceNeutralOsintSignal} from "../../scripts/lib/derived-news-readback-policy.mjs";

const now=Date.parse("2026-10-25T11:40:00.000Z");
const base=projectSourceNeutralOsintSignal({
 id:"macro-abcdef12",category:"macro",
 title:"Private Bank of Japan headline remains outside the public projection",
 why_it_matters:"The observation describes a policy topic without copying source language.",
 topic:"Monetary Policy & FX Liquidity",what_changed:"A dated source observation concerns Japan monetary policy and FX liquidity.",
 geography:"Japan",country_iso3:"JPN",corridor:null,event_direction:"tightening",
 event_action:"Reported Policy or Operating Action",development_type:"unverified OSINT feed observation",
 published_at:"2026-10-25T11:25:00.000Z",date_precision:"exact",
 observed_release_count:1,sources_credited:["Monitored feed: www.bankofcanada.ca"],
 status:"osint_feed_observed_unverified",same_event_corrob_verified:false,severity:null,
})!;
function read(item:unknown) {
 return checkedDerivedNews({ok:true,schema:"geomacro.website-derived-news-feed.v1",
   original_release_delay_minutes:0,retention_days:3,retention_hours:72,
   delivery_scope:"free_website_only",signals:[item]},now);
}
describe("site projects concrete findings while keeping monitored feed host private",()=>{
 it("accepts only concrete wording and never exposes a raw source URL or hostname",()=>{
   expect(read(base)).toHaveLength(1);
   expect(read(base)[0].sources_credited).toEqual([]);
   expect(read({...base,sources_credited:["Monitored feed: news.google.com (aggregator; original publisher not verified)"]})).toHaveLength(1);
   expect(read({...base,sources_credited:["Monitored feed: https://www.bankofcanada.ca/raw"]})).toHaveLength(0);
   expect(read({...base,title:"Geomacro finds https://www.bankofcanada.ca/raw"})).toHaveLength(0);
   expect(read({...base,severity:20})).toHaveLength(0);
   expect(read({...base,status:"official_release_observed_unscored"})).toHaveLength(0);
 });
});
