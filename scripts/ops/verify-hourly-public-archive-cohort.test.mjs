import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {verifyHourlyPublicArchiveCohort} from "./verify-hourly-public-archive-cohort.mjs";
const NOW=Date.parse("2026-11-02T00:00:00.000Z");
function fixture(){
 const checked_at=new Date(NOW-60_000).toISOString();
 const index={schema:"geomacro.permanent-derived-news-archive-index.v1",
  updated_at:checked_at,seed_complete:true,total_signals:20,months:["2026-11"],categories:["geopolitics","macro","rare_earth"]};
 const latest={ok:true,schema:"geomacro.website-derived-news-feed.v1",checked_at,
  delivery_scope:"free_website_only",chargeable:false,scored:false,
  supabase_dependency:false,retention_hours:72,signals:[]};
 const coverage={schema:"geomacro.free-derived-archive-eligibility.v1",checked_at,
  retention_hours:72,free_website_only:true,unverified_promoted:false,
  signed_or_scored:false,paid_customer_eligible:false,live_payment_authorized:false,
  d1_reads:0,eligible_ids_sha256:"a".repeat(64),
  original_release_eligible_total:0,free_displayable_findings_total:0,
  free_displayable_outside_latest_preview:0};
 const daily={ok:true,schema:"geomacro.public-daily-official-finds.v1",generated_at:checked_at,
  chargeable:false,official_only:true,signals:[]};
 return {index,latest,coverage,daily};
}
test("one no-deploy hourly pass proves exact static and daily homepage cohort",async()=>{
 const {index,latest,coverage,daily}=fixture();
 const docs={"/index.json":index,"/latest.json":latest,"/coverage-72h.json":coverage,
   "/daily-highlights.json":daily};
 const proof=await verifyHourlyPublicArchiveCohort({
  expectedIndex:index,expectedLatest:latest,expectedCoverage:coverage,expectedDaily:daily,
  read:async path=>docs[path],now:()=>NOW,sleep:async()=>{}
 });
 assert.equal(proof.source_to_public_archive_exact,true);
 assert.equal(proof.homepage_daily_highlights_exact,true);
 assert.equal(proof.d1_reads,0);assert.equal(proof.payments,0);
 assert.deepEqual(proof.observed_archive_category_counts,
  {geopolitics:0,macro:0,rare_earth:0});
});
test("do not return green for stale daily homepage snapshot",async()=>{
 const {index,latest,coverage,daily}=fixture();
 const docs={"/index.json":index,"/latest.json":latest,"/coverage-72h.json":coverage,
   "/daily-highlights.json":{...daily,signals:[{id:"unauthorized"}]}};
 await assert.rejects(()=>verifyHourlyPublicArchiveCohort({
  expectedIndex:index,expectedLatest:latest,expectedCoverage:coverage,expectedDaily:daily,
  read:async path=>docs[path],now:()=>NOW,sleep:async()=>{}
 }),/GEOMACRO_HOURLY_STATIC_DAILY_COHORT_MISMATCH/);
});
test("existing source-only and hourly writers share single archive mutex and permanent proof",()=>{
 const workflow=readFileSync(".github/workflows/website-derived-news-continuity.yml","utf8");
 const held=workflow.slice(workflow.indexOf("  archive-only-when-d1-held:"),
  workflow.indexOf("  refresh-derived-news:"));
 const full=workflow.slice(workflow.indexOf("  refresh-derived-news:"));
 for(const lane of [held,full]){
  assert.match(lane,/group: geomacro-permanent-news-publication/);
  assert.match(lane,/node scripts\/ops\/verify-hourly-public-archive-cohort\.mjs/);
 }
 assert.match(workflow,/cron: "7 \* \* \* \*"/);
});
