/**
 * Durable per-country-category source continuity POLICY (no network or funds).
 *
 * An endpoint outage never becomes "no news"; a cached older original never
 * becomes a current payable event. Providers fail independently. Each
 * publisher candidate requires a country-specific verified-source receipt
 * from the existing original/rights review pipeline before it may be
 * shortlisted; this module does not mint such a receipt.
 */
export const SOURCE_CONTINUITY_SCHEMA="geomacro.195x3-source-continuity.v1";
const VALID_CATEGORIES=new Set(["geopolitics","macro","rare_earth"]);
const SHA=/^[a-f0-9]{64}$/u;
const safeDate=value=>typeof value==="string"&&Number.isFinite(Date.parse(value));
const fail=code=>{throw Error("COUNTRY_SOURCE_CONTINUITY_"+code)};
function assertScope(country,category){
  if(typeof country!=="string"||!/^[A-Z]{3}$/u.test(country)||
     !VALID_CATEGORIES.has(category))fail("SCOPE_INVALID");
}
function healthState(probe,nowMs){
  if(!probe)return{state:"NOT_PROBED",retry_after:null};
  if(!["OK","HTTP_401","HTTP_403","HTTP_404","HTTP_429","TIMEOUT","HTTP_5XX","INVALID_BODY"].includes(probe.status)||
     !safeDate(probe.checked_at)||Date.parse(probe.checked_at)>nowMs+60000)
    fail("PROBE_INVALID");
  const age=nowMs-Date.parse(probe.checked_at);
  if(age>24*3600_000)return{state:"HEALTH_PROBE_EXPIRED",retry_after:null};
  if(probe.status==="OK")return{state:"AVAILABLE",retry_after:null};
  if(["HTTP_401","HTTP_403","HTTP_404"].includes(probe.status))
    return{state:"OPERATOR_REVIEW_REQUIRED",retry_after:null};
  const retryMs=probe.status==="HTTP_429"?60*60_000:
    probe.status==="INVALID_BODY"?60*60_000:15*60_000;
  const until=new Date(Date.parse(probe.checked_at)+retryMs).toISOString();
  return {state:nowMs<Date.parse(until)?"CIRCUIT_OPEN":"RETRY_ELIGIBLE",
    retry_after:until};
}
function validCandidate(c,country,category){
  if(!c||typeof c!=="object"||Array.isArray(c)||
     c.country_iso3!==country||c.category!==category||
     typeof c.source_id!=="string"||!/^[a-z][a-z0-9_.:-]{2,100}$/u.test(c.source_id)||
     typeof c.publisher_family!=="string"||
       !/^[a-z][a-z0-9_.:-]{2,100}$/u.test(c.publisher_family)||
     c.registered_publisher_adapter!==true||
     !["ORIGINAL_FIRST_PARTY","INDEPENDENT_OFFICIAL_REFERENCE"].includes(c.source_kind)||
     !["UNDER_REVIEW","REVIEWED_ELIGIBLE","DENIED"].includes(c.commercial_rights_status)||
     (c.original_evidence_sha256!==null&&
       !SHA.test(c.original_evidence_sha256??""))||
     (c.original_published_at!==null&&!safeDate(c.original_published_at))||
     (c.corroboration_receipt_sha256!==null&&
       !SHA.test(c.corroboration_receipt_sha256??"")))
    fail("CANDIDATE_UNTRUSTED");
}
function sourceCandidateState(c,nowMs,maxAgeMs) {
  const live=healthState(c.last_probe,nowMs);
  const originalTime=c.original_published_at?Date.parse(c.original_published_at):NaN;
  const observedAge=Number.isFinite(originalTime)?nowMs-originalTime:null;
  const sourceNativeCurrent=observedAge!==null&&observedAge>=0&&
    observedAge<=maxAgeMs;
  const reviewed=c.commercial_rights_status==="REVIEWED_ELIGIBLE" &&
    Boolean(c.original_evidence_sha256)&&
    Boolean(c.corroboration_receipt_sha256);
  const possibleSource=live.state==="AVAILABLE"&&reviewed&&sourceNativeCurrent;
  // A recognized source+rights doesn't independently prove paid checkout,
  // signed output, independent current classification or verified receipt.
  return {
    source_id:c.source_id,publisher_family:c.publisher_family,
    source_kind:c.source_kind,live:live.state,
    next_probe_after:live.retry_after,
    original_observed_at:c.original_published_at,
    original_evidence_fingerprint:c.original_evidence_sha256,
    rights_reviewed:c.commercial_rights_status==="REVIEWED_ELIGIBLE",
    current_native_original_candidate:possibleSource,
    original_stale_or_missing:!sourceNativeCurrent,
    qualifies_paid_delivery:false,
  };
}
/**
 * One bounded, country-matched, independent-source portfolio.
 * Standby selection cannot override existing merchant/source-rights review.
 * The only retained last good marker is an independently verified SHA and
 * source-native observation date; it is NEVER an auto-refresh or new news.
 */
