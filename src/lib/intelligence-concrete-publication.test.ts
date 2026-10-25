import {describe,it,expect} from "vitest";
import type {StatelessIntelligenceSignal} from "./stateless-intelligence-model";
import {isConcretePublicIntelligence,concreteGeomacroAnalysis,isConcreteHomeFind} from "./intelligence-concrete-publication";
const sample=(category:StatelessIntelligenceSignal["category"]):StatelessIntelligenceSignal=>{
 const nouns={
  geopolitics:["United Nations announced new sanctions on cross-border trade","sanctions and trade restrictions"],
  macro:["Federal Reserve announced new monetary policy measures","monetary policy"],
  rare_earth:["European Union announced new critical mineral export controls","critical-mineral inputs"],
 } as const;
 const [headline,topic]=nouns[category];
 return {id:category+"-12345678",category,
  title:"Geomacro finds "+headline,
  what_changed:headline+". The action was announced in the original-dated release.",
  why_it_matters:"The stated action matters to monitored exposures; actual effects require separate confirmation.",
  topic,geography:null,development_type:"official update",
  published_at:"2026-10-25T08:00:00.000Z",date_precision:"exact",
  observed_release_count:1,sources_credited:[],
  status:"official_release_observed_unscored",
  same_event_corrob_verified:false,severity:null};
};
describe("actual-event Intelligence publication",()=>{
 it("accepts source-private concrete actor/actions in all three categories",()=>{
  for(const category of ["geopolitics","macro","rare_earth"] as const){
   const item=sample(category);
   expect(isConcretePublicIntelligence(item),category).toBe(true);
   expect(concreteGeomacroAnalysis(item).length).toBeGreaterThan(45);
  }
 });
 it("rejects unverified feed rows, candidates, anonymous prose and mandatory-credit originals",()=>{
  const s=sample("geopolitics");
  expect(isConcretePublicIntelligence({...s,status:"osint_feed_observed_unverified"})).toBe(false);
  expect(isConcretePublicIntelligence({...s,status:"official_feed_candidate_unscored"})).toBe(false);
  expect(isConcretePublicIntelligence({...s,sources_credited:["WTO news"]})).toBe(false);
  expect(isConcretePublicIntelligence({...s,title:"Geomacro finds geopolitical publisher candidate source-feed observation"})).toBe(false);
  expect(isConcretePublicIntelligence({...s,what_changed:"A monitored feed contains a dated item on a geopolitical publisher candidate."})).toBe(false);
 });
 it("rejects synthetic or anonymous homepage cards",()=>{
  const card={domain:"macro",headline:"Actor not verified: macro publisher candidate",
   what_changed:"A monitored source feed contains a dated item about macroeconomic policy."};
  expect(isConcreteHomeFind(card as never)).toBe(false);
  expect(isConcreteHomeFind({...card,headline:"Federal Reserve announced new monetary policy measures",what_changed:"Federal Reserve announced a new monetary policy measure and the original dated announcement."} as never)).toBe(true);
 });
});
