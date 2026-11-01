import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {deriveStatelessSignals} from "../lib/stateless-intelligence-model";
import {GLOBAL_OFFICIAL_RELEASE_FEEDS} from "../../scripts/lib/global-official-release-feeds.mjs";
import {FIVE_MINUTE_NEWS_FASTLANE,FIVE_MINUTE_NEWS_FALLBACK,
 FASTLANE_MAX_FALLBACK_READS_PER_RUN,FASTLANE_MAX_PRIMARY_FEEDS_PER_RUN,decideFiveMinuteFallbackCategories,
 recentFastlaneReleaseCount,selectFiveMinuteFallback,FIVE_MINUTE_NEWS_FALLBACK_ROTATION,
 readFiveMinuteNewsFastlane} from "../lib/stateless-public-intelligence.server";

const read=(p:string)=>readFileSync(p,"utf8");
const CATS=["geopolitics","macro","rare_earth"];
describe("bounded five-minute FIRST-PARTY news fastlane",()=>{
 it("pins sixteen bounded official original release feeds across three domains",async()=>{
   expect(FIVE_MINUTE_NEWS_FASTLANE).toHaveLength(16);
   expect(FASTLANE_MAX_PRIMARY_FEEDS_PER_RUN).toBe(16);
   expect(FIVE_MINUTE_NEWS_FASTLANE.map(x=>x.category)).toEqual([
     "geopolitics","geopolitics","geopolitics","geopolitics","geopolitics",
     "macro","macro","macro","macro","macro","macro",
     "rare_earth","rare_earth","rare_earth","rare_earth","rare_earth"]);
   expect(new Set(FIVE_MINUTE_NEWS_FASTLANE.map(x=>x.id)).size).toBe(16);
   expect(FIVE_MINUTE_NEWS_FASTLANE.map(x=>x.id)).toEqual([
     "un_news","uk_fcdo","un_press_global","eu_council_press_original","canada_foreign_statements",
     "fed_press","wto_trade_original_rss","ecb_press","boc_press_global",
     "bis_press","govuk_global_economy",
     "nrcan_releases","us_doe_news_minerals","bc_minerals_global",
     "uk_dbt","govuk_global_minerals"]);
   const collector=read("src/lib/stateless-public-intelligence.server.ts");
   expect(collector).toContain("officialSources.filter(s=>s.id===id && s.category===category)");
   expect(collector).toContain("FIVE_MINUTE_NEWS_FASTLANE.length>FASTLANE_MAX_PRIMARY_FEEDS_PER_RUN");
   // Each selected entry must resolve to an exact existing issuer reader.
   // No syndicated/third-party news or paid feed endpoint is introduced.
   expect(FIVE_MINUTE_NEWS_FASTLANE.filter(x=>x.id.startsWith("nz_beehive_"))).toHaveLength(0);
   expect(FIVE_MINUTE_NEWS_FASTLANE.some(x=>x.id==="canada_foreign_statements")).toBe(true);
   expect(FIVE_MINUTE_NEWS_FASTLANE.some(x=>x.id==="bis_press")).toBe(true);
   expect(FIVE_MINUTE_NEWS_FASTLANE.some(x=>x.id==="uk_dbt")).toBe(true);
   expect(FIVE_MINUTE_NEWS_FASTLANE.some(x=>x.id==="eu_council_press_original")).toBe(true);
   expect(FIVE_MINUTE_NEWS_FASTLANE.some(x=>x.id==="govuk_global_minerals")).toBe(true);
   expect(FIVE_MINUTE_NEWS_FASTLANE.some(x=>x.id==="govuk_global_economy")).toBe(true);
   expect(collector).toContain("readGovContentOriginalDate");
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
     {category:"geopolitics",id:"ungeneva_press_global"},
     {category:"macro",id:"boj_press_global"},
     {category:"rare_earth",id:"iea_minerals_global"},
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
   primary[2].healthy=false; // UN Press is third, but EU Council + Canada still work.
   expect(decideFiveMinuteFallbackCategories(primary)).toEqual([]);
   primary[3].healthy=false;
   primary[4].healthy=false;
   expect(decideFiveMinuteFallbackCategories(primary)).toEqual(["geopolitics"]);
   // Six macro and five mineral primaries must each ALL fail before the
   // single additional category fallback is permitted.
   for(let i=5;i<16;i++)primary[i].healthy=false;
   expect(decideFiveMinuteFallbackCategories(primary)).toEqual(CATS);
   expect(()=>decideFiveMinuteFallbackCategories([{category:"unapproved",healthy:true}]))
     .toThrow("ORIGINAL_FASTLANE_PRIMARY_HEALTH_INVALID");
   expect(()=>decideFiveMinuteFallbackCategories([{category:"macro",healthy:undefined as any}]))
     .toThrow("ORIGINAL_FASTLANE_PRIMARY_HEALTH_INVALID");
   const impl=read("src/lib/stateless-public-intelligence.server.ts");
   expect(impl).toContain("const fallbackCategories=decideFiveMinuteFallbackCategories(");
   expect(impl).toContain("fallbackSelected.length>FASTLANE_MAX_FALLBACK_READS_PER_RUN");
   expect(impl).toContain("officialSources.filter(s=>s.id===entry.id&&s.category===entry.category)");
   expect(impl).toContain("const fallbackBatches=await Promise.all(");
   expect(impl).toContain("p.category===category?[fallbackBatches[i]]:[]");
 });
 it("leaves native original time mandatory without added delay",()=>{
   const at=Date.parse("2026-10-20T12:00:00.000Z");
   const source={
     title:"Federal Reserve announces new sanctions on interest rates",
     articleUrl:"https://www.federalreserve.gov/newsevents/pressreleases/monetary20261020a.htm",
     publishedAt:new Date(at).toISOString(),sourceId:"fed_press",
     category:"macro" as const,credit:"Federal Reserve Board",
   };
   // Only a synthetic time-bound unit test, never a claimed actual release.
   const early=deriveStatelessSignals([source],at-1);
   expect(early).toEqual([]);
   const ontime=deriveStatelessSignals([source],at);
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
   expect(wf).toContain('cron: "3-53/10 * * * *"');
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
   expect(pub).toContain("primary_publisher_status:report.primary_publisher_status??[]");
   expect(pub).toContain("fallback_publisher_status:report.fallback_publisher_status??[]");
   expect(pub).toContain("fallback_for_primary_outage_or_no_recent_release:true");
   expect(pub).toContain("const baseline=await readIntakeBaseline({fetchImpl:canonicalRead");
   expect(pub).toContain("!existingIds.has(s.id)");
   expect(pub).toContain("fetchAllDerivedNews(canonicalRead,Date.now())");
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
 it("counts just-published source-native exact releases without added delay",()=>{
   const now=Date.parse("2026-10-23T12:00:00Z");
   const source={title:"Federal Reserve announces monetary policy interest rates",
     articleUrl:"https://www.federalreserve.gov/newsevents/pressreleases/monetary20261023a.htm",
     publishedAt:new Date(now-20*60_000).toISOString(),sourceId:"fed_press",
     category:"macro" as const,credit:"Federal Reserve Board"};
   expect(recentFastlaneReleaseCount([source],now)).toBe(1);
   for(const age of [-60_000,61*60_000])
     expect(recentFastlaneReleaseCount([{...source,publishedAt:new Date(now-age).toISOString()}],now)).toBe(0);
   expect(recentFastlaneReleaseCount([{...source,datePrecision:"day" as const,publishedAt:"2026-10-23T00:00:00Z"}],now)).toBe(0);
 });
 it("recovers a quiet category through the real bounded collector without a polling cascade",async()=>{
   const initial=Date.parse("2026-10-23T12:00:00Z");
   const now=Array.from({length:10},(_,i)=>initial+i*300_000).find(at=>
     selectFiveMinuteFallback("macro",at).id==="boj_press_global")!;
   expect(now).toBeDefined();
   const reads:string[]=[];
   const reports=await readFiveMinuteNewsFastlane(now,20,undefined,{readPinnedSource:async source=>{
     reads.push(source.id);
     return {healthy:true,candidates:source.id==="boj_press_global"?[{
       title:"Bank of Japan announces monetary policy interest rates",
       articleUrl:"https://www.boj.or.jp/en/mopo/outlook/2026/out261023.htm",publishedAt:new Date(now-20*60_000).toISOString(),
       sourceId:source.id,category:"macro",credit:source.credit,
     }]:[]};
   }});
   expect(reads).toHaveLength(19);
   expect(new Set(reads).size).toBe(19);
   const macro=reports.find(r=>r.category==="macro")!;
   expect(macro.signals).toHaveLength(1);
   expect(macro.primary_healthy_feed_count).toBe(6);
   expect(macro.healthy_feed_count).toBe(7);
   expect(macro.fallback_reason).toBe("NO_RECENT_QUALIFYING_PRIMARY_RELEASE");
   expect(macro.primary_publisher_status).toHaveLength(6);
   expect(macro.primary_publisher_status?.every(x=>x.reachable&&x.recent_release_count===0)).toBe(true);
   expect(macro.fallback_publisher_status).toEqual([{id:"boj_press_global",reachable:true,native_candidate_count:1}]);
   expect(macro.signals[0].published_at).toBe(new Date(now-20*60_000).toISOString());
   expect(JSON.stringify(reports)).not.toContain("https://");
 });
 it("retains truthful healthy-but-quiet status when the bounded alternative also fails",async()=>{
   const reads:string[]=[];
   const now=Date.parse("2026-10-23T12:00:00Z");
   const fallbackIds=new Set((CATS as Array<keyof typeof FIVE_MINUTE_NEWS_FALLBACK_ROTATION>)
     .map(category=>selectFiveMinuteFallback(category,now).id));
   const reports=await readFiveMinuteNewsFastlane(now,20,undefined,
     {readPinnedSource:async source=>{
       reads.push(source.id);
       if(fallbackIds.has(source.id as any))throw Error("SYNTHETIC_PROVIDER_UNAVAILABLE");
       return {healthy:true,candidates:[]};
     }});
   expect(reads).toHaveLength(19);
   expect(reports.every(r=>r.status==="no_eligible_original_releases"&&r.signals.length===0)).toBe(true);
   expect(reports.every(r=>r.healthy_feed_count===r.primary_healthy_feed_count)).toBe(true);
   expect(reports.every(r=>r.fallback_reason==="NO_RECENT_QUALIFYING_PRIMARY_RELEASE")).toBe(true);
   expect(reports.every(r=>r.primary_publisher_status?.length===
     FIVE_MINUTE_NEWS_FASTLANE.filter(p=>p.category===r.category).length)).toBe(true);
   expect(reports.every(r=>r.fallback_publisher_status?.length===1 &&
     r.fallback_publisher_status[0].reachable===false)).toBe(true);
   expect(JSON.stringify(reports)).not.toContain("https://");
 });
 it("rotates remaining distinct official origins across quiet categories with one alternative each",async()=>{
   const additions={
     geopolitics:["ungeneva_press_global","uk_ofsi_sanctions"],
     macro:["un_news_economy","boj_press_global"],
     rare_earth:["un_news_minerals","iea_minerals_global"],
   } as const;
   const source=read("src/lib/stateless-public-intelligence.server.ts");
   expect(source).toContain("const batches=await Promise.all(selected.map");
   expect(source).toContain("fallbackSelected.length>FASTLANE_MAX_FALLBACK_READS_PER_RUN");
   for(const category of CATS as Array<keyof typeof additions>){
     const ids=FIVE_MINUTE_NEWS_FALLBACK_ROTATION[category];
     for(const id of additions[category]){
       expect(ids).toContain(id);
       expect(!FIVE_MINUTE_NEWS_FASTLANE.some(p=>p.id===id)).toBe(true);
     }
     const start=Math.floor(Date.parse("2026-10-24T12:00:00Z")/300000)*300000;
     const selected=Array.from({length:ids.length},(_,i)=>selectFiveMinuteFallback(category,start+i*300000).id);
     expect(new Set(selected)).toEqual(new Set(ids));
   }
   const now=Date.parse("2026-10-24T12:00:00Z"),readIds:string[]=[];
   const run=await readFiveMinuteNewsFastlane(now,20,undefined,{readPinnedSource:async source=>{
     readIds.push(source.id);return {healthy:true,candidates:[]};
   }});
   expect(readIds).toHaveLength(19);
   expect(new Set(readIds).size).toBe(19);
   expect(run).toHaveLength(3);
   expect(run.every(row=>row.signals.length===0 && row.fallback_reason==="NO_RECENT_QUALIFYING_PRIMARY_RELEASE")).toBe(true);
   // Changes to this existing reader also need to wake the cloud producer.
   expect(read(".github/workflows/five-minute-original-news-fastlane.yml")
     .split("src/lib/stateless-public-intelligence.server.ts").length-1).toBeGreaterThanOrEqual(2);
   expect(read(".github/workflows/website-derived-news-continuity.yml"))
     .toContain('src/lib/stateless-public-intelligence.server.ts');
 });
 it("rotates existing alternatives under the same one-fallback-per-category budget",()=>{
   const now=Date.parse("2026-10-23T12:00:00Z");
   for(const category of ["geopolitics","macro","rare_earth"] as const){
     const ids=FIVE_MINUTE_NEWS_FALLBACK_ROTATION[category];
     expect(new Set(Array.from({length:ids.length},(_,i)=>selectFiveMinuteFallback(category,now+i*5*60_000).id)))
       .toEqual(new Set(ids));
     expect(selectFiveMinuteFallback(category,now+60_000)).toEqual(selectFiveMinuteFallback(category,now));
     expect(ids.every(id=>!FIVE_MINUTE_NEWS_FASTLANE.some(p=>p.category===category&&p.id===id))).toBe(true);
   }
   expect(()=>selectFiveMinuteFallback("macro",NaN)).toThrow();
 });
 it.each([1,2])("resolves every rotated publisher through existing approved registry at slot %s",async slot=>{
   const now=Date.parse("2026-10-23T12:00:00Z")+slot*5*60_000,reads:string[]=[];
   const reports=await readFiveMinuteNewsFastlane(now,20,undefined,{readPinnedSource:async source=>{
     reads.push(source.id);return {healthy:true,candidates:[]};
   }});
   expect(reads).toHaveLength(19);
   expect(new Set(reads).size).toBe(19);
   for(const category of ["geopolitics","macro","rare_earth"] as const)
     expect(reads).toContain(selectFiveMinuteFallback(category,now).id);
   expect(reports).toHaveLength(3);
   expect(reports.every(r=>r.signals.length===0&&r.fallback_reason==="NO_RECENT_QUALIFYING_PRIMARY_RELEASE")).toBe(true);
 });
});
