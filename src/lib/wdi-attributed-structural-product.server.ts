import { createHash } from "node:crypto";
import { canonicalRiskObjectJson } from "./risk-object-signing.server";
import { approvedWdiAttribution, isApprovedWdiAttribution,
  type WorldBankWdiIndicator } from "./world-bank-derived-attribution";
import { readB2CommercialSourceRights, type B2CommercialSourceRight } from "./b2-live.server";
import { readPinnedWdiAnnualStructuralPair } from "./on-demand-global-discovery.server";
import type { PrivateOfficialMacroChange } from "./on-demand-global-discovery.server";

/** Exact WDI source=2, two consecutive genuine annual observations, certified
 * rights and fixed CC BY 4.0 credit. No GRO/signature/payment authorization. */
export const WDI_STRUCTURAL_PRODUCT_SCHEMA =
  "geomacro.wdi-historical-structural-baseline.v1" as const;
const SHA=/^[a-f0-9]{64}$/u;
const sha=(v:unknown)=>createHash("sha256")
  .update(canonicalRiskObjectJson(v),"utf8").digest("hex");
export function certifiedWdiAttributionRights(rows:readonly B2CommercialSourceRight[]|null){
  if(!rows)return {eligible:false,reason:"WDI_RIGHTS_RECEIPT_UNAVAILABLE",receipt_sha256:null};
  const matches=rows.filter(x=>x.source_id==="world_bank_indicators");
  if(matches.length!==1)return {eligible:false,reason:"WDI_EXACT_SOURCE_NOT_CERTIFIED",receipt_sha256:null};
  const r=matches[0];
  if(r.certification_state!=="CERTIFIED" ||
     !["COMMERCIAL_OK","DERIVED_ONLY"].includes(r.commercial_usage_status??"") ||
     r.enabled_for_ingestion!==true ||
     r.enabled_for_commercial_signals!==true ||
     r.attribution_required!==true ||
     !/^CC[\s-]*BY[\s-]*4\.0(?:\b|$)/iu.test(r.licence_name??"") ||
     !["macro","macro_fx","macro-fx",null].includes(r.category))
    return {eligible:false,reason:"WDI_RIGHTS_CONTRACT_MISMATCH",receipt_sha256:null};
  return {eligible:true,reason:"WDI_EXACT_RIGHTS_CERTIFIED",receipt_sha256:sha(r)};
}
export type WdiStructuralProductInput={
  country_iso3:"CHN";
  indicator:WorldBankWdiIndicator;
  source_api_id:"2";
  pair:PrivateOfficialMacroChange;
  lastupdated:string;
  checked_at:string;
  query_plan_hash:string;
  rights_rows:readonly B2CommercialSourceRight[]|null;
  max_age_seconds:number;
};
export function buildAttributedWdiStructuralProduct(input:WdiStructuralProductInput){
  const rights=certifiedWdiAttributionRights(input.rights_rows);
  if(!rights.eligible)throw Error(rights.reason);
  if(input.country_iso3!=="CHN" ||
     !["FP.CPI.TOTL.ZG","NY.GDP.MKTP.KD.ZG"].includes(input.indicator) ||
     input.source_api_id!=="2" || !SHA.test(input.query_plan_hash))
    throw Error("WDI_SOURCE_SCOPE_MISMATCH");
  const now=Date.parse(input.checked_at);
  if(!Number.isFinite(now)||now>Date.now()+60_000 || now<0 ||
     !Number.isInteger(input.max_age_seconds) ||
     input.max_age_seconds<=0 || input.max_age_seconds>400*86_400)
    throw Error("WDI_REQUEST_CLOCK_OR_AGE_INVALID");
  if(!/^\d{4}-\d{2}-\d{2}$/u.test(input.lastupdated) ||
     !Number.isFinite(Date.parse(input.lastupdated+"T00:00:00Z")) ||
     new Date(input.lastupdated+"T00:00:00Z").toISOString().slice(0,10)!==input.lastupdated ||
     Date.parse(input.lastupdated+"T00:00:00Z")>now)
    throw Error("WDI_DATASET_CLOCK_INVALID");
  const p=input.pair;
  const latest=p.latest_observation_year,previous=p.previous_observation_year;
  if(p.country_iso3!==input.country_iso3 || p.indicator!==input.indicator ||
     !Number.isInteger(latest)||!Number.isInteger(previous) ||
     latest!==previous+1 || previous<1960 || latest>new Date(now).getUTCFullYear() ||
     [p.latest_annual_pct,p.previous_annual_pct,p.annual_rate_change_percentage_points]
       .some(x=>typeof x!=="number"||!Number.isFinite(x)||Math.abs(x)>10000) ||
     p.observation_type!=="ANNUAL_STRUCTURAL_NOT_CURRENT_NEWS" ||
     p.publisher_original_release_date_verified!==false ||
     p.derived_commercial_rights_verified!==false ||
     p.risk_score_verified!==false || p.paid_delivery_allowed!==false)
    throw Error("WDI_UNTRUSTED_ANNUAL_PAIR");
  const expectedObservationHash=createHash("sha256")
    .update(JSON.stringify([p.country_iso3,p.indicator,latest,p.latest_annual_pct,previous,p.previous_annual_pct]))
    .digest("hex");
  const delta=Math.round((p.latest_annual_pct-p.previous_annual_pct)*100000)/100000;
  if(p.source_observation_sha256!==expectedObservationHash ||
     delta!==p.annual_rate_change_percentage_points)
    throw Error("WDI_OBSERVATION_INTEGRITY_FAILURE");
  const periodEnd=Date.parse(latest+"-12-31T23:59:59Z");
  if(now<periodEnd || now-periodEnd>input.max_age_seconds*1000)
    throw Error("WDI_ANNUAL_REFERENCE_PERIOD_STALE");
  const label=input.indicator==="FP.CPI.TOTL.ZG"
    ?"consumer price inflation (annual %)":"real GDP growth (annual %)";
  const direction=delta>0?"increased":delta<0?"decreased":"was unchanged";
  const body={
    schema_version:WDI_STRUCTURAL_PRODUCT_SCHEMA,
    classification:"historical_structural_baseline" as const,
    country:{iso3:"CHN",name:"China"},
    indicator:{id:input.indicator,label,unit:"percent_per_year" as const,api_source:"WDI_SOURCE_2" as const},
    reference_periods:{previous_year:previous,latest_year:latest},
    observations:[
      {year:previous,annual_percent:p.previous_annual_pct},
      {year:latest,annual_percent:p.latest_annual_pct},
    ],
    calculated_change:{percentage_points:delta,direction:delta>0?"INCREASING":delta<0?"DECREASING":"UNCHANGED"},
    geomacro_finds:"Geomacro Finds: China's "+label+" "+direction+" by "+Math.abs(delta)+" percentage points from "+previous+" to "+latest+".",
    interpretation:"Difference between two official annual percentage rates. The data alone cannot identify the cause, establish a current event, or calculate a risk score.",
    uncertainty:{
      historical_not_current:true,
      revision_history_verified:false,
      revision_status:"API_SNAPSHOT_MAY_BE_REVISED",
      original_indicator_release_date_verified:false,
      last_wdi_dataset_update:input.lastupdated,
      reference_period_end:new Date(periodEnd).toISOString(),
      checked_at:input.checked_at,
      risk_score_available:false,
    },
    data_attribution:approvedWdiAttribution([input.indicator]),
    delivery_boundary:"DERIVED_STRUCTURAL_ONLY_NO_RAW_FEED" as const,
    raw_payload_delivered:false as const,
    gro_generated:false as const,
    payment_authorized:false as const,
  };
  return {...body,integrity:{
    canonicalization:"geomacro-canonical-json" as const,
    hash_scheme:"SHA-256" as const,
    payload_hash_sha256:sha(body),
    signature_status:"UNSIGNED_NOT_A_GRO" as const,
  }};
}
export function assertAttributedWdiStructuralProduct(value:unknown){
  if(!value || typeof value!=="object" || Array.isArray(value))throw Error("WDI_PRODUCT_INVALID");
  const v=value as ReturnType<typeof buildAttributedWdiStructuralProduct>;
  if(v.schema_version!==WDI_STRUCTURAL_PRODUCT_SCHEMA ||
     !isApprovedWdiAttribution(v.data_attribution) ||
     v.data_attribution.material_uris.length!==1 ||
     v.data_attribution.material_uris[0]!==
       "https://data.worldbank.org/indicator/"+v.indicator?.id ||
     v.classification!=="historical_structural_baseline" ||
     v.raw_payload_delivered!==false || v.gro_generated!==false ||
     v.payment_authorized!==false ||
     v.integrity?.signature_status!=="UNSIGNED_NOT_A_GRO" ||
     !SHA.test(v.integrity.payload_hash_sha256))
    throw Error("WDI_PRODUCT_BOUNDARY_INVALID");
  const {integrity,...body}=v;
  if(sha(body)!==integrity.payload_hash_sha256)
    throw Error("WDI_PRODUCT_INTEGRITY_MISMATCH");
}


