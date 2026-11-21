import {describe,it,expect,vi} from "vitest";
import {readFileSync} from "node:fs";
import {collectSharedOfficialNews} from "../lib/ask-shared-derived-journal.server";
import {GEOMACRO_DERIVED_JOURNAL_URL,GEOMACRO_RISK_STREAM_PUBLIC_TEASERS_URL} from "../lib/public-derived-news-client";
import {readWebsiteDerivedNews} from "../lib/website-derived-news-reader.server";
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
   expect(src).toContain('const [originalResult,derivedResult,indexedResult]=await Promise.allSettled([');
   expect(src).toContain('boundedAskAdapter("current_originals"');
   expect(src).toContain('boundedAskAdapter("derived_intelligence"');
   expect(src).toContain('boundedAskAdapter("indexed_discovery"');
   const helper=readFileSync("src/lib/ask-shared-derived-journal.server.ts","utf8");
   expect(helper).toContain("sources_credited.length===0");
   expect(helper).not.toContain("settleCoinbaseX402");
 });
 it("routes 47 score-free public D1 GRO teasers through Website Intelligence and Ask",async()=>{
   const liveNow=Date.now()+120_000,liveAt=new Date(liveNow-75*60_000).toISOString();
   const countries=["USA","CHN","IND","RUS","GBR","DEU","FRA","JPN","KOR","BEL",
     "CAN","AUS","BRA","MEX","ITA","ESP","NLD","CHE","NOR","SWE",
     "POL","UKR","TUR","SAU","ARE","IRN","ISR","EGY","QAT","OMN",
     "IRQ","ZAF","NGA","COD","ZMB","CHL","PER","ARG","BOL","IDN",
     "VNM","THA","MYS","SGP","PHL","PAK","BGD"] as const;
   const categories=["geopolitics","macro","rare_earth"] as const;
   const topics=["foreign policy","monetary policy","rare-earth supply"] as const;
   const teasers=countries.map((country,i)=>({
     id:`${categories[i%3]}-${(i+1).toString(16).padStart(8,"0")}`,
     title:`Geomacro finds an official event signal for ${country}`,
     what_changed:"A signed event record describes a recent country-level policy or supply development.",
     why_it_matters:"Risk mechanism: policy and operating assumptions may change. Downstream effects: review exposed activity.",
     topic:topics[i%3],geography:country,
     development_type:"official update",published_at:liveAt,date_precision:"exact",
     observed_release_count:1,sources_credited:[],
     status:"official_release_observed_unscored",same_event_corrob_verified:false,severity:null,
   }));
   const fetchImpl=vi.fn(async(input:RequestInfo|URL)=>{
     const url=String(input);
     if(url===GEOMACRO_DERIVED_JOURNAL_URL)return new Response(JSON.stringify({
       ok:true,schema:"geomacro.website-derived-news-feed.v1",
       checked_at:new Date(liveNow).toISOString(),original_release_delay_minutes:0,
       retention_days:3,retention_hours:72,delivery_scope:"free_website_only",
       page_offset:0,page_size:250,has_more:false,next_offset:null,signals:[],
     }),{status:200,headers:{"Content-Type":"application/json"}});
     if(url===GEOMACRO_RISK_STREAM_PUBLIC_TEASERS_URL)return new Response(JSON.stringify({
       ok:true,schema:"geomacro.risk-stream-public-teasers.v1",
       checked_at:new Date(liveNow).toISOString(),retention_hours:24,limit:120,
       score_free:true,source_redacted:true,signals:teasers,
     }),{status:200,headers:{"Content-Type":"application/json"}});
     throw Error("unexpected public URL");
   }) as unknown as typeof fetch;
   const dateNow=vi.spyOn(Date,"now").mockReturnValue(liveNow);
   vi.stubGlobal("fetch",fetchImpl);
   try{
   const website=await readWebsiteDerivedNews(undefined,liveNow);
   expect(website.signals).toHaveLength(47);
   expect(new Set(website.signals.map(s=>s.geography)).size).toBe(47);
   expect(website.signals.every(s=>/^(?:geopolitics|macro|rare_earth)-[0-9a-f]{8}$/u.test(s.id))).toBe(true);
   expect(website.signals.every(s=>s.title.startsWith("Geomacro finds ")&&s.title.length>=24&&s.title.length<=240)).toBe(true);
   expect(website.signals.every(s=>s.what_changed.length>=25&&s.why_it_matters.length>=25&&
     !/(?:https?:\/\/|www\.|[<>])/iu.test(s.what_changed+s.why_it_matters))).toBe(true);
   expect(website.signals.every(s=>s.sources_credited.length===0)).toBe(true);
   const ask=await collectSharedOfficialNews(categories,{now:liveNow,
     readLive:async()=>({signals:[]}),
   });
   expect(ask.signals).toHaveLength(47);
   expect(new Set(ask.signals.map(s=>s.geography)).size).toBe(47);
   expect(ask.signals.every(s=>s.sources_credited.length===0)).toBe(true);
   for(const signal of [...website.signals,...ask.signals]){
     expect(Object.keys(signal).sort()).toEqual([
       "category","date_precision","development_type","geography","id",
       "observed_release_count","published_at","same_event_corrob_verified","severity",
       "sources_credited","status","title","topic","what_changed","why_it_matters",
     ]);
     expect(JSON.stringify(signal)).not.toMatch(/risk_score_0_100|value_0_100|agent_decision|source_originals|signature_b64|https?:\/\/|www\./iu);
   }
   const api=readFileSync("server/api/public/intelligence.get.ts","utf8");
   expect(api).toContain("readWebsiteDerivedNews()");
   }finally{vi.unstubAllGlobals();dateNow.mockRestore()}
 });
});
