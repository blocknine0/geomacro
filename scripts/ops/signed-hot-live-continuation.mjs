// Fail-closed zero-network triage for verified three-product signed continuity.
// Inputs are pre-sanitized signed-hot expiry metadata, NEVER original article
// content, signatures, keys, B2 payloads or commercial rights approvals.
export const LIVE_SLO_MINUTES = 60;
export const LIVE_RENEWAL_WARNING_MINUTES = 45;
const NAMES=Object.freeze(["intelligence","global-risk","risk-indices"]);
const ALLOWED_STATUSES=new Set(["WITHIN_WINDOW","RENEWAL_DUE","INVALID","EXPIRED","MISSING"]);
const integer=x=>Number.isInteger(x)&&x>=-525600&&x<=525600;
const state=v=>v?"READY_METADATA_ONLY":"NOT_READY";
export function planSignedHotContinuation(report) {
 if(report?.schema!=="geomacro.signed-hot-expiry-early-warning.v1"||
   !report.products||typeof report.products!=="object")throw Error("SIGNED_CONTINUATION_REPORT_INVALID");
 const out={};
 for(const product of NAMES){
  const p=report.products[product];
  if(!p||!ALLOWED_STATUSES.has(p.status))throw Error("SIGNED_CONTINUATION_PRODUCT_INVALID");
  const age=p.source_age_minutes;
  const liveEligible=p.live_freshness_eligible===true;
  const approaching=liveEligible&&integer(age)&&age>=LIVE_RENEWAL_WARNING_MINUTES;
  const live=p.status!=="MISSING"&&p.status!=="INVALID"&&p.status!=="EXPIRED"&&liveEligible;
  out[product]=Object.freeze({
   state:live?(approaching?"LIVE_RENEWAL_DUE":"LIVE_METADATA_WINDOW"):
     p.status==="MISSING"?"MISSING":
     p.status==="INVALID"?"INVALID":
     p.status==="EXPIRED"?"EXPIRED":"LIVE_SOURCE_TOO_OLD",
   original_source_minutes_remaining:integer(age)?Math.max(0,LIVE_SLO_MINUTES-age):null,
   live_source_renewal_due:approaching||!live,
   public_signed_proof_verified:false,
  });
 }
 // The child is never independently eligible when its signed scored GRI
 // parent is absent, expired or outside the live source window. An apparently
 // fresh child D1 timestamp is not a proof of a current parent.
 const griParentLive=!out["global-risk"].live_source_renewal_due;
 if(!griParentLive&&out["risk-indices"].live_source_renewal_due===false){
   out["risk-indices"]=Object.freeze({
     ...out["risk-indices"],
     state:"WAITING_FOR_CURRENT_SIGNED_GRI_PARENT",
     live_source_renewal_due:true,
   });
 }
 const blocking=[];
 if(out.intelligence.live_source_renewal_due)blocking.push("AUTHENTIC_DUAL_SIGNED_FACTS_RIGHTS_INTELLIGENCE_INPUT_REQUIRED");
 if(out["global-risk"].live_source_renewal_due)blocking.push("AUTHENTIC_REVIEWED_GRI_AND_CERTIFIED_COUNTRY_CATEGORY_SCORES_REQUIRED");
 if(out["risk-indices"].live_source_renewal_due){
  if(!out["global-risk"].live_source_renewal_due)
    blocking.push("INDICES_REBUILD_FROM_VERIFIED_CURRENT_GRI_PARENT");
  else blocking.push("INDICES_WAIT_FOR_AUTHENTIC_CURRENT_GRI_PARENT");
 }
 // Public verification NEVER follows from a D1 SELECT. No automatic self
 // signature, paid unlock or past-date extension is possible in this planner.
 return Object.freeze({
  schema:"geomacro.signed-hot-three-product-continuation.v1",
  policy:"current_signed_source_under_60_minutes_with_15_minute_warning_headroom",
  old_supabase_required:false,
  paid_settlement_authorized:false,
  signatures_generated:false,
  immutable_b2_readback_verified:false,
  three_public_signed_products_verified:false,
  all_three_live_metadata_current:NAMES.every(x=>!out[x].live_source_renewal_due),
  currentness:out,
  blocking,
  existing_recovery_lanes:Object.freeze({
   intelligence:"Machine Dual-Authority Intelligence Publication",
   global_risk:"GRI v1.2 Supabase-Free Current Promotion",
   risk_indices:"Risk Indices from Verified D1 Global Risk (No Funds)",
   trigger:"GRI v1.2 Genuine Signed Ready Cadence Backstop (No Funds)",
  }),
  recommendation: blocking.length
   ?"Only dispatch existing protected publishers after their immutable independently authorized source proofs are available; leave unavailable products non-billable."
   :"D1 freshness is plausible only; verify all 3 public B2/D1 signed-product byte proofs and actual deep-health HTTP 200.",
 });
}