/** Operator/zero-money preparation adapter. No payment gate is opened here.
 * Reuse exactly one official World Bank retrieval and the existing B2 rights
 * snapshot. A static issuer review never substitutes for an actual receipt.
 */
export async function preparePinnedChinaWdiStructuralNoFunds(
  input:{query_plan_hash:string;max_age_seconds:number;
    indicator?:"FP.CPI.TOTL.ZG"|"NY.GDP.MKTP.KD.ZG"},
  options:{
    now?:Date;
    fetchImpl?:typeof fetch;
    readRights?:()=>Promise<B2CommercialSourceRight[]|null>;
    readPair?:typeof readPinnedWdiAnnualStructuralPair;
  }={},
):Promise<{status:"READY_FOR_PRODUCT_INTEGRATION";product:ReturnType<
    typeof buildAttributedWdiStructuralProduct>;rights_receipt_sha256:string}|
    {status:"BLOCKED";code:string}>{
  const now=options.now??new Date();
  if(!SHA.test(input.query_plan_hash) || !Number.isFinite(now.getTime()) ||
     !Number.isInteger(input.max_age_seconds) ||
     input.max_age_seconds<=0 || input.max_age_seconds>400*86400)
    return {status:"BLOCKED",code:"WDI_REQUEST_SCOPE_UNSUPPORTED"};
  const indicator=input.indicator??"FP.CPI.TOTL.ZG";
  try {
    const data=await (options.readPair??readPinnedWdiAnnualStructuralPair)(
      "CHN",indicator,{now,fetchImpl:options.fetchImpl});
    if(data.status!=="VALID_ANNUAL_CHANGE" || data.source_api_id!=="2" ||
       !data.pair || !data.lastupdated)
      return {status:"BLOCKED",code:"WDI_OFFICIAL_SOURCE2_PAIR_UNAVAILABLE"};
    const rights=await (options.readRights??readB2CommercialSourceRights)();
    const receipt=certifiedWdiAttributionRights(rights);
    if(!receipt.eligible || !receipt.receipt_sha256)
      return {status:"BLOCKED",code:receipt.reason};
    const product=buildAttributedWdiStructuralProduct({
      country_iso3:"CHN",indicator,source_api_id:"2",
      pair:data.pair,lastupdated:data.lastupdated,
      checked_at:now.toISOString(),query_plan_hash:input.query_plan_hash,
      max_age_seconds:input.max_age_seconds,rights_rows:rights,
    });
    assertAttributedWdiStructuralProduct(product);
    return {status:"READY_FOR_PRODUCT_INTEGRATION",product,
      rights_receipt_sha256:receipt.receipt_sha256};
  } catch {
    return {status:"BLOCKED",code:"WDI_SOURCE_RIGHTS_OR_INTEGRITY_NOT_VERIFIED"};
  }
}
