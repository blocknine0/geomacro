import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseCountries,gatherSources,loadCatalogues,buildLedger}
 from "../ops/phase2i-coverage-inventory.mjs";
import {createPhase2ibCycle,enrichPhase2ibLedger,validateExistingPhase2hReceipt}
 from "../ops/phase2i-b-evidence-bridge.mjs";
const sha="a".repeat(40),now=new Date("2026-10-30T12:17:00.000Z");
const countries=parseCountries(readFileSync("src/lib/canonical-country-registry-195.ts","utf8"));
const sources=gatherSources(countries,loadCatalogues());
const counts=(a,b,c)=>({geopolitics:a,macro:b,rare_earth:c});
function report(){
 return {
  schema:"geomacro.phase2h.permanent-raw-b2-production-acceptance.v1",
  status:"INCOMPLETE_ARCHIVE_BACKLOG",production_main_sha:sha,
  verified_at:now.toISOString(),
  actual_b2_readback_verified:true,canonical_d1_and_deployed_question_exact:true,
  canonical_d1_staged_total:45,canonical_d1_archived_total:15,
  canonical_d1_pending_total:30,
  verified_category_counts:counts(5,5,5),
  archived_category_counts:counts(5,5,5),
  canonical_d1_category_census:{
   geopolitics:{staged:15,archived:5,pending:10},
   macro:{staged:15,archived:5,pending:10},
   rare_earth:{staged:15,archived:5,pending:10}},
  verified_b2_object_sha256:["b".repeat(64)],
  independently_restored_existing_b2_sha256:[],
  archived_records_this_run:15,
  same_run_independently_verified_batch_records:15,
  all_current_staged_rows_have_b2_archive_ack:false,
  all_historical_b2_objects_independently_refetched_this_run:false,
 };
}
test("real-shaped B2 positive receipt carries archive hash, canonical census, and pending backlog",()=>{
 const r=report();
 assert.equal(validateExistingPhase2hReceipt(r,sha)?.object_sha256[0],"b".repeat(64));
 const cycle=createPhase2ibCycle({mainSha:sha,runId:"41012345678",
  admission:"true",archiveJob:"failure",report:r,now});
 assert.equal(cycle.status,"VERIFIED_PARTIAL_ARCHIVE_BACKLOG");
 assert.equal(cycle.latest_verified_receipt.canonical_d1_pending_total,30);
 assert.equal(cycle.collected_by_category.geopolitics,null);
 assert.equal(cycle.eligible_news_archive_corpus_claim,false);
});
test("unverified summary cannot invent B2/D1 proof; held cycle preserves previous verified object only",()=>{
 const r=report();r.canonical_d1_category_census.macro.archived=6;
 assert.equal(validateExistingPhase2hReceipt(r,sha),null);
 const held=createPhase2ibCycle({mainSha:sha,runId:"41012345679",
  admission:"false",archiveJob:"skipped",report:r,now});
 assert.equal(held.status,"QUOTA_HELD_MAINTENANCE_NOT_ADMITTED");
 assert.equal(held.latest_verified_receipt,null);
 const old=createPhase2ibCycle({mainSha:sha,runId:"41012345678",
  admission:"true",archiveJob:"success",report:report(),now});
 const next=createPhase2ibCycle({mainSha:sha,runId:"41012345679",
  admission:"false",archiveJob:"skipped",previous:old,now});
 assert.equal(next.latest_verified_receipt,null);
 assert.equal(next.last_positive_receipt.object_sha256[0],"b".repeat(64));
});
test("585 distinct source-fetch and raw-event/stage/archive/analysis slots never promote publisher location",()=>{
 const ledger=buildLedger(countries,sources,{},[],now);
 const cycle=createPhase2ibCycle({mainSha:sha,runId:"41012345678",
  admission:"true",archiveJob:"success",report:report(),now});
 const result=enrichPhase2ibLedger(ledger,cycle);
 assert.equal(result.cells.length,585);
 assert.equal(result.raw_archive_cycle.latest_verified_receipt.canonical_d1_staged_total,45);
 assert.equal(result.cells.every(c=>
  c.source_fetch_status===c.source_status &&
  c.country_original_event_observation_status==="NOT_YET_VERIFIED" &&
  c.canonical_d1_raw_staging_status==="NOT_YET_VERIFIED" &&
  c.private_b2_archive_status==="NOT_YET_VERIFIED" &&
  c.archived_news_five_part_analysis_status==="NOT_YET_VERIFIED" &&
  c.country_original_event_observation_count===null &&
  c.private_b2_archived_count===null &&
  c.no_country_status_inferred_from_publisher_country===true),true);
 assert.equal(result.country_event_to_d1_to_b2_to_analysis_verified,false);
});
test("invalid source ledger and spoofed positive hash fail closed",()=>{
 const ledger=buildLedger(countries,sources,{},[],now);
 assert.throws(()=>enrichPhase2ibLedger({...ledger,cell_count:584},null),
  /PHASE2IB_COUNTRY_LEDGER_INVALID/u);
 const r=report();r.verified_b2_object_sha256=["0"];
 assert.equal(validateExistingPhase2hReceipt(r,sha),null);
});

test("six-hour incremental receipt is real batch proof without false full-corpus claim",()=>{
 const r={...report(),status:"VERIFIED_INCREMENTAL_B2_WITH_BACKLOG",
  incremental_batch_proof_pass:true};
 const proof=validateExistingPhase2hReceipt(r,sha);
 assert.ok(proof);
 assert.equal(proof.archived_records_this_run,15);
 assert.equal(proof.all_backlog_clear,false);
 const cycle=createPhase2ibCycle({mainSha:sha,runId:"41012345683",
  admission:"true",archiveJob:"success",report:r,now});
 assert.equal(cycle.status,"VERIFIED_PARTIAL_ARCHIVE_BACKLOG");
 const unsafe={...r,incremental_batch_proof_pass:false};
 assert.equal(validateExistingPhase2hReceipt(unsafe,sha),null);
});
test("idle new-news archive never fabricates historic provider object proof",()=>{
 const idle={schema:"geomacro.phase2h.permanent-raw-b2-production-acceptance.v1",
  status:"IDLE_NO_PENDING_RAW_ROWS_NO_ARCHIVE_PROOF",
  production_main_sha:sha,incremental_batch_proof_pass:false};
 assert.equal(validateExistingPhase2hReceipt(idle,sha),null);
 const cycle=createPhase2ibCycle({mainSha:sha,runId:"41012345684",
  admission:"true",archiveJob:"success",report:idle,now});
 assert.equal(cycle.status,"IDLE_NO_PENDING_NO_NEW_B2_PROOF");
 assert.equal(cycle.latest_verified_receipt,null);
});
