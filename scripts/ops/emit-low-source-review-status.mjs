#!/usr/bin/env node
/**
 * Strict redacted aggregate readback of the separate low-authority evidence
 * reviewer. The private full-result JSON is never uploaded or printed.
 * An original-page SHA + native timestamp is not a Facts or Rights approval.
 */
import {ORIGINAL_VERIFICATION_WINDOW_HOURS,ORIGINAL_VERIFICATION_EXPIRED} from '../../src/lib/original-verification-policy.ts';
import {readFileSync, lstatSync} from "node:fs";
import {resolve, isAbsolute} from "node:path";
import {pathToFileURL} from "node:url";

const DOMAINS=["geopolitics","macro","rare_earth"];
const STATUSES=[
  "ORIGINAL_PAGE_READBACK_REQUIRED",
  "SOURCE_CONTRACT_UNREGISTERED_OR_OUT_OF_SCOPE",
  "FIRST_PARTY_PUBLIC_DOMAIN_SCOPE_REVIEW_REQUIRED",
  "ATTRIBUTION_WAIVER_OR_SEPARATE_CREDITED_PRODUCT_REQUIRED",
  "ARTICLE_SPECIFIC_PERMISSION_AND_RIGHTS_SIGNATURE_REQUIRED",
];
const ORIGINAL_STATES=Object.freeze({
 "ORIGINAL_PAGE_BYTES_AND_NATIVE_TIME_VERIFIED":"verified",
 "PRIVATE_ORIGINAL_REFERENCE_NOT_AVAILABLE":"missing_private_original_reference",
 "ORIGINAL_DAY_PRECISION_ONLY":"original_day_precision_only",
 "OUTSIDE_SIX_HOUR_CURRENT_PROOF_WINDOW":"outside_six_hour_current_proof_window",
 [ORIGINAL_VERIFICATION_EXPIRED]:"outside_twenty_two_hour_original_verification_window",
 "ORIGINAL_ISSUER_NOT_REGISTERED_FOR_BYTE_RECHECK":"issuer_not_registered_for_html_readback",
 "ORIGINAL_PAGE_READBACK_DEFERRED_QUOTA":"quota_deferred",
 "ORIGINAL_BYTES_OR_NATIVE_CLOCK_UNVERIFIED":"original_bytes_or_clock_rejected",
});
const FAILURE_CLASSES=Object.freeze([
 "TRANSPORT_OR_HTTP","RESPONSE_BODY","NATIVE_CLOCK",
 "HASH_MISMATCH","UNKNOWN_OR_UNTRUSTED_PROOF",
]);
const CLOCK_DETAILS=Object.freeze([
 "ORIGINAL_METADATA_NOT_PROVEN","FEED_PAGE_CLOCK_CONFLICT",
 "UNCLASSIFIED_NATIVE_CLOCK",
]);
const invalid=()=>{throw Error("LOW_REVIEW_SAFE_RECEIPT_INVALID")};
const count=(value,max=600)=>Number.isSafeInteger(value)&&value>=0&&value<=max;
const exactly=(obj,keys)=>obj&&typeof obj==="object"&&!Array.isArray(obj)&&
 Object.keys(obj).sort().join(",")===keys.slice().sort().join(",");

