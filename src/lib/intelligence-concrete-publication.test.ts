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

 it("distinguishes humanitarian security from election statements, even within geopolitics",()=>{
   const msf={...sample("geopolitics"),
     title:"Geomacro finds MSF called for stronger security measures to protect its work in Central Darfur",
     what_changed:"A monitored source feed reports: MSF called for stronger security measures to protect its work in Central Darfur. This report has not been independently verified.",
     status:"osint_feed_observed_unverified" as const,
     development_type:"unverified OSINT feed observation",
     sources_credited:["Monitored feed: news.google.com (aggregator; original publisher not verified)"],
     topic:"geopolitical security"};
   const brazil={...msf,
     id:"geopolitics-12345679",
     title:"Geomacro finds Trump said Brazil election was a disgrace",
     what_changed:"A monitored source feed reports: Trump said Brazil election was a disgrace. This report has not been independently verified."};
   const security=concreteGeomacroAnalysis(msf);
   const election=concreteGeomacroAnalysis(brazil);
   expect(isConcretePublicIntelligence(msf)).toBe(true);
   expect(isConcretePublicIntelligence(brazil)).toBe(true);
   expect(security).toContain("relief workers");
   expect(security).toContain("Central Darfur");
   expect(election).toContain("electoral misconduct");
   expect(election).toContain("Brazil election");
   expect(election).not.toBe(security);
   expect(election).not.toContain("continuity of access");
   expect(security).not.toContain("political legitimacy");
   expect(election).toContain("independently unverified");
 });
 it("explains distinct macro and minerals events without invented outcomes",()=>{
   const rates={...sample("macro"),
     title:"Geomacro finds Federal Reserve raised interest rates",
     what_changed:"Federal Reserve raised interest rates in a dated release."};
   const prices={...sample("macro"),
     title:"Geomacro finds Statistics Canada reported consumer price inflation",
     what_changed:"Statistics Canada reported consumer price inflation in its release."};
   const controls={...sample("rare_earth"),
     title:"Geomacro finds European Union announced lithium export controls",
     what_changed:"European Union announced lithium export controls in its dated release."};
   const exploration={...sample("rare_earth"),
     title:"Geomacro finds Canada announced a new mineral exploration project",
     what_changed:"Canada announced a new mineral exploration project in its dated release."};
   expect(concreteGeomacroAnalysis(rates)).toContain("borrowing costs");
   expect(concreteGeomacroAnalysis(prices)).toContain("purchasing-power");
   expect(concreteGeomacroAnalysis(controls)).toContain("shipments");
   expect(concreteGeomacroAnalysis(exploration)).toContain("viable production");
   expect(concreteGeomacroAnalysis(rates)).not.toBe(concreteGeomacroAnalysis(prices));
   expect(concreteGeomacroAnalysis(controls)).not.toBe(concreteGeomacroAnalysis(exploration));
   for(const story of [rates,prices,controls,exploration]){
     const explanation=concreteGeomacroAnalysis(story);
     expect(explanation).toContain(story.title.replace("Geomacro finds ",""));
     expect(explanation).not.toMatch(/https?:\/\/|www\./u);
   }
 });

 it("turns specific currently observed macro stories into different causal watchpoints",()=>{
  const headlines=[
   ["Mahama said Ghana is in talks with Russia over first nuclear power station","power-infrastructure","commissioning"],
   ["PM approved expansion of Jinnah and Allama Iqbal airports, eyes making Karachi air cargo hub","freight capacity","cargo handling"],
   ["Herculis Tokens SA announced XAUH Gold-Backed Token Offering With Swiss Bullion Reserves and Multi-Chain Access","reserve backing","central-bank reserve"],
   ["Sterling Financial reported 37.1% growth in nine-month profit before tax to 97.28bn","firm-level profitability","comparable figures"],
   ["European Central Bank held key interest rates steady as energy prices cloud inflation and growth outlook","policy-rate decision","asset-price"],
  ] as const;
  const tails:string[]=[];
  for(const [headline,subject,limit] of headlines){
   const story={...sample("macro"),title:"Geomacro finds "+headline,
    what_changed:"A monitored source feed reports: "+headline+". This report has not been independently verified.",
    topic:"macro economics",status:"osint_feed_observed_unverified" as const,
    development_type:"unverified OSINT feed observation",
    sources_credited:["Monitored feed: news.google.com (aggregator; original publisher not verified)"]};
   const analysis=concreteGeomacroAnalysis(story);
   expect(analysis).toContain("independently unverified");
   expect(analysis).toContain(subject);
   expect(analysis).toContain(limit);
   tails.push(analysis.split("”, ")[1]??"");
  }
  expect(new Set(tails).size).toBe(headlines.length);
  expect(tails.every(t=>!t.includes("affected indicator, economic channel and reporting period"))).toBe(true);
 });
 it("separates mineral access product, earnings, and copper output shortfall",()=>{
  const headlines=[
   ["Metals.io launched Copper, Unlocking Access to the Critical Metal at the Heart of Electrification","digital access","redemption"],
   ["Teck Resources reported higher copper and zinc prices help boost Q3 profit","copper and zinc","operating costs"],
   ["Glencore maintained guidance but quarterly copper output falls short","guidance-versus-output","actual period output"],
   ["European Union announced lithium export controls","shipment permissions","implementation date"],
  ] as const;
  const tails:string[]=[];
  for(const [headline,focus,limit] of headlines){
   const story={...sample("rare_earth"),title:"Geomacro finds "+headline,
    what_changed:"A monitored source feed reports: "+headline+". This report has not been independently verified.",
    topic:"critical minerals",status:"osint_feed_observed_unverified" as const,
    development_type:"unverified OSINT feed observation",
    sources_credited:["Monitored feed: news.google.com (aggregator; original publisher not verified)"]};
   const analysis=concreteGeomacroAnalysis(story);
   expect(analysis).toContain("independently unverified");
   expect(analysis).toContain(focus);
   expect(analysis).toContain(limit);
   tails.push(analysis.split("”, ")[1]??"");
  }
  expect(new Set(tails).size).toBe(headlines.length);
  expect(tails.every(t=>!t.includes("affected material, supply-chain stage and geography"))).toBe(true);
 });

});
