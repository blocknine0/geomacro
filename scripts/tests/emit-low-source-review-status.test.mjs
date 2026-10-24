import test from "node:test";
import assert from "node:assert/strict";
import {aggregateLowSourceReview} from "../ops/emit-low-source-review-status.mjs";

function proof(){
 return {
  audit:{
   schema:"geomacro.all-derived-news-original-page-evidence-audit.v1",
   ingested_news_examined:3,verified_original_page_bytes_and_native_time:1,
   pending_or_unverified_news_count:2,exact_page_byte_rereads_attempted:1,
   exact_page_byte_rereads_limit:6,
   categories:{
    geopolitics:{total:1,original_bytes_verified:1,pending_or_unverified:0},
    macro:{total:1,original_bytes_verified:0,pending_or_unverified:1},
    rare_earth:{total:1,original_bytes_verified:0,pending_or_unverified:1}
   },
   rights_remediation_actions:{
    ORIGINAL_PAGE_READBACK_REQUIRED:2,
    ARTICLE_SPECIFIC_PERMISSION_AND_RIGHTS_SIGNATURE_REQUIRED:1
   },
   independent_same_event_verified:false,per_article_commercial_rights_verified:false,
   facts_signatures_verified:false,rights_signatures_verified:false,
   signed_commercial_intelligence_created:false,b2_requests:0,d1_writes:0,
   supabase_requests:0,x402_charges:0,raw_source_urls_titles_html_logged:false,
   private_original_html_hashes_exposed:false,
   rows:[{articleUrl:"https://secret.example/release",
     original_article_sha256:"a".repeat(64),title:"SECRET UPSTREAM TITLE",
     publisher:"REAL_PRIVATE_PUBLISHER",id:"geopolitics-bc123abc",
     original_page_evidence_status:"ORIGINAL_PAGE_BYTES_AND_NATIVE_TIME_VERIFIED",
     exact_original_page_html_readback:true},
    {id:"macro-89abcdef",original_page_evidence_status:
      "OUTSIDE_SIX_HOUR_CURRENT_PROOF_WINDOW",exact_original_page_html_readback:false},
    {id:"rare_earth-1234abcd",original_page_evidence_status:
      "PRIVATE_ORIGINAL_REFERENCE_NOT_AVAILABLE",exact_original_page_html_readback:false}]
  },
  reviewed_items:3,reused_current_verified_items:0,
  source_retry_cooldown_items:0,source_verified_items:1,
  private_signer_key:"SECRET_SIGNER",
 };
}
test("prints only aggregate source bytes review counts, never private evidence",()=>{
 const p=proof(),r=aggregateLowSourceReview(p),s=JSON.stringify(r);
 assert.equal(r.schema,"geomacro.low-source-review-safe-operator-status.v1");
 assert.equal(r.new_original_pages_and_native_time_verified,1);
 assert.equal(r.current_gri_verified,false);
 assert.equal(r.legally_licensed_commercial_events_verified,false);
 assert.equal(r.rights_followup_classes.ORIGINAL_PAGE_READBACK_REQUIRED,2);
 assert.equal(r.original_readback_deferral_classes.outside_six_hour_current_proof_window,1);
 assert.equal(r.original_readback_deferral_classes.missing_private_original_reference,1);
 assert.equal(r.original_readback_deferral_classes.verified,1);
 for(const forbidden of ["secret.example","SECRET UPSTREAM","PRIVATE_PUBLISHER",
   "SECRET_SIGNER","bc123abc","aaaaaaaa","articleUrl","original_article_sha256","rows"])
   assert.equal(s.includes(forbidden),false);
});
test("refuses a forged commercial permission or hidden charge",()=>{
 for(const [k,v] of [
  ["per_article_commercial_rights_verified",true],
  ["facts_signatures_verified",true],
  ["rights_signatures_verified",true],
  ["signed_commercial_intelligence_created",true],
  ["b2_requests",1],
  ["x402_charges",1],
  ["raw_source_urls_titles_html_logged",true]
 ]){
  const p=proof();p.audit[k]=v;
  assert.throws(()=>aggregateLowSourceReview(p),/LOW_REVIEW_SAFE_RECEIPT_INVALID/);
 }
});
test("fails closed on fabricated aggregate rights or invalid source counts",()=>{
 const bad=[
  p=>p.audit.rights_remediation_actions.UNKNOWN_AUTHORIZED=1,
  p=>p.audit.rights_remediation_actions.ORIGINAL_PAGE_READBACK_REQUIRED=100,
  p=>p.audit.categories.macro.total=5,
  p=>p.source_verified_items=4,
  p=>p.audit.exact_page_byte_rereads_attempted=9,
  p=>p.audit.verified_original_page_bytes_and_native_time=3,
  p=>p.audit.categories.rare_earth.original_bytes_verified=2,
  p=>p.audit.categories.geopolitics={total:1,original_bytes_verified:2,pending_or_unverified:0},
  p=>p.audit.rows[1].original_page_evidence_status="SIGNED_COMMERCIAL_GRO_VERIFIED",
  p=>p.audit.rows[0].exact_original_page_html_readback=false,
  p=>p.audit.rows.pop()
 ];
 for(const patch of bad){const p=proof();patch(p);
  assert.throws(()=>aggregateLowSourceReview(p),/LOW_REVIEW_SAFE_RECEIPT_INVALID/)}
});
test("never labels original HTML readback as signed commercial product",()=>{
 const r=aggregateLowSourceReview(proof());
 assert.equal(r.requires_real_article_scoped_rights_review,true);
 assert.equal(r.requires_real_independent_facts_review,true);
 assert.equal(r.current_risk_indices_verified,false);
 assert.equal(r.charged_or_payable,false);
 assert.equal(r.real_payments,0);
});


