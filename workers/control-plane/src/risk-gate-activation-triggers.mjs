/**
 * Evidence-triggered activation contract for the existing three real
 * Risk Gate products. Never manufactures evidence or triggers a charge.
 * The product assembler supplies the authoritative READY decision.
 */
export const RISK_GATE_EVIDENCE_EVENTS=Object.freeze([
 "FRESH_PRIVATE_OSINT_OR_ORIGINAL_OBSERVED",
 "ORIGINAL_PAGE_NATIVE_CLOCK_VERIFIED",
 "INDEPENDENT_SAME_EVENT_FACTS_CORROBORATED",
 "FACTS_RIGHTS_DUAL_ATTESTATION_VERIFIED",
 "THREE_CATEGORY_GRO_ED25519_SIGNED",
 "B2_ARCHIVE_D1_HOT_EXACT_READBACK",
 "SEVEN_DAILY_SIGNED_HISTORY_POINTS_VERIFIED",
 "GRO_EXPIRED_OR_EVIDENCE_REVOKED",
]);
const SHA=/^[a-f0-9]{64}$/u;
const names=Object.freeze({
 basic_focused:"BASIC_FOCUSED",
 standard:"STANDARD",
 complex_full:"COMPLEX_FULL",
});
export function productActivationTriggers(product,{tier,verifiedGro=null,archiveProof=null,
 history=[],now=Date.now()}={}){
 if(!Object.hasOwn(names,tier)||!product||!Number.isFinite(now))
  throw Error("RISK_GATE_ACTIVATION_TRIGGER_INPUT_INVALID");
 const ready=product.status==="READY";
 const freshObserved=tier==="basic_focused"&&
  (product.category_observations??[]).some(x=>x.observed_count>0)&&
  Array.isArray(product.signal_alerts)&&product.signal_alerts.length>0;
 const categorySigned=verifiedGro?.verification?.status==="VERIFIED"&&
  verifiedGro?.commercial_eligibility?.status==="VERIFIED"&&
  Array.isArray(verifiedGro?.attribution)&&
  ["conflict","sanctions","political_instability","trade_policy"].some(
   d=>verifiedGro.attribution.some(x=>x.driver===d))&&
  ["monetary_policy","inflation","labor_market","currency_fx","macro_stress"].some(
   d=>verifiedGro.attribution.some(x=>x.driver===d))&&
  ["critical_minerals","rare_earth_supply"].some(
   d=>verifiedGro.attribution.some(x=>x.driver===d));
 const groFresh=Boolean(verifiedGro)&&
  Number.isFinite(Date.parse(verifiedGro.generated_at))&&
  Number.isFinite(Date.parse(verifiedGro.expires_at))&&
  Date.parse(verifiedGro.generated_at)<=now&&Date.parse(verifiedGro.expires_at)>now;
 const groSignature=groFresh&&verifiedGro.integrity?.signature_scheme==="Ed25519"&&
  SHA.test(verifiedGro.integrity?.payload_hash??"")&&
  typeof verifiedGro.integrity?.signature==="string"&&
  verifiedGro.integrity.signature.length>=40;
 const archived=Boolean(archiveProof?.archive_readback_verified===1||
  archiveProof?.archive_readback_verified===true)&&
  Boolean(archiveProof?.archive_write_acknowledged===1||
   archiveProof?.archive_write_acknowledged===true)&&
  typeof archiveProof?.archive_key==="string"&&
  SHA.test(archiveProof.archive_sha256??"");
 const signedDays=history.filter(x=>x.proof_verified===true&&
  SHA.test(String(x.snapshot?.signed_gro_payload_sha256??""))&&
  Number.isFinite(x.snapshot?.verified_unified_risk_score)&&
  /^\d{4}-\d{2}-\d{2}$/.test(x.day_utc)).length;
 const conditions=tier==="basic_focused"?[
  ["FRESH_OBSERVATION_IN_LAST_24H",Boolean(freshObserved)],
 ]:tier==="standard"?[
  ["CURRENT_INDEPENDENT_CORROBORATION_OR_SIGNED_THREE_DOMAIN_GRO",
   ready&&product.independent_corroboration_verified===true],
 ]:[
  ["CURRENT_UNEXPIRED_GRO",groFresh],
  ["THREE_DOMAIN_VERIFIED_GRO",Boolean(categorySigned)],
  ["GRO_SIGNATURE_PRESENT_WITH_TRUSTED_INPUT",groSignature],
  ["EXACT_B2_ARCHIVE_READBACK",archived],
  ["SEVEN_SIGNED_DAILY_HISTORY",signedDays>=7],
 ];
 return Object.freeze({
  schema:"geomacro.risk-gate-activation-triggers.v1",
  tier:names[tier],
  state:ready?"ACTIVE":"WAITING_EVIDENCE",
  ready_now:ready,
  completed_conditions:conditions.filter(([,ok])=>ok).map(([id])=>id),
  pending_conditions:conditions.filter(([,ok])=>!ok).map(([id])=>id),
  signed_history_days_observed:Math.min(7,signedDays),
  signed_gro_expiry:groFresh?verifiedGro.expires_at:null,
  re_evaluate_on:RISK_GATE_EVIDENCE_EVENTS,
  source_discovery_does_not_verify_event:true,
  background_signing_separate_from_query_path:true,
  execution_authorized:false,payment_performed:false,
 });
}
