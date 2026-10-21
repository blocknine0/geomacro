/**
 * Commercial source rights REMEDIATION, not a publisher permission issuer.
 * Preserves Geomacro's source-private/no-attribution product decision.
 * No default rights approvals, B2/D1 writes, payments, publisher scraping
 * or "license grants" manufactured from public URLs.
 */
import {createHash} from "node:crypto";
import {COMMERCIAL_SOURCE_RIGHTS_EVIDENCE} from "../commercial-source-rights-evidence.mjs";

const HEX=/^[0-9a-f]{64}$/u;
const SAFE_ID=/^[a-z0-9_]{2,100}$/u;
const APPROVED_STATUS=new Set(["VERIFIED","DERIVED_ONLY"]);
const MAX=1000;
const sha=x=>createHash("sha256").update(x,"utf8").digest("hex");
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const reject=()=>{throw Error("RIGHTS_REMEDIATION_INPUT_INVALID")};
const frozen=(v)=>Object.freeze(v);

/** Categories never make a license transferable to another original. */
export const SOURCE_DOMAIN_HINTS=frozen({
 world_bank_indicators:["macro"],
 world_bank_qpsd:["macro"],
 world_bank_wgi_political_stability:["geopolitics","macro"],
 unhcr_refugee_statistics:["geopolitics"],
 ucdp_ged:["geopolitics"],
 ucdp_candidate:["geopolitics"],
 usgs_mcs:["rare_earth"],
 gdelt_v2_events:["geopolitics","macro","rare_earth"],
 eurostat_government_finance:["macro"],
 usgs_earthquake_hazards:["geopolitics"],
 reliefweb:["geopolitics","macro","rare_earth"],
});
const ONLY_USGS_PRODUCED=new Set(["usgs_mcs","usgs_earthquake_hazards"]);
const isAttribution=license=>/CC\s*BY|with citation|acknowledg|attribution|with credit/i.test(license??"");

/** A snapshot of all current source contracts: no approval is added. */
export function buildCommercialRightsRemediationInventory(register=COMMERCIAL_SOURCE_RIGHTS_EVIDENCE){
 if(!register||typeof register!=="object"||Array.isArray(register)||Object.keys(register).length>MAX||Object.keys(register).length===0)reject();
 const rows=[];
 for(const [id,record] of Object.entries(register).sort(([a],[b])=>a.localeCompare(b))){
  if(!SAFE_ID.test(id)||!record||typeof record!=="object"||
    !APPROVED_STATUS.has(record.approved_status)||
    typeof record.terms_url!=="string"||
    !record.terms_url.startsWith("https://")||
    typeof record.dataset_url!=="string"||
    !record.dataset_url.startsWith("https://"))reject();
  const hints=SOURCE_DOMAIN_HINTS[id];
  if(!Array.isArray(hints)||!hints.length)reject();
  const credit=record.attribution_required===true;
  const publicDomain=ONLY_USGS_PRODUCED.has(id) &&
    /public domain/i.test(record.licence??"");
  const mode=publicDomain
     ?"POTENTIAL_FIRST_PARTY_PUBLIC_DOMAIN_ITEM_CHECK"
     :credit?"OPEN_LICENCE_CREDIT_REQUIRED_OR_EXCEPTION_REVIEW"
     :"EXACT_DATASET_TERMS_AND_ARTICLE_SCOPE_REVIEW";
  rows.push(frozen({
   source_id:id,datasets:hints,registered_status:record.approved_status,
   terms_url:record.terms_url,dataset_url:record.dataset_url,
   source_record_reviewed_on:record.reviewed_on,
   known_public_credit_requirement:credit,
   potential_first_party_public_domain:publicDomain,
   material_review_path:mode,
   no_attribution_commercial_article_permission_verified:false,
   website_no_source_names_compatible:!credit && !publicDomain ? null:false,
   raw_upstream_delivery_authorized:false,
   source_raw_material_rights_granted:false,
   automated_rights_signature_issued:false,
   signed_gro_created:false,
  }));
 }
 return frozen({schema:"geomacro.source-rights-remediation-inventory.v1",
  registered_sources_examined:rows.length,
  rights_automatically_granted:0,signatures_issued:0,
  sources_with_known_credit_requirement:rows.filter(r=>r.known_public_credit_requirement).length,
  public_domain_item_scope_review_candidates:rows.filter(r=>r.potential_first_party_public_domain).length,
  rows});
}