export function evaluateSourceContinuity({
  country_iso3,category,candidates=[],last_good=null,
  now=new Date(),max_original_age_hours=72,
}={}) {
  assertScope(country_iso3,category);
  if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
     !Number.isInteger(max_original_age_hours)||max_original_age_hours<1||
     max_original_age_hours>24*400||
     !Array.isArray(candidates)||candidates.length>12)
    fail("INPUT_INVALID");
  const ms=now.getTime(),maxAgeMs=max_original_age_hours*3600_000;
  const unique=new Set(),states=[];
  for(const c of candidates){
    validCandidate(c,country_iso3,category);
    if(unique.has(c.source_id))fail("DUPLICATE_PUBLISHER");
    unique.add(c.source_id);
    states.push(sourceCandidateState(c,ms,maxAgeMs));
  }
  if(last_good!==null &&
    (last_good.country_iso3!==country_iso3||last_good.category!==category||
     !SHA.test(last_good.verified_sha256??"")||
     !safeDate(last_good.original_published_at)||
     Date.parse(last_good.original_published_at)>ms))
    fail("LAST_GOOD_UNVERIFIED");
  const ready=states.filter(s=>s.current_native_original_candidate);
  const distinctFamilies=new Set(ready.map(x=>x.publisher_family));
  const sorted=ready.sort((a,b)=>Date.parse(b.original_observed_at)-
    Date.parse(a.original_observed_at)||a.source_id.localeCompare(b.source_id));
  const currentOriginal=sorted[0]??null;
  const lkgAge=last_good?
    Math.floor((ms-Date.parse(last_good.original_published_at))/1000):null;
  return {
    schema:SOURCE_CONTINUITY_SCHEMA,country_iso3,category,
    checked_at:now.toISOString(),
    source_health_candidates:states,
    current_verified_source_candidates:ready.length,
    current_distinct_publisher_families:distinctFamilies.size,
    selected_source_candidate:currentOriginal?.source_id??null,
    alternate_independent_family_available:distinctFamilies.size>=2,
    continuity_state:ready.length>0?"SOURCE_CANDIDATE_AVAILABLE":
      last_good?"ARCHIVE_ONLY_NO_CURRENT_VERIFIED_SOURCE":"NO_APPROVED_LIVE_SOURCE",
    last_good_reference:last_good?{
      observed_at:last_good.original_published_at,
      verified_sha256:last_good.verified_sha256,
      elapsed_seconds:lkgAge,
      stale_for_current_product:lkgAge>max_original_age_hours*3600,
      archive_never_claims_new_observation:true,
    }:null,
    retry_pending:states.some(x=>x.live==="CIRCUIT_OPEN"||x.live==="RETRY_ELIGIBLE"),
    explicit_rights_required:true,independent_reviewer_required:true,
    signed_country_object_verified:false,commercial_delivery_authorized:false,
    no_payable_status_from_source_health:true,
  };
}
