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
 it("admits only concrete three-domain source-reported findings and rejects generic placeholders",()=>{
  const concreteByCategory={
   geopolitics:{topic:"Maritime Transit & Freight",geography:"Red Sea Maritime Corridor",
    title:"Geomacro finds Maritime Transit & Freight · Transit Controls — Red Sea Maritime Corridor",
    what_changed:"Unverified feed observation: Yemen Ministry of Transport introduced tanker transit controls.",
    why_it_matters:"Risk: transit controls may affect shipping exposure. Effect: vessel routes and cargo insurance planning may change if confirmed. Price channel to monitor: freight and marine insurance rates. Action Posture: REQUIRE_APPROVAL; no price move is asserted."},
   macro:{topic:"Monetary Policy & FX Liquidity",geography:"Japan",
    title:"Geomacro finds Monetary Policy & FX Liquidity · Policy Rate Decision — Japan",
    what_changed:"Unverified feed observation: Bank of Japan announced its policy-rate decision.",
    why_it_matters:"Risk: policy decisions can shift currency differentials. Effect: import settlement and hedging may need review if confirmed. Price channel to monitor: USD/JPY. Action Posture: REQUIRE_APPROVAL; no price move is asserted."},
   rare_earth:{topic:"Copper Supply & Processing",geography:"Chile",
    title:"Geomacro finds Copper Supply & Processing · Processing Project Approval — Chile",
    what_changed:"Unverified feed observation: Chile's mining authority approved a copper processing project.",
    why_it_matters:"Risk: processing capacity may change copper supply options. Effect: buyer sourcing and concentrate conversion plans may need review if confirmed. Price channel to monitor: COMEX copper benchmark. Action Posture: REQUIRE_APPROVAL; no price move is asserted."},
  } as const;
  for(const category of ["geopolitics","macro","rare_earth"] as const){
    const basis=sample(category);
    const report={...basis,status:"osint_feed_observed_unverified" as const,
      development_type:"unverified OSINT feed observation",date_precision:"exact" as const,
      sources_credited:["Monitored feed: news.google.com (aggregator; original publisher not verified)"],
      ...concreteByCategory[category]};
    expect(isConcretePublicIntelligence(report),category).toBe(true);
    expect(concreteIntelligenceHeadline(report)).toBe(concreteByCategory[category].title.replace(/^Geomacro finds /u,""));
    expect(report.what_changed).not.toContain(basis.title.replace(/^Geomacro finds /u,""));
    expect(concreteGeomacroAnalysis(report)).not.toContain(basis.title.replace(/^Geomacro finds /u,""));
    const legacyTitle={...report,
      title:`Geomacro finds an unverified ${category} watch signal`};
    expect(isConcretePublicIntelligence(legacyTitle)).toBe(false);
    const restrictedCredit={...report,sources_credited:["Monitored feed: news.un.org"]};
    expect(isConcretePublicIntelligence(restrictedCredit)).toBe(true);
    expect(concreteIntelligenceHeadline(restrictedCredit)).toBe(concreteByCategory[category].title.replace(/^Geomacro finds /u,""));
    expect(JSON.stringify(concreteGeomacroAnalysis(restrictedCredit))).not.toContain("news.un.org");
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

 it("keeps source-neutral OSINT copy independent of restricted headlines",()=>{
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
   expect(isConcretePublicIntelligence(msf)).toBe(false);
   expect(isConcretePublicIntelligence(brazil)).toBe(false);
   expect(concreteIntelligenceHeadline(msf)).not.toContain("unverified geopolitical watch signal");
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

 it("rejects unstructured macro OSINT prose instead of inventing public intelligence",()=>{
  const headlines=[
   ["Mahama said Ghana is in talks with Russia over first nuclear power station","power-infrastructure","commissioning"],
   ["PM approved expansion of Jinnah and Allama Iqbal airports, eyes making Karachi air cargo hub","freight capacity","cargo handling"],
   ["Herculis Tokens SA announced XAUH Gold-Backed Token Offering With Swiss Bullion Reserves and Multi-Chain Access","reserve backing","central-bank reserve"],
   ["Sterling Financial reported 37.1% growth in nine-month profit before tax to 97.28bn","firm-level profitability","comparable figures"],
   ["European Central Bank held key interest rates steady as energy prices cloud inflation and growth outlook","policy-rate decision","asset-price"],
  ] as const;
  for(const [headline,subject,limit] of headlines){
   const story={...sample("macro"),title:"Geomacro finds "+headline,
    what_changed:"A monitored source feed reports: "+headline+". This report has not been independently verified.",
    topic:"macro economics",status:"osint_feed_observed_unverified" as const,
    development_type:"unverified OSINT feed observation",
    sources_credited:["Monitored feed: news.google.com (aggregator; original publisher not verified)"]};
   expect(isConcretePublicIntelligence(story)).toBe(false);
   expect(concreteIntelligenceHeadline(story)).not.toContain("unverified macro watch signal");
  }
 });
 it("rejects unstructured minerals OSINT prose instead of inventing public intelligence",()=>{
  const headlines=[
   ["Metals.io launched Copper, Unlocking Access to the Critical Metal at the Heart of Electrification","digital access","redemption"],
   ["Teck Resources reported higher copper and zinc prices help boost Q3 profit","copper and zinc","operating costs"],
   ["Glencore maintained guidance but quarterly copper output falls short","guidance-versus-output","actual period output"],
   ["European Union announced lithium export controls","shipment permissions","implementation date"],
  ] as const;
  for(const [headline,focus,limit] of headlines){
   const story={...sample("rare_earth"),title:"Geomacro finds "+headline,
    what_changed:"A monitored source feed reports: "+headline+". This report has not been independently verified.",
    topic:"critical minerals",status:"osint_feed_observed_unverified" as const,
    development_type:"unverified OSINT feed observation",
    sources_credited:["Monitored feed: news.google.com (aggregator; original publisher not verified)"]};
   expect(isConcretePublicIntelligence(story)).toBe(false);
   expect(concreteIntelligenceHeadline(story)).not.toContain("unverified critical-minerals watch signal");
  }
 });

});
