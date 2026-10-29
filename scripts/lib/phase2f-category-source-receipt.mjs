// Phase 2F: source-safe, zero-network funnel receipts for each news category.
// Discovery is not source-native page verification or commercial permission.
// This module NEVER authorizes B2/D1 publishing or adjusts quota allocation.
const CATEGORIES=new Set(["geopolitics","macro","rare_earth"]);
const count=x=>Number.isSafeInteger(x)&&x>=0;
export function phase2fCategorySourceReceipt({
  category,discovered,relevant,deduplicated,archiveOnly,policyReady,
  d1WriteAcknowledged=0,
}){
  if(!CATEGORIES.has(category)||![discovered,relevant,deduplicated,d1WriteAcknowledged].every(count)||
    relevant>discovered||deduplicated>relevant||
    d1WriteAcknowledged>deduplicated||
    typeof archiveOnly!=="boolean"||typeof policyReady!=="boolean"||
    (archiveOnly&&d1WriteAcknowledged!==0)||
    (!policyReady&&d1WriteAcknowledged!==0))
    throw Error("PHASE2F_SOURCE_FUNNEL_INVALID");
  const noSource=discovered===0;
  const quotaHeld=archiveOnly;
  const complete=policyReady&&!archiveOnly&&d1WriteAcknowledged===deduplicated;
  const outcome=noSource?"NO_SOURCE":
    quotaHeld?"QUOTA_HELD_ARCHIVE_CANDIDATES":
    !policyReady?"D1_PUBLISHER_POLICY_UNAVAILABLE":
    complete?"FREE_DERIVED_D1_WRITE_ACKNOWLEDGED":
    "D1_PUBLISH_INCOMPLETE";
  return Object.freeze({
    schema:"geomacro.phase2f.category-source-funnel.v1",category,
    outcome,
    discovered_official_candidates:discovered,
    relevant_derived_candidates:relevant,
    deduplicated_derived_candidates:deduplicated,
    source_native_original_page_verified_count:null,
    source_native_original_clock_preserved:true,
    commercially_permitted_count:null,
    commercial_rights_status:"NOT_INDEPENDENTLY_CERTIFIED_IN_THIS_RUN",
    archive_candidate_count:deduplicated,
    archive_commit_verified:false,
    archive_only:archiveOnly,
    d1_write_acknowledged_count:d1WriteAcknowledged,
    d1_independent_public_readback_verified:false,
    no_source:noSource,
    quota_held:quotaHeld,
    rights_pending:discovered>0,
    free_derived_publication_acknowledged:complete&&deduplicated>0,
    commercial_publication_verified:false,
    signed_hot_verified:false,
    quota_or_rights_gate_bypassed:false,
    source_urls_logged:false,payments:0,
  });
}
