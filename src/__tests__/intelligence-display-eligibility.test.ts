import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {concreteIntelligenceHeadline,isConcretePublicIntelligence,
  intelligenceRequiredSourceCredits,intelligenceDisplayRejection}
  from "@/lib/intelligence-concrete-publication";
import {findCardFromObservedRelease} from "@/lib/find-card-v1";
import type {StatelessIntelligenceSignal} from "@/lib/stateless-intelligence-model";

const at="2026-10-25T12:00:00.000Z";
const observation=(options:Partial<StatelessIntelligenceSignal>={}):StatelessIntelligenceSignal=>({
 id:"macro-12345678",category:"macro",
 title:"Geomacro finds Bank of Canada released a monthly inflation report",
 what_changed:"Bank of Canada released a monthly inflation report, with no market response inferred.",
 why_it_matters:"Original publication can inform FX and inflation monitoring without assuming a change in exchange rates.",
 topic:"inflation and prices",geography:null,development_type:"economic release",
 published_at:at,date_precision:"exact",observed_release_count:1,
 sources_credited:["Statistics Canada"],status:"official_release_observed_unscored",
 same_event_corrob_verified:false,severity:null,...options
});

describe("all-three-category credited concrete Intelligence display rules",()=>{
 it("allows genuine named-action first-party releases with all required credits visible",()=>{
  for(const [category,title,change,credit] of [
   ["macro","Bank of Canada released an inflation report",
    "Bank of Canada released an inflation report covering consumer prices.","Statistics Canada"],
   ["geopolitics","United Nations announced a Security Council meeting",
    "United Nations announced a Security Council meeting on humanitarian issues.","United Nations"],
   ["rare_earth","European Commission launched a critical minerals consultation",
    "European Commission launched a critical minerals consultation for producers.","European Commission"],
  ] as const){
   const row=observation({id:category+"-12345678",category,
     title:"Geomacro finds "+title,what_changed:change,
     topic:category==="geopolitics"?"foreign policy":
       category==="macro"?"inflation and prices":"critical-minerals policy",
     sources_credited:[credit]});
   expect(concreteIntelligenceHeadline(row)).toContain(title);
   expect(intelligenceDisplayRejection(row)).toBeNull();
   expect(isConcretePublicIntelligence(row)).toBe(true);
   expect(intelligenceRequiredSourceCredits(row)).toEqual([credit]);
   // The homepage Find cannot strip an acknowledgement licence from the card.
   expect(findCardFromObservedRelease(row,Date.parse(at)+3600000)).toBeNull();
  }
 });
 it("retains an explicit not-independently-verified state for source reports",()=>{
  const row=observation({
   status:"osint_feed_observed_unverified",
   development_type:"unverified OSINT feed observation",
   title:"Geomacro finds Bank of Canada announced a new monetary policy review",
   what_changed:"A monitored source feed reports: Bank of Canada announced a new monetary policy review. This report has not been independently verified.",
   sources_credited:["Monitored feed: economics.example"]
  });
  expect(isConcretePublicIntelligence(row)).toBe(true);
  expect(intelligenceRequiredSourceCredits(row)).toEqual([]);
  expect(intelligenceDisplayRejection({...row,
   sources_credited:["Monitored feed: news.un.org"]})).toBe("UNVERIFIED_ORIGINAL_SOURCE");
 });
 it("never upgrades generic updates, unknown actors, scores or unsourced headlines to news",()=>{
  expect(intelligenceDisplayRejection(observation({status:"official_feed_candidate_unscored"})))
    .toBe("INVALID_STATE_OR_CREDIT");
  expect(intelligenceDisplayRejection(observation({title:"Geomacro finds inflation and prices source-feed observation"})))
    .toBe("UNKNOWN_ACTOR_OR_ACTION");
  expect(intelligenceDisplayRejection(observation({severity:90})))
    .toBe("INVALID_STATE_OR_CREDIT");
  expect(intelligenceDisplayRejection(observation({title:"Geomacro finds GDP increased 5 percent"})))
    .toBe("UNKNOWN_ACTOR_OR_ACTION");
  expect(intelligenceDisplayRejection(observation({sources_credited:["<malicious>"]})))
    .toBe("INVALID_STATE_OR_CREDIT");
 });
 it("the actual locked desk acknowledges required credits and labels source-reported uncertainty",()=>{
  const desk=readFileSync("src/components/intelligence/stateless-live-desk.tsx","utf8");
  expect(desk).toContain("intelligenceRequiredSourceCredits(signal)");
  expect(desk).toContain("aria-label=\"Required source attribution\"");
  expect(desk).toContain('signal.status !== "osint_feed_observed_unverified"');
  expect(desk).not.toContain("Not independently verified");
  expect(desk).toContain("Official release observed · Unscored");
  expect(desk).not.toContain("SOURCE / PUBLISHER");
 });
});
