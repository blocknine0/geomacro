import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {deriveStatelessSignals} from "../lib/stateless-intelligence-model";
import {FIVE_MINUTE_NEWS_FASTLANE,FIVE_MINUTE_NEWS_FALLBACK,
 FASTLANE_MAX_FALLBACK_READS_PER_RUN,decideFiveMinuteFallbackCategories,
 readFiveMinuteNewsFastlane} from "../lib/stateless-public-intelligence.server";

const read=(p:string)=>readFileSync(p,"utf8");
const CATS=["geopolitics","macro","rare_earth"];
describe("bounded five-minute FIRST-PARTY news fastlane",()=>{
 it("pins seven source-governed original publishers across three domains with ECB WTO UK DOE",async()=>{
   expect(FIVE_MINUTE_NEWS_FASTLANE).toHaveLength(7);
   expect(FIVE_MINUTE_NEWS_FASTLANE.map(x=>x.category)).toEqual(["geopolitics","geopolitics","macro","macro","macro","rare_earth","rare_earth"]);
   expect(new Set(FIVE_MINUTE_NEWS_FASTLANE.map(x=>x.id)).size).toBe(7);
   expect(FIVE_MINUTE_NEWS_FASTLANE.map(x=>x.id)).toEqual([
     "un_news","uk_fcdo","fed_press","wto_trade_original_rss",
     "ecb_press","nrcan_releases","us_doe_news_minerals"]);
   const collector=read("src/lib/stateless-public-intelligence.server.ts");
   expect(collector).toContain("SOURCES.filter(s=>s.id===id && s.category===category)");
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
   expect(decideFiveMinuteFallbackCategories(primary)).toEqual(["geopolitics"]);
   primary[2].healthy=false;
   primary[3].healthy=false;
   primary[4].healthy=false;
   primary[5].healthy=false;
   primary[6].healthy=false;
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
   expect(pub).toContain("readFiveMinuteNewsFastlane(runAt,20)");
   expect(pub).toContain('configured_categories:3,pinned_original_publishers:FIVE_MINUTE_NEWS_FASTLANE.length');
   expect(pub).toContain('FIVE_MINUTE_NEWS_FASTLANE.filter(s=>s.category===category).length');
   expect(pub).toContain("report.healthy_feed_count<1");
   expect(pub).toContain("report.feed_count>expectedOrigins+1");
   expect(pub).toContain("conditional_fallback_attempted:report.feed_count>expectedOrigins");
   expect(pub).toContain("fallback_only_for_complete_primary_category_outage:true");
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
});
