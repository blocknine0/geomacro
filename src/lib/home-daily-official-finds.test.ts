import {describe,it,expect} from "vitest";
import {parseDailyOfficialFinds,selectDailyOfficialFinds,selectDailyUnverifiedObservations} from "./home-daily-official-finds";
import type {StatelessIntelligenceSignal} from "./stateless-intelligence-model";
const NOW=Date.parse("2026-11-01T17:00:00.000Z");
const official=(category:StatelessIntelligenceSignal["category"],id:string,day:string):StatelessIntelligenceSignal=>({
 id,category,title:"Geomacro finds Federal Reserve issued FOMC statement on inflation and interest rates",
 what_changed:"Federal Reserve issued FOMC statement on inflation and interest rates. The change is not quantified in this release.",
 why_it_matters:"Central bank decisions can affect borrowing costs and currency exposures; direction is not inferred.",
 topic:"monetary policy",geography:null,development_type:"monetary policy",
 published_at:day,date_precision:day.includes("T")?"exact":"day",
 observed_release_count:1,sources_credited:["Federal Reserve Board"],
 status:"official_release_observed_unscored",same_event_corrob_verified:false,severity:null
});
const doc=(signals:unknown[])=>({
 ok:true,schema:"geomacro.public-daily-official-finds.v1",generated_at:"2026-11-01T12:00:00.000Z",
 selection_window_days:30,source_window:"archived_original_release",
 official_only:true,independently_corrob_verified:false,chargeable:false,
 scored:false,source_urls_returned:false,mandatory_source_credits_preserved:true,signals
});
describe("official daily highlights in the homepage",()=>{
 it("disallows invalid envelopes or unverified promotion",()=>{
   expect(()=>parseDailyOfficialFinds({...doc([]),chargeable:true},NOW)).toThrow();
   expect(parseDailyOfficialFinds(doc([{...official("macro","macro-12345678","2026-10-30"),status:"osint_feed_observed_unverified"}]),NOW)).toEqual([]);
 });
 it("retains original date and mandatory credits",()=>{
   const input=official("macro","macro-12345678","2026-10-29");
   const result=selectDailyOfficialFinds([input],NOW);
   expect(result).toHaveLength(1);
   expect(result[0].originalAt).toBe("2026-10-29T00:00:00.000Z");
   expect(result[0].isCurrent).toBe(false);
   expect(result[0].signal.sources_credited).toEqual(["Federal Reserve Board"]);
   expect(result[0].headline).toContain("Federal Reserve");
 });
 it("only changes with genuine eligible original observations and rejects dates not elapsed",()=>{
   const old=official("macro","macro-12345678","2026-10-29");
   const newRelease=official("geopolitics","geopolitics-12345678","2026-11-01T14:00:00.000Z");
   expect(selectDailyOfficialFinds([old],NOW).length).toBe(1);
   expect(selectDailyOfficialFinds([old,newRelease],NOW).length).toBe(2);
   expect(selectDailyOfficialFinds([official("macro","macro-abcdef12","2026-11-01")],NOW)).toEqual([]);
 });
});

describe("explicitly unverified recent OSINT homepage lane",()=>{
const observation=(category:StatelessIntelligenceSignal["category"],id:string,title:string):StatelessIntelligenceSignal=>{
 const base=official(category,id,"2026-11-01T15:00:00.000Z");
 const validTitle=category==="geopolitics"?"UN announced new humanitarian agreement for refugees"
  :category==="macro"?"Federal Reserve announced an interest rate decision"
  :"Canada approved new lithium mine funding";
 const facts=title===validTitle?(category==="geopolitics"?{
  title:"Geomacro finds Maritime Transit & Freight · Reported Policy or Operating Action — Red Sea Maritime Corridor",
  what_changed:"Unverified feed observation: Yemen Ministry of Transport introduced Red Sea tanker transit controls.",
  why_it_matters:"Risk: reported policy or operating action affecting maritime transit & freight in Red Sea Maritime Corridor. Effect: vessel transit, port access and cargo insurance planning may need review for Red Sea Maritime Corridor if the report is confirmed. Price channel to monitor: freight and marine insurance rates. Action Posture: REQUIRE_APPROVAL; no independent corroboration or price move is asserted.",
  topic:"Maritime Transit & Freight",geography:"Red Sea Maritime Corridor",
 }:{
  title:category==="macro"?"Geomacro finds Monetary Policy & FX Liquidity · Reported Policy or Operating Action — Japan":"Geomacro finds Copper Supply & Processing · Approval or Authorization — Canada",
  what_changed:category==="macro"?"Unverified feed observation: Bank of Japan announced a change to its policy rate guidance for Japan.":"Unverified feed observation: Canada's Ministry of Mines approved a copper processing project.",
  why_it_matters:category==="macro"?"Risk: reported policy or operating action affecting monetary policy & fx liquidity in Japan. Effect: import settlement, funding costs and local-currency hedging may need review for Japan if the report is confirmed. Price channel to monitor: USD/JPY. Action Posture: REQUIRE_APPROVAL; no independent corroboration or price move is asserted.":"Risk: approval or authorization affecting copper supply & processing in Canada. Effect: buyers and processors may need to recheck copper supply & processing delivery timing, eligible suppliers and conversion capacity linked to Canada if the report is confirmed. Price channel to monitor: COMEX copper benchmark; concentrate treatment charges. Action Posture: REQUIRE_APPROVAL; no independent corroboration or price move is asserted.",
  topic:category==="macro"?"Monetary Policy & FX Liquidity":"Copper Supply & Processing",
  geography:category==="macro"?"Japan":"Canada",
 }):null;
 return {...base,...(facts??{}),id,category,
  development_type:"unverified OSINT feed observation",date_precision:"exact",
  published_at:"2026-11-01T15:00:00.000Z",observed_release_count:1,
  status:"osint_feed_observed_unverified",sources_credited:["Monitored feed: example.org"],
  same_event_corrob_verified:false,severity:null};
};
 it("shows native-dated explicit observations without promoting into official",()=>{
  const rows=[
   observation("geopolitics","geopolitics-23456789","UN announced new humanitarian agreement for refugees"),
   observation("macro","macro-23456789","Federal Reserve announced an interest rate decision"),
   observation("rare_earth","rare_earth-23456789","Canada approved new lithium mine funding")
  ];
  const a=selectDailyUnverifiedObservations(rows,NOW,4);
  expect(a).toHaveLength(3);
  expect(a.map(x=>x.signal.category).sort()).toEqual(["geopolitics","macro","rare_earth"]);
  expect(a.every(x=>x.signal.status==="osint_feed_observed_unverified")).toBe(true);
  expect(a.every(x=>x.originalAt==="2026-11-01T15:00:00.000Z")).toBe(true);
  expect(selectDailyOfficialFinds(rows,NOW)).toEqual([]);
 });
 it("rejects energy-only minerals, future observations and unrecognized feed credit",()=>{
  const a=observation("rare_earth","rare_earth-12345678","Russia announced oil refinery strike");
  const b=observation("macro","macro-12345678","Federal Reserve announced interest-rate decision");
  const c={...b,published_at:"2026-11-03T15:00:00.000Z"};
  const d={...b,id:"macro-abcdefab",sources_credited:["https://example.org/private"]};
  expect(selectDailyUnverifiedObservations([a,c,d],NOW)).toEqual([]);
 });
});
