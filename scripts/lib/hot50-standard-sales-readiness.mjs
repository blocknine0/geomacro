/**
 * No-funds Standard Risk Gate supply/readiness report. This never manufactures
 * an eligible event, sales receipt, verified signed GRO, or customer payment.
 *
 * 150/day is the owner's commercial *target*, not a daily API cap nor evidence
 * that demand, checkout, signer or delivery throughput has been demonstrated.
 */
import {RISK_GATE_HOT50} from "../../workers/control-plane/src/risk-gate-hot50-scope.mjs";
import {HOT50_CATEGORY_KEYS} from "./hot50-production-proof.mjs";

export const STANDARD_DELIVERIES_PER_UTC_DAY_TARGET=150;
const STATES=new Set(["VERIFIED_SIGNED_GRO","OBSERVED_UNVERIFIED","NO_VERIFIED_SIGNAL"]);
const HOT=new Set(RISK_GATE_HOT50);
const CATEGORIES=HOT50_CATEGORY_KEYS;

/**
 * A full 50-country audit contains three checked tiers/country. A scheduled
 * one-country sample is NEVER extrapolated to Hot50 or daily sales.
 * No provider credentials, source identities, payment records or raw text.
 */
export function summarizeHot50StandardSalesReadiness({ids,receipts,full=false,now=Date.now()}={}){
 if(!Array.isArray(ids)||ids.length<1||ids.length>50||
    new Set(ids).size!==ids.length||ids.some(x=>!HOT.has(x))||
    (full&&ids.length!==50)||
    !Array.isArray(receipts)||receipts.length!==ids.length*3||
    !Number.isFinite(now)||typeof full!=="boolean")
  throw Error("HOT50_STANDARD_READINESS_INPUT_INVALID");
 const grouped=new Map();
 for(const r of receipts){
  if(!r||!HOT.has(r.country_iso3)||!ids.includes(r.country_iso3)||
     !["basic_focused","standard","complex_full"].includes(r.tier))
    throw Error("HOT50_STANDARD_READINESS_RECEIPT_INVALID");
  const key=r.country_iso3+"|"+r.tier;
  if(grouped.has(key))throw Error("HOT50_STANDARD_READINESS_DUPLICATE_TIER");
  grouped.set(key,r);
 }
 const missing=[],qualified=[],signedHighAssurance=[];
 const categoryGaps=Object.fromEntries(CATEGORIES.map(c=>[c,0]));
 for(const country of ids){
  for(const tier of ["basic_focused","standard","complex_full"])
   if(!grouped.has(country+"|"+tier))
    throw Error("HOT50_STANDARD_READINESS_MISSING_TIER");
  const r=grouped.get(country+"|standard");
  const contractValid=r.contract_valid===true;
  const serviceReady=contractValid&&r.ready===true;
  if(serviceReady)qualified.push(country);
  if(serviceReady&&r.verified_current_three_category===true)
   signedHighAssurance.push(country);
  for(const category of CATEGORIES){
   const status=r.category_statuses?.[category];
   // If the response is invalid, explicitly count the proof as missing.
   if(!contractValid||!STATES.has(status)||status!=="VERIFIED_SIGNED_GRO"){
    categoryGaps[category]++;
    missing.push({country_iso3:country,category,
      state:contractValid&&STATES.has(status)?status:"INVALID_OR_MISSING"});
   }
  }
 }
 const actuallyPaid=null; // The protected settlement ledger must supply this separately.
 return Object.freeze({
  schema:"geomacro.hot50-standard-150day-readiness.v1",
  generated_at:new Date(now).toISOString(),
  scope:"HOT50",categories:[...CATEGORIES],
  target_successful_paid_standard_deliveries_per_utc_day:STANDARD_DELIVERIES_PER_UTC_DAY_TARGET,
  target_average_paid_deliveries_per_hour:STANDARD_DELIVERIES_PER_UTC_DAY_TARGET/24,
  target_inter_delivery_minutes:24*60/STANDARD_DELIVERIES_PER_UTC_DAY_TARGET,
  target_is_not_a_request_cap:true,
  target_is_not_a_sales_prediction:true,
  standard_price_and_merchant_activation_unchanged:true,
  source_transport_is_not_verified_event:true,
  actual_successful_paid_standard_deliveries_today:actuallyPaid,
  measured_sustained_paid_standard_delivery_capacity_per_day:null,
  paid_150_daily_target_verified:false,
  full_hot50_census:full,countries_checked:ids.length,
  country_category_cells_checked:ids.length*CATEGORIES.length,
  standard_product_ready_countries:qualified.length,
  standard_product_ready_country_ids:qualified,
  signed_three_category_high_assurance_countries:signedHighAssurance.length,
  signed_three_category_high_assurance_country_ids:signedHighAssurance,
  category_signed_evidence_gaps:categoryGaps,
  missing_signed_country_category_cells:missing.length,
  prioritized_missing_category_cells:missing,
  supply_diagnostic:!full?"SAMPLED_NOT_CERTIFIED":
    missing.length===0&&qualified.length===50?"HOT50_ALL_STANDARD_PROFILES_READY":
    "STANDARD_QUALIFICATION_GAPS_REMAIN",
  activation_or_settlement_performed:false,
  proof_does_not_override_independent_corrob_or_gro_signing:true,
 });
}
