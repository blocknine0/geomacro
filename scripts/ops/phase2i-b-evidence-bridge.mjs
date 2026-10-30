#!/usr/bin/env node
/**
 * Phase 2I-B: metadata-only evidence bridge. Never fetches news, D1 or B2.
 * Maintains strictly separate 585-cell fetch/event/stage/archive/analysis
 * assertions. A publisher's country is NOT an observed event location.
 * Positive B2 proof must come from the existing, quota-governed Phase 2H job.
 */
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";

const CATEGORIES=["geopolitics","macro","rare_earth"];
const SHA=/^[0-9a-f]{40}$/u;
const HASH=/^[0-9a-f]{64}$/u;
const nonnegative=x=>Number.isSafeInteger(x)&&x>=0;
const fail=code=>{throw Error("PHASE2IB_"+code)};
export const RAW_CYCLE_SCHEMA="geomacro.phase2ib.governed-raw-archive-cycle.v1";
const empty=()=>Object.fromEntries(CATEGORIES.map(x=>[x,null]));
const validCounts=x=>x&&CATEGORIES.every(k=>nonnegative(x[k]))&&
 Object.keys(x).sort().join(",")===CATEGORIES.slice().sort().join(",");

export function validateExistingPhase2hReceipt(report,mainSha){
 if(report?.schema!=="geomacro.phase2h.permanent-raw-b2-production-acceptance.v1"||
    !["PASS_REAL_B2_TO_EXACT_QUESTION","INCOMPLETE_ARCHIVE_BACKLOG",
       "INCOMPLETE_ARCHIVED_OBJECT_RECHECK"].includes(report.status)||
    report.production_main_sha!==mainSha||
    report.actual_b2_readback_verified!==true||
    report.canonical_d1_and_deployed_question_exact!==true||
    !nonnegative(report.canonical_d1_staged_total)||
    !nonnegative(report.canonical_d1_archived_total)||
    !nonnegative(report.canonical_d1_pending_total)||
    report.canonical_d1_staged_total!==report.canonical_d1_archived_total+
      report.canonical_d1_pending_total||
    !validCounts(report.verified_category_counts)||
    !validCounts(report.archived_category_counts)||
    !Array.isArray(report.verified_b2_object_sha256)||
    !Array.isArray(report.independently_restored_existing_b2_sha256)||
    report.verified_b2_object_sha256.length>2||
    ![...report.verified_b2_object_sha256,
      ...report.independently_restored_existing_b2_sha256].every(x=>HASH.test(x))||
    !nonnegative(report.archived_records_this_run)||
    report.archived_records_this_run!==
      CATEGORIES.reduce((n,c)=>n+report.archived_category_counts[c],0)||
    !CATEGORIES.every(c=>validCounts(report.canonical_d1_category_census?.[c])===false &&
      report.canonical_d1_category_census?.[c] &&
      ["staged","archived","pending"].every(k=>
        nonnegative(report.canonical_d1_category_census[c][k])) &&
      report.canonical_d1_category_census[c].staged===
        report.canonical_d1_category_census[c].archived+
        report.canonical_d1_category_census[c].pending)||
    !nonnegative(report.same_run_independently_verified_batch_records))
   return null;
 const hashes=[...report.verified_b2_object_sha256,
   ...report.independently_restored_existing_b2_sha256];
 if(!hashes.length||report.same_run_independently_verified_batch_records<1)
   return null;
 if(CATEGORIES.reduce((n,c)=>n+report.canonical_d1_category_census[c].staged,0)!==
   report.canonical_d1_staged_total) return null;
 if(CATEGORIES.reduce((n,c)=>n+report.canonical_d1_category_census[c].archived,0)!==
   report.canonical_d1_archived_total) return null;
 if(CATEGORIES.reduce((n,c)=>n+report.canonical_d1_category_census[c].pending,0)!==
   report.canonical_d1_pending_total) return null;
 return {
  verified_at:report.verified_at,
  production_main_sha:mainSha,
  object_sha256:hashes,
  newly_archived_object_sha256:[...report.verified_b2_object_sha256],
  independently_restored_object_sha256:[...report.independently_restored_existing_b2_sha256],
  archived_records_this_run:report.archived_records_this_run,
  category_archive_counts_this_run:report.archived_category_counts,
  verified_five_part_by_category:report.verified_category_counts,
  canonical_d1_census:report.canonical_d1_category_census,
  canonical_d1_staged_total:report.canonical_d1_staged_total,
  canonical_d1_archived_total:report.canonical_d1_archived_total,
  canonical_d1_pending_total:report.canonical_d1_pending_total,
  b2_put_and_two_get_and_sha_verified_for_reported_batches:true,
  same_object_d1_id_hash_reconciled_for_reported_batches:true,
  deployed_exact_question_verified_for_reported_categories:true,
  all_backlog_clear:report.status==="PASS_REAL_B2_TO_EXACT_QUESTION"&&
   report.all_current_staged_rows_have_b2_archive_ack===true,
  historical_objects_all_independently_rechecked:
   report.all_historical_b2_objects_independently_refetched_this_run===true,
 };
}
export function createPhase2ibCycle({mainSha,runId,admission,archiveJob,report=null,
 previous=null,now=new Date()}={}){
 if(!SHA.test(mainSha??"")||!(/^[1-9]\d{4,19}$/u).test(String(runId??""))||
    !["true","false","unknown"].includes(admission)||
    !["success","failure","skipped","cancelled","unknown"].includes(archiveJob)||
    !(now instanceof Date)||!Number.isFinite(now.getTime()))
   fail("CYCLE_INPUT_INVALID");
 const positive=report?validateExistingPhase2hReceipt(report,mainSha):null;
 // A prior independently verified object never disappears merely because
 // today's source or quota gate is held. It is not proof of *current* backlog.
 const prior=previous?.schema===RAW_CYCLE_SCHEMA&&
   previous?.last_positive_receipt?.b2_put_and_two_get_and_sha_verified_for_reported_batches===true
    ?previous.last_positive_receipt:null;
 const status=positive?
  (positive.all_backlog_clear?"VERIFIED_ARCHIVE_CURRENT_CENSUS":"VERIFIED_PARTIAL_ARCHIVE_BACKLOG"):
  admission!=="true"?"QUOTA_HELD_MAINTENANCE_NOT_ADMITTED":
  archiveJob==="skipped"?"ARCHIVE_NOT_RUN":
  archiveJob==="failure"?"ARCHIVE_FAILED_NO_POSITIVE_RECEIPT":
  "ARCHIVE_POSITIVE_PROOF_NOT_AVAILABLE";
 return {
  schema:RAW_CYCLE_SCHEMA,production_main_sha:mainSha,
  github_run_id:String(runId),checked_at:now.toISOString(),
  provider_maintenance_admitted:admission==="true",
  archive_schedule:"EVERY_SIX_HOURS_00_06_12_18_UTC",
  archive_cycle_hours:6,archive_admitted_only_once_per_slot:true,
  incremental_pending_backlog_not_silent:true,
  automatic_d1_deletion_paused:true,
  batch_maximum_unmodified:300,account_governor_unchanged:true,
  status,archive_job_result:archiveJob,
  latest_verified_receipt:positive,
  last_positive_receipt:positive??prior,
  category_census_from_canonical_d1:positive?.canonical_d1_census??null,
  collected_by_category:empty(),deduplicated_by_category:empty(),
  // Collection totals require actual producer receipts, not archive counts.
  original_event_country_evidence_from_raw_schema:false,
  country_event_coverage_585_verified:false,
  source_rights_verified:false,commercial_rights_verified:false,
  eligible_news_archive_corpus_claim:false,payments:0,
 };
}
export function enrichPhase2ibLedger(ledger,cycle){
 if(ledger?.schema!=="geomacro.phase2i.195x3-source-coverage.v1"||
    ledger.cell_count!==585||!Array.isArray(ledger.cells)||
    ledger.cells.length!==585)fail("COUNTRY_LEDGER_INVALID");
 if(cycle!==null&&cycle?.schema!==RAW_CYCLE_SCHEMA)fail("RAW_CYCLE_INVALID");
 const seen=new Set(),cells=ledger.cells.map(cell=>{
  if(!/^[A-Z]{3}$/u.test(cell.country_iso3)||!CATEGORIES.includes(cell.category))
   fail("COUNTRY_CELL_INVALID");
  const key=cell.country_iso3+":"+cell.category;
  if(seen.has(key))fail("DUPLICATE_COUNTRY_CELL");
  seen.add(key);
  return {...cell,
   source_fetch_status:cell.source_status,
   country_original_event_observation_status:"NOT_YET_VERIFIED",
   country_original_event_observation_count:null,
   canonical_d1_raw_staging_status:"NOT_YET_VERIFIED",
   canonical_d1_raw_staged_count:null,
   private_b2_archive_status:"NOT_YET_VERIFIED",
   private_b2_archived_count:null,
   archived_news_five_part_analysis_status:"NOT_YET_VERIFIED",
   archived_news_analyzed_count:null,
   country_association_proven_by_native_event_evidence:false,
   no_country_status_inferred_from_publisher_country:true};
 });
 if(seen.size!==585)fail("COUNTRY_CELLS_MISSING");
 return {...ledger,schema:ledger.schema,
  phase2ib_status_schema:"geomacro.phase2ib.585-cell-independent-stage-status.v1",
  country_event_to_d1_to_b2_to_analysis_verified:false,
  raw_archive_cycle:cycle??null,
  raw_census_applies_only_to_three_categories_not_585_countries:true,
  cells};
}
function readOptional(p){try{return JSON.parse(readFileSync(p,"utf8"))}catch{return null}}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  mkdirSync("artifacts/phase2i",{recursive:true,mode:0o700});
  if(process.argv.includes("--cycle")){
   const report=readOptional("artifacts/derived-news/phase2h-permanent-production-acceptance.json");
   const previous=readOptional("artifacts/phase2i/previous-raw-archive-cycle.json");
   const result=createPhase2ibCycle({
    mainSha:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,
    admission:process.env.PHASE2IB_MAINTENANCE??"unknown",
    archiveJob:process.env.PHASE2IB_ARCHIVE_JOB??"unknown",
    report,previous,
   });
   writeFileSync("artifacts/phase2i/raw-archive-cycle.latest.json",
    JSON.stringify(result,null,2)+"\n",{mode:0o600});
   console.log(JSON.stringify({schema:result.schema,status:result.status,
    production_main_sha:result.production_main_sha,github_run_id:result.github_run_id,
    positive_object_hashes:result.latest_verified_receipt?.object_sha256??[],
    canonical_d1_census:result.category_census_from_canonical_d1,rights_verified:false}));
  }else if(process.argv.includes("--enrich")){
   const path="artifacts/phase2i/coverage-585.latest.json";
   const ledger=JSON.parse(readFileSync(path,"utf8"));
   const cycle=readOptional("artifacts/phase2i/previous-raw-archive-cycle.json");
   const result=enrichPhase2ibLedger(ledger,cycle);
   writeFileSync(path,JSON.stringify(result,null,2)+"\n",{mode:0o600});
   const s=readOptional("artifacts/phase2i/summary.json");
   if(s){s.phase2ib_archive_cycle_status=cycle?.status??"NOT_YET_VERIFIED";
    s.phase2ib_per_country_original_events_verified=0;
    s.phase2ib_d1_census=cycle?.category_census_from_canonical_d1??null;
    writeFileSync("artifacts/phase2i/summary.json",JSON.stringify(s,null,2)+"\n",{mode:0o600});}
   console.log(JSON.stringify({cells:585,raw_cycle_status:cycle?.status??"NOT_YET_VERIFIED",
    original_country_events_verified:0,source_request_count_added:0,
    d1_query_count_added:0,b2_request_count_added:0}));
  }else fail("CLI_MODE_INVALID");
 }catch(e){console.error("::error::PHASE2IB_RECEIPT_NOT_ACCEPTED");process.exitCode=2;}
}
