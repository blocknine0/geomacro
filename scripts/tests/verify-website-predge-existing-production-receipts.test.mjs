import test from "node:test";
import assert from "node:assert/strict";
import {verifyExistingRunReceipts} from "../ops/verify-website-predge-existing-production-receipts.mjs";

const NOW=Date.parse("2026-10-29T12:00:00.000Z");
const sourceAt="2026-10-29T11:45:00.000Z";
const partnerAt="2026-10-29T11:48:00.000Z";
const archiveAt="2026-10-29T09:40:00.000Z";
const cat=(g,m,r)=>({geopolitics:g,macro:m,rare_earth:r});
function fixture(){
 const expected={
  schema:"geomacro.website-shared-partner-expected-projection.v1",
  eligible_archive_ids:6,canonical_exact_readback_verified:true,
  missing_canonical_ids:0,category_archive_eligible:cat(2,2,2),
  category_expected_attributed_partner_ids:cat(2,1,1),
  category_rights_credit_withheld:cat(0,1,1),
  all_eligible_ids_accounted_for:true,
  same_existing_canonical_journal:true,expected_attributed_projection_only:true,
  authenticated_partner_live_delivery_verified:false,additional_d1_reads:0,
  additional_partner_gets:0,
 };
 return {
  now:NOW,
  canonical:{schema:"geomacro.website-predge-common-journal-catchup.v1",
   same_canonical_d1_journal_for_website_and_partner:true,
   source_clocks_preserved:true,exact_source_native_payloads_verified:true,
   missing_eligible_ids:0,conflicting_existing_ids:0,retention_hours:72,
   authenticated_partner_live_delivery_verified:false,real_money_payments:0,
   readback_category_counts:cat(2,2,2),readback_eligible_ids:6,
   eligible_archive_ids:6,eligible_partner_projection:expected},
  protectedLive:{schema:"geomacro.predge-continuity-receipt.v1",
   authenticated_research_verified:true,shared_d1_items_verified:true,
   attributed_research:true,daily_request_hard_cap:500,
   paid_launch_approved:false,execution_authorized:false,payments:0,
   category_counts:cat(3,2,3),category_delivery_ready:{geopolitics:true,macro:true,rare_earth:false}},
  archive:{schema:"geomacro.permanent-public-finds-static-readback.v1",
   public_index_readback_verified:true,public_latest_readback_verified:true,
   public_72h_coverage_exact_readback_verified:true,
   full_72h_eligible_ids_hash_verified:true,d1_reads:0,predge_gets:0,payments:0},
  proof:{source_completed_at:sourceAt,protected_completed_at:partnerAt,
   archive_completed_at:archiveAt,source_job:"refresh-derived-news",
   partner_job:"protected-live-check",archive_job:"deploy-public-static-archive",
   source_result:"success",partner_result:"success",archive_result:"success",
   source_run_url:"https://github.com/blocknine0/geomacro/actions/runs/101",
   partner_run_url:"https://github.com/blocknine0/geomacro/actions/runs/102",
   archive_run_url:"https://github.com/blocknine0/geomacro/actions/runs/103"},
 };
}
test("existing protected actual job plus static exact coverage and D1 archive receipt qualifies for bounded shared path",()=>{
 const v=verifyExistingRunReceipts(fixture());
 assert.equal(v.same_d1_journal,true);
 assert.equal(v.protected_live_authenticated_parity_verified,true);
 assert.equal(v.source_native_clocks_verified,true);
 assert.equal(v.no_extra_d1_reads_or_partner_gets_for_acceptance,true);
 assert.deepEqual(v.rights_withheld_by_category,cat(0,1,1));
 assert.equal(v.qualified_release_by_category.rare_earth,false);
 assert.equal(v.additional_d1_reads,0);
});
test("no valid proof from green contract-only or skipped protected/auth jobs",()=>{
 const v=fixture();v.proof.partner_result="skipped";
 assert.throws(()=>verifyExistingRunReceipts(v),/AUTH_OR_RUN_PROVENANCE_UNVERIFIED/);
 const w=fixture();w.protectedLive.authenticated_research_verified=false;
 assert.throws(()=>verifyExistingRunReceipts(w),/PROTECTED_AUTHENTICATED_LIVE_UNVERIFIED/);
});
test("missing or changed source native D1 IDs and attribution are never accepted",()=>{
 for(const tweak of [
  v=>v.canonical.missing_eligible_ids=1,
  v=>v.canonical.source_clocks_preserved=false,
  v=>v.canonical.eligible_partner_projection.category_archive_eligible.macro=3,
  v=>v.canonical.eligible_partner_projection.category_rights_credit_withheld.rare_earth=0,
  v=>v.protectedLive.category_counts.macro=0,
 ]){
  const v=fixture();tweak(v);
  assert.throws(()=>verifyExistingRunReceipts(v),/WEBSITE_PREDGE_PRODUCTION_/);
 }
});
test("stale, out-of-order or absent archive public readback cannot pass",()=>{
 for(const tweak of [
  v=>v.proof.protected_completed_at="2026-10-29T10:00:00Z",
  v=>v.proof.archive_completed_at="2026-10-29T00:00:00Z",
  v=>v.archive.full_72h_eligible_ids_hash_verified=false,
  v=>v.proof.source_completed_at="2026-10-29T11:49:00Z",
 ]){
  const v=fixture();tweak(v);
  assert.throws(()=>verifyExistingRunReceipts(v),/WEBSITE_PREDGE_PRODUCTION_/);
 }
});
