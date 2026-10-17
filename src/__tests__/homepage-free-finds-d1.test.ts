import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {findCardFromObservedRelease,type FindCardV1} from "../lib/find-card-v1";
import {
  selectHomepageFreeFind,eligibleHomeFindCards,
  parseHomepageFindsFeed,homeFindsPulse,
} from "../lib/homepage-free-finds";
import type {StatelessIntelligenceSignal} from "../lib/stateless-intelligence-model";

const NOW=Date.parse("2026-10-17T17:00:00Z");
const signal=(category:"geopolitics"|"macro"|"rare_earth",published_at:string):StatelessIntelligenceSignal=>({
 id:category+"-1234abcd",category,
 title:"Geomacro finds an original-dated first-party government statement",
 topic:category==="macro"?"monetary policy":category==="rare_earth"?"critical-minerals policy":"foreign policy",
 geography:null,development_type:"official update",published_at,date_precision:"exact",
 observed_release_count:1,sources_credited:[],status:"official_release_observed_unscored",
 same_event_corrob_verified:false,severity:null,
 what_changed:"A real first-party original release was observed, but event-specific effects were not verified.",
 why_it_matters:"Official developments can affect external risk but this does not prove severity or commercial permissions.",
});
function card(category:"geopolitics"|"macro"|"rare_earth",at:string){
 const v=findCardFromObservedRelease(signal(category,at),NOW);
 if(!v)throw Error("fixture-invalid");
 return v;
}
function feed(cards:FindCardV1[]){
 return {ok:true,schema:"geomacro.find-card-feed.v1",version:"v1",cards,
  chargeable:false,scored:false,independent_same_event_verified:false,
  source_metadata_returned:false,original_release_delay_minutes:15};
}
describe("unscored three-domain homepage from existing public D1 journal",()=>{
 it("selects one genuinely original-dated 24h public Find, never a refreshed old score",()=>{
  const yesterday=card("geopolitics","2026-10-16T17:10:00Z");
  const earlier=card("macro","2026-10-10T11:00:00Z");
  const selected=selectHomepageFreeFind([earlier,yesterday],NOW);
  expect(selected?.card.id).toBe(yesterday.id);
  expect(selected?.isCurrent).toBe(true);
  expect(selected?.card.severity).toBeNull();
  expect(homeFindsPulse([earlier,yesterday],NOW).map(p=>p.state))
   .toEqual(["recent_original","dated_original","unavailable"]);
 });
 it("retains original dates and a truthful historical label when fresh is absent",()=>{
  const old=card("rare_earth","2026-10-10T11:00:00Z");
  expect(selectHomepageFreeFind([old],NOW)?.isCurrent).toBe(false);
  expect(selectHomepageFreeFind([old],NOW)?.originalAt).toBe(old.published_at);
 });
 it("does not bypass original 15-minute embargo, future, 30-day retention or day-only embargo",()=>{
  const v=card("macro","2026-10-17T15:00:00Z");
  const early={...v,published_at:"2026-10-17T16:50:00Z"};
  const future={...v,published_at:"2026-10-18T16:00:00Z"};
  const ancient={...v,published_at:"2026-09-01T11:00:00Z"};
  expect(eligibleHomeFindCards([early,future,ancient],NOW)).toEqual([]);
  const day={...v,date_precision:"day" as const,published_at:"2026-10-17T00:00:00.000Z"};
  expect(eligibleHomeFindCards([day],NOW)).toEqual([]);
  expect(eligibleHomeFindCards([day],Date.parse("2026-10-18T12:15:00Z"))).toHaveLength(1);
 });
 it("never accepts client-supplied price, score, upstream URL or fabricated signed-review status",()=>{
  const safe=card("geopolitics","2026-10-17T15:00:00Z");
  expect(parseHomepageFindsFeed(feed([safe]),NOW)).toHaveLength(1);
  for(const evil of [
    {...feed([safe]),chargeable:true},
    {...feed([safe]),scored:true},
    {...feed([safe]),independent_same_event_verified:true},
    {...feed([safe]),cards:[{...safe,severity:83}]},
    {...feed([safe]),cards:[{...safe,source_url:"https://secret.invalid/original"}]},
    {...feed([safe]),cards:Array(101).fill(safe)},
  ])expect(()=>parseHomepageFindsFeed(evil,NOW)).toThrow("HOME_FINDS_FEED_INVALID");
 });
 it("uses read-only bounded public D1 SSR and a client fallback, not paid/B2/Supabase",()=>{
  const home=readFileSync("src/components/home/live-intelligence-showcase.tsx","utf8");
  const route=readFileSync("src/routes/index.tsx","utf8");
  expect(route).toContain("fetchDirectDerivedNews()");
  expect(route).toContain("withPublicRuntimeTimeout");
  expect(route).toContain("initialFindCards");
  expect(home).toContain('fetch("/api/v1/finds"');
  expect(home).toContain("fetchDirectDerivedNews()");
  expect(home).toContain("selectHomepageFreeFind(cards)");
  expect(home).toContain("independent same-event review not established");
  for(const forbidden of ["useIntelligence(", "RiskBadge", "settleCoinbaseX402(",
   "SUPABASE_SERVICE_ROLE_KEY","B2_APPLICATION_KEY"]){
    expect(home).not.toContain(forbidden);
  }
 });
});
