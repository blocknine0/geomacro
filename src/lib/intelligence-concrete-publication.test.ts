import {describe,it,expect} from "vitest";
import type {StatelessIntelligenceSignal} from "./stateless-intelligence-model";
import {isConcretePublicIntelligence,concreteIntelligenceHeadline,concreteGeomacroAnalysis,isConcreteHomeFind,intelligenceRequiredSourceCredits} from "./intelligence-concrete-publication";
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
 it("rejects unsupported unverified feed rows and candidates, while retaining credited concrete originals",()=>{
  const s=sample("geopolitics");
  expect(isConcretePublicIntelligence({...s,status:"osint_feed_observed_unverified"})).toBe(false);
  expect(isConcretePublicIntelligence({...s,status:"official_feed_candidate_unscored"})).toBe(false);
  expect(isConcretePublicIntelligence({...s,sources_credited:["WTO news"]})).toBe(true);
  expect(intelligenceRequiredSourceCredits({...s,sources_credited:["WTO news"]})).toEqual(["WTO news"]);
  expect(isConcretePublicIntelligence({...s,title:"Geomacro finds geopolitical publisher candidate source-feed observation"})).toBe(false);
  expect(isConcretePublicIntelligence({...s,what_changed:"A monitored feed contains a dated item on a geopolitical publisher candidate."})).toBe(false);
 });
 it("admits three-domain concrete OSINT reports while rejecting anonymous publisher candidates",()=>{
  for(const category of ["geopolitics","macro","rare_earth"] as const){
    const basis=sample(category);
    const report={...basis,status:"osint_feed_observed_unverified" as const,
      development_type:"unverified OSINT feed observation",date_precision:"exact" as const,
      sources_credited:["Monitored feed: news.google.com (aggregator; original publisher not verified)"],
      what_changed:"A monitored source feed reports: "+basis.what_changed+
        " This report has not been independently verified."};
    expect(isConcretePublicIntelligence(report),category).toBe(true);
    expect(concreteIntelligenceHeadline(report)).toBe(basis.title.replace(/^Geomacro finds /u,""));
    expect(isConcretePublicIntelligence({...report,
      title:"Geomacro finds macro publisher candidate source-feed observation"})).toBe(false);
    expect(isConcretePublicIntelligence({...report,
      sources_credited:["Monitored feed: news.un.org"]})).toBe(false);
  }
 });
 it("shows first-party governmental original facts without blanketing every publisher by credit",()=>{
  const macro=sample("macro");
  expect(isConcretePublicIntelligence({...macro,sources_credited:["Federal Reserve Board"]})).toBe(true);
  const minerals=sample("rare_earth");
  expect(isConcretePublicIntelligence({...minerals,sources_credited:["U.S. Department of Energy"]})).toBe(true);
  // Explicit public-attribution regimes must be visibly acknowledged on
  // Intelligence cards; the source-neutral homepage remains separately gated.
  for(const credit of ["Contains public sector information licensed under the Open Government Licence v3.0.",
   "UN News","United Nations","Statistics Canada","WTO news"]){
    expect(isConcretePublicIntelligence({...macro,sources_credited:[credit]}),credit).toBe(true);
    expect(intelligenceRequiredSourceCredits({...macro,sources_credited:[credit]})).toEqual([credit]);
  }
 });
 it("uses already derived actor/action without inventing a publisher as the actor",()=>{
   const report={...sample("geopolitics"),
    title:"Geomacro finds Experts warn UN committee about unlawful killings",
    what_changed:"Experts told a UN committee that unlawful killings had been reported, according to their statement."};
   expect(concreteIntelligenceHeadline(report)).toBe("Experts warn UN committee about unlawful killings");
   expect(isConcretePublicIntelligence(report)).toBe(true);
 });
 it("rejects synthetic or anonymous homepage cards",()=>{
  const card={domain:"macro",headline:"Actor not verified: macro publisher candidate",
   what_changed:"A monitored source feed contains a dated item about macroeconomic policy."};
  expect(isConcreteHomeFind(card as never)).toBe(false);
  expect(isConcreteHomeFind({...card,headline:"Federal Reserve announced new monetary policy measures",what_changed:"Federal Reserve announced a new monetary policy measure and the original dated announcement."} as never)).toBe(true);
 });
 it.each(["called for dialogue", "appealed for dialogue", "maintained the policy rate", "released an economic outlook"])(
  "keeps an already qualified homepage action visible: %s", action=>{
   expect(isConcreteHomeFind({domain:"geopolitics",headline:"United Nations "+action,
     what_changed:"United Nations "+action+" in its dated statement."} as never)).toBe(true);
  });

});