/** Safe per-story follow-up code for the hourly original evidence audit.
 * It is only a SOURCE-CONTRACT hint, never article-specific approval. */
export function sourceRightsFollowupStatus(sourceId,category){
 const row=COMMERCIAL_SOURCE_RIGHTS_EVIDENCE[sourceId];
 if(!row||!SOURCE_DOMAIN_HINTS[sourceId]?.includes(category))
  return "SOURCE_CONTRACT_UNREGISTERED_OR_OUT_OF_SCOPE";
 if(ONLY_USGS_PRODUCED.has(sourceId)&&/public domain/i.test(row.licence??""))
  return "FIRST_PARTY_PUBLIC_DOMAIN_SCOPE_REVIEW_REQUIRED";
 if(row.attribution_required===true||isAttribution(row.licence))
  return "ATTRIBUTION_WAIVER_OR_SEPARATE_CREDITED_PRODUCT_REQUIRED";
 return "ARTICLE_SPECIFIC_PERMISSION_AND_RIGHTS_SIGNATURE_REQUIRED";
}

/**
 * Deduplication is article-byte/issuer/claim specific. Similar headlines
 * cannot be conflated with independently authored first-party originals.
 * Only metadata hashes are accepted; never place URLs/article text in CI.
 */
export function triageCommercialRightsCandidates(candidates,{now=new Date()}={}){
 if(!Array.isArray(candidates)||candidates.length>MAX||
    !(now instanceof Date)||!Number.isFinite(now.getTime()))reject();
 const seen=new Set(),seenArticleBytes=new Set(),seenIssuerClaim=new Set(),rows=[];
 for(const c of candidates){
  if(!c||typeof c!=="object"||Array.isArray(c)||
    !SAFE_ID.test(c.source_id??"")||
    typeof c.issuer_id!=="string"||!/^[a-z0-9_.:-]{3,128}$/i.test(c.issuer_id)||
    !HEX.test(c.original_article_sha256??"")||
    !HEX.test(c.same_event_claim_sha256??"")||
    !["geopolitics","macro","rare_earth"].includes(c.category)||
    c.third_party_material_excluded!==true&&c.third_party_material_excluded!==false||
    typeof c.original_published_at!=="string"||
    !Number.isFinite(Date.parse(c.original_published_at)))reject();
  const at=Date.parse(c.original_published_at);
  const eligibleClock=at<=now.getTime()&&now.getTime()-at<=6*60*60*1000;
  const exactKey=c.issuer_id+":"+c.original_article_sha256;
  const claimKey=c.issuer_id+":"+c.same_event_claim_sha256;
  // Exact same publisher HTML bytes cannot become multiple independent
  // originals merely by changing the claimed issuer. This detects accidental
  // syndicated mirroring or forged multi-source submissions as well.
  const repeated=seen.has(exactKey)||
    seenArticleBytes.has(c.original_article_sha256)||
    seenIssuerClaim.has(claimKey);
  seen.add(exactKey);seenArticleBytes.add(c.original_article_sha256);
  seenIssuerClaim.add(claimKey);
  const rights=COMMERCIAL_SOURCE_RIGHTS_EVIDENCE[c.source_id];
  const domains=SOURCE_DOMAIN_HINTS[c.source_id]??[];
  let status,action;
  if(repeated){
    status="DUPLICATE_OR_SAME_ISSUER_CLAIM";
    action="DEDUPLICATE_AND_FIND_INDEPENDENT_FIRST_PARTY_ORIGINAL";
  }else if(!eligibleClock){
    status="NOT_CURRENT_SOURCE_EVIDENCE";
    action="WAIT_FOR_CURRENT_PUBLISHER_NATIVE_ORIGINAL";
  }else if(!rights||!domains.includes(c.category)){
    status="SOURCE_CONTRACT_UNREGISTERED_OR_OUT_OF_SCOPE";
    action="FIND_PINNED_OFFICIAL_ALTERNATIVE_OR_REVIEW_EXACT_TERMS";
  }else if(!c.third_party_material_excluded){
    status="THIRD_PARTY_MATERIAL_SCOPE_UNVERIFIED";
    action="EXCLUDE_THIRD_PARTY_ASSETS_AND_REVALIDATE_ORIGINAL_SCOPE";
  }else if(ONLY_USGS_PRODUCED.has(c.source_id)&&
    /public domain/i.test(rights.licence??"")){
    status="PUBLIC_DOMAIN_FIRST_PARTY_ITEM_REVIEW_READY";
    action="CHECK_USGS_AUTHORSHIP_AND_THIRD_PARTY_EXCEPTIONS_THEN_SEPARATE_RIGHTS_SIGNATURE";
  }else if(rights.attribution_required===true||isAttribution(rights.licence)){
    status="ATTRIBUTION_OBLIGATION_CONFLICTS_WITH_SOURCE_PRIVATE_OUTPUT";
    action="OBTAIN_EXPRESS_NO_ATTRIBUTION_GRANT_OR_DELIVER_WITH_APPROVED_CREDITS_IN_SEPARATE_PRODUCT";
  }else{
    status="ARTICLE_LEVEL_PERMISSION_NOT_YET_PROVEN";
    action="VERIFY_EXACT_ITEM_TERMS_AND_SIGN_IN_SEPARATE_RIGHTS_AUTHORITY";
  }
  rows.push(frozen({
    source_id:c.source_id,category:c.category,
    original_article_sha256:c.original_article_sha256,
    same_event_claim_sha256:c.same_event_claim_sha256,
    state:status,next_action:action,
    eligible_as_independent_original:!repeated&&eligibleClock,
    per_article_commercial_permission_verified:false,
    no_attribution_grant_verified:false,
    facts_signature_issued:false,rights_signature_issued:false,
    signed_commercial_gro:false,paid_api_authorized:false,
  }));
 }
 const summary=Object.fromEntries([...new Set(rows.map(r=>r.state))].sort()
  .map(s=>[s,rows.filter(r=>r.state===s).length]));
 return frozen({schema:"geomacro.per-original-rights-remediation-triage.v1",
  examined:rows.length,duplicates_excluded:summary.DUPLICATE_OR_SAME_ISSUER_CLAIM??0,
  rights_automatically_granted:0,signatures_issued:0,payments:0,
  by_state:summary,rows});
}

