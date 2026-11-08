import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {readIncrementalWebsiteCategoryFeed}
 from "../../workers/control-plane/src/website-incremental-feed.mjs";
import {phase2hCensusSqlForEnvironment,PHASE2H_ARCHIVE_HOURLY_CENSUS_SQL,
 PHASE2H_ARCHIVE_COUNTER_CENSUS_SQL}
 from "../../workers/control-plane/src/phase2h-archive-counter-census.mjs";

const now=Date.parse("2026-11-08T07:40:00.000Z");
const generatedAt=new Date(now-30_000).toISOString();
const signal={
 id:"macro-00000001",category:"macro",
 title:"Geomacro finds original official policy change in the observed sector",
 what_changed:"An official publisher released a new statement about a policy development in the observed sector.",
 why_it_matters:"This release may affect operating assumptions but actual consequences require independent confirmation.",
 topic:"monetary policy",development_type:"policy update",geography:null,
 published_at:"2026-11-08T06:00:00.000Z",date_precision:"exact",
 observed_release_count:1,sources_credited:[],
 status:"official_release_observed_unscored",
 same_event_corrob_verified:false,severity:null
};
test("category feed consumes revision-fenced pages without 72h journal scanning",async()=>{
 const statements=[];
 const env={GEOMACRO_D1_READ_HOTSPOT_V2:"1",DB:{
  prepare(sql){
   statements.push(sql);
   assert.match(sql,/website_derived_materialized_pages_v1/u);
   assert.doesNotMatch(sql,/FROM website_derived_intelligence /u);
   return {all:async()=>({results:[
    {page_offset:0,generated_at:generatedAt,rows_json:JSON.stringify([
      {story_json:JSON.stringify(signal),first_seen_at:"2026-11-08T06:03:00.000Z"}
    ])},
    {page_offset:250,generated_at:generatedAt,rows_json:"[]"},
    {page_offset:500,generated_at:generatedAt,rows_json:"[]"}
   ]})};
  }
 }};
 const response=await readIncrementalWebsiteCategoryFeed(env,"macro",now);
 assert.equal(response.status,200);
 const data=await response.json();
 assert.equal(data.ok,true);
 assert.equal(data.signals.length,1);
 assert.deepEqual(data.signals[0],signal);
 assert.equal(data.gro_verified_publication,false);
 assert.equal(data.chargeable,false);
 assert.equal(statements.length,1);
});

test("hourly census only activates after explicit migration-backed flag",()=>{
 assert.equal(phase2hCensusSqlForEnvironment({}),PHASE2H_ARCHIVE_COUNTER_CENSUS_SQL);
 assert.equal(phase2hCensusSqlForEnvironment({GEOMACRO_D1_HOURLY_COUNTER_0212:"1"}),
  PHASE2H_ARCHIVE_HOURLY_CENSUS_SQL);
 assert.match(PHASE2H_ARCHIVE_HOURLY_CENSUS_SQL,/phase2h_pending_hourly_v1/u);
 assert.match(PHASE2H_ARCHIVE_HOURLY_CENSUS_SQL,/idx_phase2h_pending_recent_ingested_category/u);
});
test("no OSINT deep OFFSET SQL remains; indexed two-column tuple seeks only",()=>{
 const reader=readFileSync(new URL("../../workers/control-plane/src/private-osint-15m.mjs",import.meta.url),"utf8");
 const bundle=readFileSync(new URL("../../workers/control-plane/src/private-osint-bundle.mjs",import.meta.url),"utf8");
 assert.match(reader,/\(native_feed_published_at,item_id\)<\(\?,\?\)/u);
 assert.match(bundle,/\(native_feed_published_at,item_id\)<\(\?,\?\)/u);
 const section=reader.split("export async function privateOsint15mRead(")[1].split("export async function handlePrivateOsint15m(")[0];
 assert.doesNotMatch(section,/LIMIT 101 OFFSET/u);
 assert.match(section,/GEOMACRO_D1_KEYSET_INDEX_0212/u);
});