test("redacted original rejection classes distinguish upstream clock from transport without private data",()=>{
 const p=proof();
 p.audit.rows[1].original_page_evidence_status="ORIGINAL_BYTES_OR_NATIVE_CLOCK_UNVERIFIED";
 p.audit.rows[1].original_readback_failure_class="NATIVE_CLOCK";
 const r=aggregateLowSourceReview(p),safe=JSON.stringify(r);
 assert.equal(r.original_readback_failure_classes.NATIVE_CLOCK,1);
 assert.equal(r.original_readback_deferral_classes.original_bytes_or_clock_rejected,1);
 for(const secret of ["secret.example","SECRET UPSTREAM","PRIVATE_PUBLISHER","89abcdef"]){
  assert.equal(safe.includes(secret),false);
 }
 p.audit.rows[1].original_readback_failure_class="ARBITRARY_PRIVATE_SOURCE_URL";
 assert.throws(()=>aggregateLowSourceReview(p),/LOW_REVIEW_SAFE_RECEIPT_INVALID/);
});


test("aggregate safely differentiates first-party metadata absence versus feed/page clock conflicts",()=>{
 const p=proof();
 p.audit.rows[1].original_page_evidence_status="ORIGINAL_BYTES_OR_NATIVE_CLOCK_UNVERIFIED";
 p.audit.rows[1].original_readback_failure_class="NATIVE_CLOCK";
 p.audit.rows[1].original_readback_clock_detail="FEED_PAGE_CLOCK_CONFLICT";
 let r=aggregateLowSourceReview(p);
 assert.equal(r.original_readback_clock_detail_classes.FEED_PAGE_CLOCK_CONFLICT,1);
 assert.equal(r.original_readback_clock_detail_classes.ORIGINAL_METADATA_NOT_PROVEN,0);
 assert.equal(r.original_readback_failure_classes.NATIVE_CLOCK,1);
 p.audit.rows[1].original_readback_clock_detail="ORIGINAL_METADATA_NOT_PROVEN";
 r=aggregateLowSourceReview(p);
 assert.equal(r.original_readback_clock_detail_classes.ORIGINAL_METADATA_NOT_PROVEN,1);
 p.audit.rows[1].original_readback_clock_detail="https://private.invalid/key";
 assert.throws(()=>aggregateLowSourceReview(p),/LOW_REVIEW_SAFE_RECEIPT_INVALID/);
 p.audit.rows[1].original_page_evidence_status="PRIVATE_ORIGINAL_REFERENCE_NOT_AVAILABLE";
 p.audit.rows[1].original_readback_clock_detail="FEED_PAGE_CLOCK_CONFLICT";
 assert.throws(()=>aggregateLowSourceReview(p),/LOW_REVIEW_SAFE_RECEIPT_INVALID/);
});
