import {describe,it,expect} from "vitest";
import {projectNewsProducerCheckpoint} from "../../workers/control-plane/src/derived-news-qualification-status.mjs";
import {publicSharedDerivedNewsFeed} from "../../workers/control-plane/src/shared-derived-news-feed.mjs";
const NOW=Date.parse("2026-10-19T12:18:00.000Z");
const checkAt=new Date(NOW-120_000).toISOString();
function checkpoint(cat:string,at=checkAt){
 return {scope:cat,status:"DERIVED_NEWS_PUBLISH_COMPLETED",last_success_at:at,
   metadata_json:JSON.stringify({
     schema:"geomacro.derived-news-source-check.v1",category:cat,checked_at:at,
     sources_configured:16,sources_reachable:13,
     original_candidates_examined:10,accepted_derived_rows:0,
     raw_upstream_stored:false,commercial_rights_verified:false,
     paid_delivery_authorized:false})};
}
const story=(cat:string,credit:string[]=[])=>( {
 id:cat+"-9ef0a685",category:cat,
 title:"Geomacro finds new official development affecting policy and strategy",
 what_changed:"An original official publisher released an observed policy development.",
 why_it_matters:"Independent corroboration is needed before assessing operational effects.",
 topic:cat==="geopolitics"?"foreign policy":cat==="macro"?"monetary policy":"rare-earth supply",
 development_type:"official update",geography:null,
 published_at:new Date(NOW-3_600_000).toISOString(),date_precision:"exact",
 observed_release_count:1,sources_credited:credit,
 status:"official_release_observed_unscored",same_event_corrob_verified:false,
 severity:null
});
function env(signals:any[],checks:any[]){
 return {DB:{prepare:(sql:string)=>({bind:()=>({
   all:async()=>sql.includes("pipeline_checkpoint")?
     {results:checks}:{results:signals.map(s=>({story_json:JSON.stringify(s)}))}
 })})}};
}
describe("no-qualified-release source-check instrumentation",()=>{
 it("keeps honest zero news while proving three authentic recent collector runs",async()=>{
  const cats=["geopolitics","macro","rare_earth"];
  const result=await publicSharedDerivedNewsFeed(env([],cats.map(c=>checkpoint(c))),
    new URLSearchParams(),NOW);
  expect(result.status).toBe(200);
  const data=await result.json();
  expect(data.items).toEqual([]);
  for(const c of cats){
   const a=data.availability_by_category[c];
   expect(a.status).toBe("NO_QUALIFIED_RELEASE_IN_72H");
   expect(a.producer_run_freshness_verified).toBe(true);
   expect(a.latest_source_check.original_candidates_examined).toBe(10);
   expect(a.no_qualified_release_explanation).toBe("OFFICIAL_CANDIDATES_OBSERVED_BUT_NONE_PASSED_RELEASE_RULES");
   expect(a.reference_data_is_not_a_new_official_release).toBe(true);
  }
  expect(data.chargeable).toBe(false);
  expect(data.commercial_rights_verified).toBe(false);
 });
 it("explains credited news records missing from hidden-source feed without exposing credit text",async()=>{
  const cats=["geopolitics","macro","rare_earth"];
  const data=await(await publicSharedDerivedNewsFeed(env(
    [story("geopolitics"),story("macro",["Attribution required"]),story("rare_earth",["Attribution required"])],
    cats.map(c=>checkpoint(c))),new URLSearchParams(),NOW)).json();
  expect(data.counts).toEqual({geopolitics:1,macro:0,rare_earth:0});
  for(const c of ["macro","rare_earth"]){
   const a=data.availability_by_category[c];
   expect(a.journal_derived_records_72h).toBe(1);
   expect(a.journal_credit_required_records_72h).toBe(1);
   expect(a.no_qualified_release_explanation).toBe("JOURNAL_RELEASE_REQUIRES_VISIBLE_SOURCE_CREDIT");
  }
  expect(JSON.stringify(data)).not.toContain("Attribution required");
 });
 it("does not trust forged, future, expired or mismatched D1 status",()=>{
  const stale=new Date(NOW-4*3_600_000).toISOString();
  expect(projectNewsProducerCheckpoint(checkpoint("macro",stale),"macro",NOW)
    .current_source_check_verified).toBe(false);
  for(const bad of [null,{...checkpoint("macro"),scope:"rare_earth"},
    {...checkpoint("macro"),metadata_json:"{not-json"},
    {...checkpoint("macro"),status:"FORGED"},
    {...checkpoint("macro"),last_success_at:new Date(NOW+1000).toISOString()}]){
    expect(projectNewsProducerCheckpoint(bad,"macro",NOW)
      .current_source_check_verified).toBe(false);
  }
 });
 it("unavailable checkpoints never hide already verified public news",async()=>{
  const data=await(await publicSharedDerivedNewsFeed(env([story("geopolitics")],[]),
     new URLSearchParams(),NOW)).json();
  expect(data.counts.geopolitics).toBe(1);
  expect(data.availability_by_category.macro.latest_source_check.state)
    .toBe("SOURCE_CHECK_UNAVAILABLE");
 });
});
