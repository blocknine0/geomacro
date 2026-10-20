import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {deriveStatelessSignals} from "../lib/stateless-intelligence-model";
import {FIVE_MINUTE_NEWS_FASTLANE,readFiveMinuteNewsFastlane} from "../lib/stateless-public-intelligence.server";

const read=(p:string)=>readFileSync(p,"utf8");
const CATS=["geopolitics","macro","rare_earth"];
describe("bounded five-minute FIRST-PARTY news fastlane",()=>{
 it("pins four original publishers in three domains, including second Macro WTO origin",async()=>{
   expect(FIVE_MINUTE_NEWS_FASTLANE).toHaveLength(4);
   expect(FIVE_MINUTE_NEWS_FASTLANE.map(x=>x.category)).toEqual(["geopolitics","macro","macro","rare_earth"]);
   expect(new Set(FIVE_MINUTE_NEWS_FASTLANE.map(x=>x.id)).size).toBe(4);
   expect(FIVE_MINUTE_NEWS_FASTLANE.map(x=>x.id)).toEqual([
     "un_news","fed_press","wto_trade_original_rss","nrcan_releases"]);
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
   expect(wf).toContain('cron: "4-59/5 * * * *"');
   expect(wf).toContain("environment: production");
   expect(wf).toContain("cancel-in-progress: false");
   expect(wf).toContain("geomacro-five-minute-original-news-fastlane-");
   expect(wf).toContain("GEOMACRO_COMMERCE_LEDGER_TOKEN");
   expect(wf).not.toContain("COINBASE_X402_MAINNET_ACK");
   expect(wf).not.toContain("SUPABASE_URL");
   expect(wf).not.toContain("B2_KEY_ID");
   expect(pub).toContain("readFiveMinuteNewsFastlane(runAt,20)");
   expect(pub).toContain('configured_categories:3,pinned_original_publishers:4');
   expect(pub).toContain('category==="macro"?2:1');
   expect(pub).toContain("report.healthy_feed_count<1");
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