/** Draft for legal review ONLY. Never an executed grant or automatic email. */
export function draftExactItemPermissionRequest(candidate){
 if(!candidate||!SAFE_ID.test(candidate.source_id??"")||
    !HEX.test(candidate.original_article_sha256??""))reject();
 const evidence=COMMERCIAL_SOURCE_RIGHTS_EVIDENCE[candidate.source_id];
 if(!evidence)reject();
 const text=[
  "Subject: Permission request for commercial derived intelligence from a specific source item",
  "",
  "Dear licensing team,",
  "",
  "Geomacro requests a non-exclusive permission for commercial creation and delivery of its own",
  "original, machine-readable analytical conclusions based on the identified source item.",
  "Original item SHA-256: "+candidate.original_article_sha256,
  "Source contract: "+candidate.source_id,
  "Our intended customer deliverable does not contain original article text, publisher images,",
  "publisher-specific expressive summaries, original titles or raw document redistribution.",
  "Our proposed source-private format does not name upstream publishers. Please explicitly",
  "confirm whether that no-public-attribution use is permitted, and any required credit,",
  "geographic scope, term, fees, dataset restrictions or third-party exceptions.",
  "Please identify any conditions, the exact work covered and authorized rights holder.",
  "No permission will be inferred from silence or automated delivery of this request.",
  "",
  "Regards,",
  "Geomacro"
 ].join("\n");
 return frozen({schema:"geomacro.item-specific-permission-request-draft.v1",
  source_id:candidate.source_id,send_automatically:false,grant_obtained:false,
  publisher_permission_verified:false,rights_signature_issued:false,text});
}