export function aggregateLowSourceReview(result){
 if(!result||typeof result!=="object"||Array.isArray(result))invalid();
 const audit=result.audit;
 if(!audit||audit.schema!=="geomacro.all-derived-news-original-page-evidence-audit.v1"||
  !count(audit.ingested_news_examined)||!count(audit.verified_original_page_bytes_and_native_time)||
  !count(audit.pending_or_unverified_news_count)||
  audit.verified_original_page_bytes_and_native_time+audit.pending_or_unverified_news_count!==
   audit.ingested_news_examined||
  !count(audit.exact_page_byte_rereads_attempted,6)||
  !count(audit.exact_page_byte_rereads_limit,6)||
  audit.exact_page_byte_rereads_attempted>audit.exact_page_byte_rereads_limit||
  !audit.categories||typeof audit.categories!=="object"||
  !DOMAINS.every(domain=>{
   const row=audit.categories[domain];
   return row&&count(row.total)&&count(row.original_bytes_verified)&&
    count(row.pending_or_unverified)&&row.total===
    row.original_bytes_verified+row.pending_or_unverified;
  })||Object.keys(audit.categories).sort().join(",")!==DOMAINS.slice().sort().join(",")||
  DOMAINS.reduce((a,d)=>a+audit.categories[d].total,0)!==audit.ingested_news_examined)
  invalid();
 if(audit.independent_same_event_verified!==false||
  audit.per_article_commercial_rights_verified!==false||
  audit.facts_signatures_verified!==false||
  audit.rights_signatures_verified!==false||
  audit.signed_commercial_intelligence_created!==false||
  audit.b2_requests!==0||audit.d1_writes!==0||audit.supabase_requests!==0||
  audit.x402_charges!==0||
  audit.raw_source_urls_titles_html_logged!==false||
  audit.private_original_html_hashes_exposed!==false)
  invalid();
 const fields=["reviewed_items","reused_current_verified_items",
   "source_retry_cooldown_items","source_verified_items"];
 if(!fields.every(k=>count(result[k])))invalid();
 if(result.source_verified_items>result.reviewed_items||
   result.reviewed_items>audit.ingested_news_examined||
   result.source_verified_items>audit.verified_original_page_bytes_and_native_time)
  invalid();
 const coverage=result.coverage;
 if(!coverage||coverage.schema!=="geomacro.automatic-news-qualification-coverage.v1"||
    coverage.all_retained_unique_inputs_accounted_for!==true||
    !count(coverage.retained_unique_derived_inputs)||
    !count(coverage.reviewed_or_pending_this_run)||
    !count(coverage.previously_verified_source_proofs_reused)||
    !count(coverage.rejected_source_retry_cooldowns)||
    !count(coverage.source_pages_verified_new)||
    !count(coverage.source_pages_verified_total)||
    !count(coverage.awaiting_evidence_or_unverified)||
    coverage.retained_unique_derived_inputs!==audit.ingested_news_examined+
      result.reused_current_verified_items+result.source_retry_cooldown_items||
    coverage.reviewed_or_pending_this_run!==audit.ingested_news_examined||
    coverage.previously_verified_source_proofs_reused!==result.reused_current_verified_items||
    coverage.rejected_source_retry_cooldowns!==result.source_retry_cooldown_items||
    coverage.source_pages_verified_new!==result.source_verified_items||
    coverage.source_pages_verified_total!==coverage.source_pages_verified_new+
      coverage.previously_verified_source_proofs_reused||
    coverage.awaiting_evidence_or_unverified!==
      coverage.retained_unique_derived_inputs-coverage.source_pages_verified_total||
    coverage.original_bytes_and_native_clock_required!==true||
    coverage.independent_facts_review_verified!==false||
    coverage.article_scoped_commercial_rights_verified!==false||
    coverage.signed_commercial_products_approved!==false||
    coverage.automatic_paid_delivery_authorized!==false||
    !coverage.categories||typeof coverage.categories!=="object"||
    Object.keys(coverage.categories).sort().join(",")!==DOMAINS.slice().sort().join(",")||
    !DOMAINS.every(d=>{
      const r=coverage.categories[d];
      return r&&["retained","newly_source_verified","previously_source_verified",
        "rejected_cooldown","pending_or_unverified"].every(k=>count(r[k]))&&
        r.retained===r.newly_source_verified+r.previously_source_verified+r.pending_or_unverified&&
        r.pending_or_unverified>=r.rejected_cooldown&&
        r.newly_source_verified===audit.categories[d].original_bytes_verified;
    })||
    DOMAINS.reduce((n,d)=>n+coverage.categories[d].retained,0)!==
      coverage.retained_unique_derived_inputs)
   invalid();
 const states=audit.rights_remediation_actions;
 if(!states||typeof states!=="object"||Array.isArray(states)||
  Object.keys(states).some(s=>!STATUSES.includes(s)||!count(states[s]))||
  Object.values(states).reduce((sum,n)=>sum+n,0)!==audit.ingested_news_examined)
  invalid();
 // Read status classification ONLY. Each row may contain private source
 // identifiers, which must never be serialized, logged or returned.
 if(!Array.isArray(audit.rows)||audit.rows.length!==audit.ingested_news_examined||
   audit.rows.some(r=>!r||typeof r!=="object"||
    !Object.hasOwn(ORIGINAL_STATES,r.original_page_evidence_status)||
    typeof r.exact_original_page_html_readback!=="boolean"||
    r.exact_original_page_html_readback!==
       (r.original_page_evidence_status==="ORIGINAL_PAGE_BYTES_AND_NATIVE_TIME_VERIFIED")))
  invalid();
 const evidenceStatuses=Object.fromEntries(
  Object.values(ORIGINAL_STATES).map(v=>[v,0]));
 const failureClasses=Object.fromEntries(FAILURE_CLASSES.map(c=>[c,0]));
 const clockDetails=Object.fromEntries(CLOCK_DETAILS.map(c=>[c,0]));
 for(const r of audit.rows){
   evidenceStatuses[ORIGINAL_STATES[r.original_page_evidence_status]]++;
   if(r.original_page_evidence_status==="ORIGINAL_BYTES_OR_NATIVE_CLOCK_UNVERIFIED"){
    if(!FAILURE_CLASSES.includes(r.original_readback_failure_class))invalid();
    failureClasses[r.original_readback_failure_class]++;
    if(r.original_readback_failure_class==="NATIVE_CLOCK"){
     const detail=r.original_readback_clock_detail??"UNCLASSIFIED_NATIVE_CLOCK";
     if(!CLOCK_DETAILS.includes(detail))invalid();
     clockDetails[detail]++;
    }else if(Object.hasOwn(r,"original_readback_clock_detail"))invalid();
   }else if(Object.hasOwn(r,"original_readback_failure_class")||
            Object.hasOwn(r,"original_readback_clock_detail"))invalid();
 }
 if(Object.values(failureClasses).reduce((a,b)=>a+b,0)!==
     evidenceStatuses.original_bytes_or_clock_rejected||
    Object.values(clockDetails).reduce((a,b)=>a+b,0)!==
     failureClasses.NATIVE_CLOCK)invalid();
 if(evidenceStatuses.verified!==audit.verified_original_page_bytes_and_native_time||
   Object.values(evidenceStatuses).reduce((a,n)=>a+n,0)!==
     audit.ingested_news_examined)
  invalid();
 // Never serialize audit.rows, original URLs, article SHA, signal IDs,
 // ephemeral signer contents, trust pins or private source metadata.
 const rightCounts=Object.fromEntries(STATUSES.map(state=>[state,states[state]??0]));
 return Object.freeze({
  schema:"geomacro.low-source-review-safe-operator-status.v1",
  original_verification_window_hours:ORIGINAL_VERIFICATION_WINDOW_HOURS,
  all_retained_news_automatically_accounted_for:true,
  unique_retained_news:coverage.retained_unique_derived_inputs,
  verified_original_pages_total:coverage.source_pages_verified_total,
  awaiting_original_evidence_or_unverified:coverage.awaiting_evidence_or_unverified,
  qualification_coverage_by_domain:coverage.categories,
  original_candidates_examined:audit.ingested_news_examined,
  exact_original_page_readbacks_attempted:audit.exact_page_byte_rereads_attempted,
  new_original_pages_and_native_time_verified:result.source_verified_items,
  previously_verified_current_reused:result.reused_current_verified_items,
  retry_cooldowns:result.source_retry_cooldown_items,
  pending_or_unverified_originals:audit.pending_or_unverified_news_count,
  original_page_verified_by_domain:Object.fromEntries(
   DOMAINS.map(d=>[d,audit.categories[d].original_bytes_verified])),
  rights_followup_classes:rightCounts,
  original_readback_deferral_classes:evidenceStatuses,
  // Safe remediation clues: no publisher, URL, payload, private ID or exception.
  original_readback_failure_classes:failureClasses,
  original_readback_clock_detail_classes:clockDetails,
  requires_real_independent_facts_review:true,
  requires_real_article_scoped_rights_review:true,
  legally_licensed_commercial_events_verified:false,
  current_gri_verified:false,
  current_risk_indices_verified:false,
  charged_or_payable:false,
  b2_writes:0,d1_writes:0,supabase_requests:0,real_payments:0,
 });
}
export function readPrivateResult(path,env=process.env){
 if(!isAbsolute(path)||!env.RUNNER_TEMP||
   !resolve(path).startsWith(resolve(env.RUNNER_TEMP)+"/"))invalid();
 const st=lstatSync(path);
 if(!st.isFile()||st.isSymbolicLink()||
   st.size<20||st.size>2*1024*1024||
   process.platform!=="win32"&&(st.mode&0o077)!==0)invalid();
 return JSON.parse(readFileSync(path,"utf8"));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  if(process.argv.length!==3)invalid();
  // Audit the complete GeoMacro-only result in memory; do not publish
  // source verification counts, reasons or category-specific gaps into
  // potentially public GitHub Actions logs, machine feeds or PREDGE.
  aggregateLowSourceReview(readPrivateResult(process.argv[2]));
  process.stdout.write(JSON.stringify({schema:"geomacro.private-original-review-gate.v1",
   ok:true,details_redacted:true,source_references_logged:0,
   original_verdicts_logged:0})+"\n");
 }catch{
  console.error("::error::LOW_SOURCE_REVIEW_AGGREGATE_NOT_VERIFIED");
  process.exitCode=2;
 }
}
