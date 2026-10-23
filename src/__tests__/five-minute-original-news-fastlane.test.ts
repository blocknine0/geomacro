import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {deriveStatelessSignals} from "../lib/stateless-intelligence-model";
import {GLOBAL_OFFICIAL_RELEASE_FEEDS} from "../../scripts/lib/global-official-release-feeds.mjs";
import {FIVE_MINUTE_NEWS_FASTLANE,FIVE_MINUTE_NEWS_FALLBACK,
 FASTLANE_MAX_FALLBACK_READS_PER_RUN,FASTLANE_MAX_PRIMARY_FEEDS_PER_RUN,decideFiveMinuteFallbackCategories,
 recentFastlaneReleaseCount,readFiveMinuteNewsFastlane} from "../lib/stateless-public-intelligence.server";

const read=(p:string)=>readFileSync(p,"utf8");
const CATS=["geopolitics","macro","rare_earth"];
describe("bounded five-minute FIRST-PARTY news fastlane",()=>{
 it("pins ten bounded official original feeds across three domains with global source reuse",async()=>{
   expect(FIVE_MINUTE_NEWS_FASTLANE).toHaveLength(10);
   expect(FASTLANE_MAX_PRIMARY_FEEDS_PER_RUN).toBe(10);
   expect(FIVE_MINUTE_NEWS_FASTLANE.map(x=>x.category)).toEqual([
     "geopolitics","geopolitics","geopolitics",
     "macro","macro","macro","macro",
     "rare_earth","rare_earth","rare_earth"]);
   expect(new Set(FIVE_MINUTE_NEWS_FASTLANE.map(x=>x.id)).size).toBe(10);
   expect(FIVE_MINUTE_NEWS_FASTLANE.map(x=>x.id)).toEqual([
     "un_news","uk_fcdo","un_press_global","fed_press","wto_trade_original_rss",
     "ecb_press","boc_press_global","nrcan_releases","us_doe_news_minerals",
     "bc_minerals_global"]);
   const collector=read("src/lib/stateless-public-intelligence.server.ts");
   expect(collector).toContain("officialSources.filter(s=>s.id===id && s.category===category)");
   expect(collector).toContain("FIVE_MINUTE_NEWS_FASTLANE.length>FASTLANE_MAX_PRIMARY_FEEDS_PER_RUN");
   for(const id of ["un_press_global","boc_press_global","bc_minerals_global"]){
     const entry=GLOBAL_OFFICIAL_RELEASE_FEEDS.find((x:{id:string})=>x.id===id);
     expect(entry?.production_update_reader).toBe(true);
     expect(entry?.format).toBe("rss");
     expect(entry?.url).toMatch(/^https:\/\//);
     expect(entry?.poll_minutes).toBe(30);
     expect(entry?.path).toBeInstanceOf(RegExp);
   }
   // UN Press + UN News are not two independent organizations; fastlane
   // transport is only original-source discovery, never corroboration.
   expect(collector).toContain("not independent");
   expect(collector).toContain("const officialSources=[...SOURCES,...GLOBAL_SOURCES]");
   expect(collector).toContain("const batches=await Promise.all(selected.map");
   expect(collector).toContain("deriveStatelessSignals(candidates,now,{maxSignals})");
   expect(collector).toContain("readSource(source,now)");
   expect(collector).not.toContain("publishDerivedStories(");
   await expect(readFiveMinuteNewsFastlane(NaN)).rejects.toThrow(
     "ORIGINAL_FASTLANE_CLOCK_OR_BUDGET_INVALID");
   await expect(readFiveMinuteNewsFastlane(Date.now(),100)).rejects.toThrow(
     "ORIGINAL_FASTLANE_CLOCK_OR_BUDGET_INVALID");
 });
 it("runs zero extra official requests for healthy primaries and one separately pinned origin for complete outage",()=>{
   expect(FIVE_MINUTE_NEWS_FALLBACK).toEqual([
     {category:"geopolitics",id:"canada_foreign_statements"},
     {category:"macro",id:"bis_press"},
     {category:"rare_earth",id:"uk_dbt"},
   ]);
   expect(FASTLANE_MAX_FALLBACK_READS_PER_RUN).toBe(3);
   expect(new Set(FIVE_MINUTE_NEWS_FALLBACK.map(x=>x.id)).size).toBe(3);
   expect(FIVE_MINUTE_NEWS_FALLBACK.every(x=>
     !FIVE_MINUTE_NEWS_FASTLANE.some(y=>y.category===x.category&&y.id===x.id))).toBe(true);
   const primary=FIVE_MINUTE_NEWS_FASTLANE.map(x=>({
     category:x.category,healthy:true,
   }));
   expect(decideFiveMinuteFallbackCategories(primary)).toEqual([]);
   // One failed origin is never treated as an entire category outage.
   primary[0].healthy=false;
   expect(decideFiveMinuteFallbackCategories(primary)).toEqual([]);
   primary[1].healthy=false;
   expect(decideFiveMinuteFallbackCategories(primary)).toEqual([]);
   primary[2].healthy=false; // UN Press is the third geopolitical primary.
   expect(decideFiveMinuteFallbackCategories(primary)).toEqual(["geopolitics"]);
   // Four macro and three mineral primaries must each ALL fail before the
   // single additional category fallback is permitted.
   for(let i=3;i<10;i++)primary[i].healthy=false;
   expect(decideFiveMinuteFallbackCategories(primary)).toEqual(CATS);
   expect(()=>decideFiveMinuteFallbackCategories([{category:"unapproved",healthy:true}]))
     .toThrow("ORIGINAL_FASTLANE_PRIMARY_HEALTH_INVALID");
   expect(()=>decideFiveMinuteFallbackCategories([{category:"macro",healthy:undefined as any}]))
     .toThrow("ORIGINAL_FASTLANE_PRIMARY_HEALTH_INVALID");
   const impl=read("src/lib/stateless-public-intelligence.server.ts");
   expect(impl).toContain("const fallbackCategories=decideFiveMinuteFallbackCategories(");
   expect(impl).toContain("fallbackSelected.length>FASTLANE_MAX_FALLBACK_READS_PER_RUN");
   expect(impl).toContain("SOURCES.filter(s=>s.id===entry.id&&s.category===entry.category)");
   expect(impl).toContain("const fallbackBatches=await Promise.all(");
   expect(impl).toContain("p.category===category?[fallbackBatches[i]]:[]");
 });
 it("leaves native original time and the 15-minute presentation embargo mandatory",()=>{
   const at=Date.parse("2026-10-20T12:00:00.000Z");
   const source={
     title:"Federal Reserve announces new sanctions on interest rates",
     articleUrl:"https://www.federalreserve.gov/newsevents/pressreleases/monetary20261020a.htm",
     publishedAt:new Date(at).toISOString(),sourceId:"fed_press",
     category:"macro" as const,credit:"Federal Reserve Board",
   };
   // Only a synthetic time-bound unit test, never a claimed actual release.
   const early=deriveStatelessSignals([source],at+14*60_000);
   expect(early).toEqual([]);
   const ontime=deriveStatelessSignals([source],at+16*60_000);
   expect(ontime).toHaveLength(1);
   for(const s of ontime){
     expect(s.same_event_corrob_verified).toBe(false);
     expect(s.severity).toBeNull();
     expect(s.published_at).toBe(source.publishedAt);
     expect(s.sources_credited).not.toEqual([]);
     expect(JSON.stringify(s)).not.toContain(source.articleUrl);
     expect(JSON.stringify(s)).not.toContain(source.title);
   }
 });
 it("schedules best-effort 5-minute existing-source publishing, never paid APIs or B2",()=>{
   const wf=read(".github/workflows/five-minute-original-news-fastlane.yml");
   const pub=read("scripts/ops/publish-original-news-five-minute-fastlane.ts");
   expect(wf).toContain('cron: "2-57/5 * * * *"');
   expect(wf).toContain("environment: production");
   expect(wf).toContain("cancel-in-progress: false");
   expect(wf).toContain("geomacro-five-minute-original-news-fastlane-");
   expect(wf).toContain("GEOMACRO_COMMERCE_LEDGER_TOKEN");
   expect(wf).not.toContain("COINBASE_X402_MAINNET_ACK");
   expect(wf).not.toContain("SUPABASE_URL");
   expect(wf).not.toContain("B2_KEY_ID");
   expect(pub).toContain("readFiveMinuteNewsFastlane(runAt,20,");
   expect(pub).toContain("reconcilePrivateDerivedSourceRefs");
   expect(wf).toContain('bun scripts/ops/persist-private-source-handoffs.ts');
   expect(pub).toContain('configured_categories:3,pinned_original_publishers:FIVE_MINUTE_NEWS_FASTLANE.length');
   expect(pub).toContain('FIVE_MINUTE_NEWS_FASTLANE.filter(s=>s.category===category).length');
   expect(pub).toContain("report.healthy_feed_count<1");
   expect(pub).toContain("report.feed_count>expectedOrigins+1");
   expect(pub).toContain("conditional_fallback_attempted:report.feed_count>expectedOrigins");
   expect(pub).toContain("fallback_for_primary_outage_or_no_recent_release:true");
   expect(pub).toContain("const baseline=await fetchAllDerivedNews(fetch,runAt)");
   expect(pub).toContain("!existingIds.has(s.id)");
   expect(pub).toContain("fetchAllDerivedNews(fetch,Date.now())");
   expect(pub).toContain("exact_first_writer_attribution_verified:false");
   expect(pub).toContain("measurement_is_true_first_insert_utc:false");
   expect(pub).toContain("FASTLANE_D1_FULL_JOURNAL_READBACK_FAILED");
   expect(pub).toContain("original_exact_publications_verified");
   expect(pub).toContain("exact_publications_outside_target_at_d1_readback");
   expect(pub).toContain('latency_objective_minutes:20');
   expect(pub).toContain('github_schedule_guaranteed:false');
   expect(pub).toContain('source_portfolio_exhaustive_195x3:false');
   expect(pub).toContain('raw_upstream_delivered:false');
   expect(pub).toContain('b2_requests:0,supabase_requests:0');
   expect(pub).toContain('x402_charges:0');
   expect(pub).not.toContain("COINBASE_X402_MAINNET_ACK");
   expect(pub).not.toContain("RISK_OBJECT_SIGNING_PRIVATE_KEY");
   expect(pub).not.toContain("https://api.gdeltproject.org");
 });
 it("tries one alternative when reachable primary feeds contain no recent qualifying release",()=>{
   const primary=FIVE_MINUTE_NEWS_FASTLANE.map(x=>({category:x.category,healthy:true,recent_releases:0}));
   expect(decideFiveMinuteFallbackCategories(primary)).toEqual(CATS);
   primary.find(x=>x.category==="macro")!.recent_releases=1;
   expect(decideFiveMinuteFallbackCategories(primary)).toEqual(["geopolitics","rare_earth"]);
   expect(()=>decideFiveMinuteFallbackCategories([{category:"macro",healthy:true,recent_releases:-1}])).toThrow();
   expect(()=>decideFiveMinuteFallbackCategories([{category:"macro",healthy:true,recent_releases:NaN}])).toThrow();
 });
 it("counts source-native exact releases only after the existing 15-minute delay",()=>{
   const now=Date.parse("2026-10-23T12:00:00Z");
   const source={title:"Federal Reserve announces monetary policy interest rates",
     articleUrl:"https://www.federalreserve.gov/newsevents/pressreleases/monetary20261023a.htm",
     publishedAt:new Date(now-20*60_000).toISOString(),sourceId:"fed_press",
     category:"macro" as const,credit:"Federal Reserve Board"};
   expect(recentFastlaneReleaseCount([source],now)).toBe(1);
   for(const age of [-60_000,14*60_000,61*60_000])
     expect(recentFastlaneReleaseCount([{...source,publishedAt:new Date(now-age).toISOString()}],now)).toBe(0);
   expect(recentFastlaneReleaseCount([{...source,datePrecision:"day" as const,publishedAt:"2026-10-23T00:00:00Z"}],now)).toBe(0);
 });
 it("recovers a quiet category through the real bounded collector without a polling cascade",async()=>{
   const now=Date.parse("2026-10-23T12:00:00Z"),reads:string[]=[];
   const reports=await readFiveMinuteNewsFastlane(now,20,undefined,{readPinnedSource:async source=>{
     reads.push(source.id);
     return {healthy:true,candidates:source.id==="bis_press"?[{
       title:"Bank for International Settlements announces monetary policy interest rates",
       articleUrl:"https://www.bis.org/press/p261023.htm",publishedAt:new Date(now-20*60_000).toISOString(),
       sourceId:source.id,category:"macro",credit:source.credit,
     }]:[]};
   }});
   expect(reads).toHaveLength(13);
   expect(new Set(reads).size).toBe(13);
   const macro=reports.find(r=>r.category==="macro")!;
   expect(macro.signals).toHaveLength(1);
   expect(macro.primary_healthy_feed_count).toBe(4);
   expect(macro.healthy_feed_count).toBe(5);
   expect(macro.fallback_reason).toBe("NO_RECENT_QUALIFYING_PRIMARY_RELEASE");
   expect(macro.signals[0].published_at).toBe(new Date(now-20*60_000).toISOString());
   expect(JSON.stringify(reports)).not.toContain("https://");
 });
 it("retains truthful healthy-but-quiet status when the bounded alternative also fails",async()=>{
   const reads:string[]=[];
   const fallbackIds=new Set(FIVE_MINUTE_NEWS_FALLBACK.map(x=>x.id));
   const reports=await readFiveMinuteNewsFastlane(Date.parse("2026-10-23T12:00:00Z"),20,undefined,
     {readPinnedSource:async source=>{
       reads.push(source.id);
       if(fallbackIds.has(source.id as any))throw Error("SYNTHETIC_PROVIDER_UNAVAILABLE");
       return {healthy:true,candidates:[]};
     }});
   expect(reads).toHaveLength(13);
   expect(reports.every(r=>r.status==="no_eligible_original_releases"&&r.signals.length===0)).toBe(true);
   expect(reports.every(r=>r.healthy_feed_count===r.primary_healthy_feed_count)).toBe(true);
   expect(reports.every(r=>r.fallback_reason==="NO_RECENT_QUALIFYING_PRIMARY_RELEASE")).toBe(true);
 });
});
