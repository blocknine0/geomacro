/**
 * Progressive three-price decision projection. Only response assembly;
 * never upgrades an unproven tier, mints a risk score or charges.
 */
import {RISK_GATE_PRODUCT_TIERS} from "./risk-gate-three-tier-product.mjs";
export const PROGRESSIVE_GATE_SCHEMA="geomacro.risk-gate-progressive-state.v1";
const ORDER=Object.freeze(["basic_focused","standard","complex_full"]);
const LABELS=Object.freeze({basic_focused:"DISCOVERY_BASIC",
 standard:"STANDARD_CORROBORATED",complex_full:"COMPLEX_INSTITUTIONAL"});
export function buildProgressiveGateState({subject,requestedTier,products,
 now=Date.now(),policyDecision="GATE_INSUFFICIENT_EVIDENCE"}={}){
 if(!subject||!["COUNTRY","CORRIDOR"].includes(subject.type)||
  typeof subject.id!=="string"||!Object.hasOwn(RISK_GATE_PRODUCT_TIERS,requestedTier)||
  !Number.isFinite(now)||!products||ORDER.some(t=>!products[t]||
   products[t].tier!==RISK_GATE_PRODUCT_TIERS[t].tier))
  throw Error("PROGRESSIVE_RISK_GATE_INPUT_INVALID");
 const requested=ORDER.indexOf(requestedTier);
 const available=ORDER.slice(0,requested+1).filter(t=>products[t].status==="READY");
 const served=available.at(-1)??null;
 const chosen=served?products[served]:null;
 const matrix={};
 for(const tier of ORDER){
  const row=products[tier],unlock=row.activation_triggers;
  const name=tier==="basic_focused"?"discovery_basic_0_10":
   tier==="standard"?"standard_corroborated_0_15":"complex_institutional_0_25";
  matrix[name]={
   status:row.status==="READY"?"ACTIVE":
    tier==="complex_full"?"LOCKED":"PENDING",
   price_usd:RISK_GATE_PRODUCT_TIERS[tier].usd_per_call,
   missing_requirements:unlock?.pending_conditions??[],
   category_triggers:unlock?.category_triggers??[],
   activation_evidence_complete:row.status==="READY",
   signed_gro_required:tier==="complex_full",
  };
 }
 return Object.freeze({
  schema:PROGRESSIVE_GATE_SCHEMA,service:"GeoMacro Risk Gate Engine",
  subject:{type:subject.type.toLowerCase(),id:subject.id},
  requested_tier:LABELS[requestedTier],served_tier:served?LABELS[served]:null,
  downgraded:served!==null&&served!==requestedTier,
  current_evaluation:{
   active_tier:served?LABELS[served]:"NO_QUALIFIED_TIER",
   chargeable_amount_usd:chosen?.price?.usd_per_call??null,
   // "chargeable" is product eligibility only; actual billing is offline.
   product_chargeable:chosen?.chargeable===true,
   charged:false,payment_performed:false,
   unified_risk_score:chosen?.risk_score_0_100??null,
   score_basis:chosen?.risk_score_kind??"NO_EVIDENCE_NO_SCORE",
   confidence_grade:chosen?.confidence?.verification??"NOT_READY",
   advisory_only:true,decision:served==="complex_full"?
    policyDecision:"REQUIRE_APPROVAL",
   execution_authorized:false,
  },
  tier_activation_matrix:matrix,
  evidence_refresh:"AUTONOMOUS_BACKGROUND_AND_EACH_AUTHENTICATED_EVALUATION",
  evaluated_at:new Date(now).toISOString(),
  signed_event_truth_claim:false,commercial_activation:false,
 });
}
