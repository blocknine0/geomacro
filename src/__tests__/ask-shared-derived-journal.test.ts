import {describe,it,expect,vi} from "vitest";
import {readFileSync} from "node:fs";
import {collectSharedOfficialNews} from "../lib/ask-shared-derived-journal.server";
import type {StatelessIntelligenceSignal,StatelessCategory} from "../lib/stateless-intelligence-model";
const now=Date.parse("2026-10-19T11:00:00.000Z");
const at=new Date(now-75*60_000).toISOString();
const cat=["geopolitics","macro","rare_earth"] as const;
const topic=["foreign policy","trade and economic relations","rare-earth supply"] as const;
const item=(i:number,credited=false):StatelessIntelligenceSignal=>({
 id:cat[i]+"-"+(i+1).toString(16).padStart(8,"0"),
 category:cat[i],
 title:"Geomacro finds relevant original official policy release observed",
 topic:topic[i],geography:null,
 development_type:"official policy release",
 published_at:at,date_precision:"exact",
 what_changed:"An issuer original publication was observed with the date independently parsed.",
 why_it_matters:"The development may inform structural conditions, not a numerical or signed risk claim.",
 observed_release_count:1,sources_credited:credited?["Must attribute"]:[],
 status:"official_release_observed_unscored",same_event_corrob_verified:false,
 severity:null,
});
describe("Ask reuses D1 official observations across all three categories",()=>{
 it("answers with one canonical journal read and zero repeat upstream source requests",async()=>{
   const readJournal=vi.fn(async()=>[item(0),item(1),item(2)]);
   const readLive=vi.fn(async()=>({signals:[]}));
   const result=await collectSharedOfficialNews(cat,{now,readJournal,readLive});
   expect(result.signals.map(x=>x.category)).toEqual([...cat]);
   expect(result.journal_categories_reused).toEqual([...cat]);
   expect(result.live_categories_queried).toEqual([]);
   expect(readJournal).toHaveBeenCalledOnce();
   expect(readLive).not.toHaveBeenCalled();
   expect(result.signals.every(x=>x.same_event_corrob_verified===false)).toBe(true);
 });
 it("checks only the missing category when D1 covers the other two",async()=>{
   const readLive=vi.fn(async(c:StatelessCategory)=>({
     signals:c==="rare_earth"?[item(2)]:[],
   }));
   const result=await collectSharedOfficialNews(cat,{
     now,readJournal:async()=>[item(0),item(1)],readLive,
   });
   expect(result.signals).toHaveLength(3);
   expect(result.live_categories_queried).toEqual(["rare_earth"]);
   expect(readLive).toHaveBeenCalledTimes(1);
   expect(readLive).toHaveBeenCalledWith("rare_earth");
 });
 it("does not suppress a proper live check on journal failure or attribution-only rows",async()=>{
   const readLive=vi.fn(async(c:StatelessCategory)=>({
     signals:c==="macro"?[item(1)]:[],
   }));
   const result=await collectSharedOfficialNews(["macro"],{
     now,readJournal:async()=>[item(1,true)],readLive,
   });
   expect(result.journal_categories_reused).toEqual([]);
   expect(result.live_categories_queried).toEqual(["macro"]);
   expect(result.signals).toHaveLength(1);
   const outage=await collectSharedOfficialNews(["macro"],{
     now,readJournal:async()=>{throw Error("D1 down")},
     readLive,
   });
   expect(outage.live_categories_queried).toEqual(["macro"]);
   expect(outage.signals).toHaveLength(1);
 });
 it("drops forged and stale journal evidence without false freshness",async()=>{
   const future={...item(0),published_at:new Date(now+3600_000).toISOString()};
   const forged={...item(0),same_event_corrob_verified:true};
   const rows=await collectSharedOfficialNews(["geopolitics"],{
     now,readJournal:async()=>[future,forged],
     readLive:async()=>({signals:[]}),
   });
   expect(rows.signals).toEqual([]);
   expect(rows.live_categories_queried).toEqual(["geopolitics"]);
 });
 it("keeps numeric, paid and risk routes separate from free journal selection",()=>{
   const src=readFileSync("src/lib/ask-answer.server.ts","utf8");
   expect(src).toContain("if (planAskOfficialNumeric(question))");
   expect(src).toContain("answerFromCurrentOriginals(question)");
   expect(src).toContain("collectSharedOfficialNews(categories)");
   expect(src).toContain("answerHybridQuestion(question)");
   expect(src.indexOf("collectSharedOfficialNews(categories)"))
     .toBeLessThan(src.indexOf("answerFromCurrentOriginals(question)"));
   expect(src.indexOf("answerFromCurrentOriginals(question)"))
     .toBeLessThan(src.indexOf("const primary = await answerHybridQuestion(question)"));
   const helper=readFileSync("src/lib/ask-shared-derived-journal.server.ts","utf8");
   expect(helper).toContain("sources_credited.length===0");
   expect(helper).not.toContain("settleCoinbaseX402");
 });
});
