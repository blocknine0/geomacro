/**
 * GeoMacro original five-part interpretation of source-grounded observations.
 * Corridor research ONLY. This file MUST NOT import public news, PREDGE, GRO
 * signer, paid checkout, or customer delivery. No provider copy is output.
 *
 * Never infer direction/trend/event date/causation from a single observation.
 * Raw publisher content is transient and never stored here.
 */
import {createHash} from "node:crypto";
import {directGlobalCorridorRouteSources} from "./direct-global-corridor-sources.mjs";
const SOURCES=new Map(directGlobalCorridorRouteSources().map(s=>[s.id,{
 name:s.name,url:s.url
}]));
SOURCES.set("imf_portwatch",{name:"IMF PortWatch",
 url:"https://portwatch.imf.org/"});
const POLICY=Object.freeze({
 world_bank_wdi:"DATASET_LICENSE_VERIFY_ATTRIBUTION",
 eurostat_data:"PUBLIC_STATISTICAL_REUSE_ATTRIBUTION",
 fred_api:"THIRD_PARTY_SERIES_AND_AI_RIGHTS_REVIEW",
 imf_portwatch:"IMF_DATASET_SPECIFIC_COMMERCIAL_REVIEW",
 gdelt_v2_15m:"EVENT_BATCH_INDEX_NOT_EVENT_EVIDENCE",
 reliefweb_v2:"ORIGINAL_PUBLISHER_RIGHTS_REVIEW",
 cryptocompare_news:"PROVIDER_ACCESS_AND_DERIVED_RIGHTS_REVIEW",
 ecb_data:"ECB_DATASET_REUSE_TERMS_REVIEW"
});
const DEFINITIONS=Object.freeze({
 gdelt_export_batch_bytes:{
  unit:"bytes of publisher-indexed batch file",
  meaning:"An event batch was indexed by GDELT; the byte count is not the number of independently verified events.",
  market:"Index availability alone does not establish price direction or a corridor disruption.",
  watch:"Fetch and independently validate permitted event evidence before drawing any geopolitical inference."
 },
 gdelt_gkg_batch_bytes:{
  unit:"bytes of publisher-indexed batch file",
  meaning:"A GDELT GKG batch was indexed. File size is an ingestion-health indicator, not a measure of risk.",
  market:"No market effect can be determined from batch file size alone.",
  watch:"Compare future ingestion completeness and verify original publisher evidence."
 },
 gdelt_mentions_batch_bytes:{
  unit:"bytes of publisher-indexed batch file",
  meaning:"A GDELT mentions batch was indexed; the byte count is not an event or severity score.",
  market:"Mention volume or data transport size alone cannot establish a market-moving event.",
  watch:"Require independent source and actual event details before assessing impacts."
 },
 ecb_usd_eur_spot:{
  unit:"EUR per USD (check source series direction)",
  meaning:"A single ECB exchange-rate reference observation provides an FX level, not an explanation for why it moved.",
  market:"Exchange-rate exposure can affect cross-border trade and settlement; impact direction is not inferred from one point.",
  watch:"Compare successive independently dated rate observations and the official monetary-policy releases."
 },
 eurostat_ea20_hicp_annual_pct:{
  unit:"percent (source-series configuration must be checked)",
  meaning:"A Eurostat HICP statistical observation is a periodic inflation reference, not a breaking corridor event.",
  market:"Inflation can shape macro expectations; no specific market reaction is demonstrated here.",
  watch:"Monitor the next Eurostat release, revisions and corroborating central-bank communications."
 },
 fred_dgs10_yield_percent:{
  unit:"percent per annum",
  meaning:"A published US 10-year Treasury yield observation is an interest-rate level, not a verified causal event.",
  market:"Long-term yields inform financing and discount-rate risk, but no particular trade impact is inferred.",
  watch:"Monitor the next official close and check source-series reuse/AI permissions."
 },
 fred_wti_usd_per_barrel:{
  unit:"USD per barrel",
  meaning:"A published WTI crude-oil price observation provides a commodity reference, not evidence of a shipping disruption.",
  market:"Energy costs can influence transport economics; the value alone does not prove a disruption or price shock.",
  watch:"Check sequential benchmark data and independently verified port/shipping developments."
 },
 reliefweb_native_24h_reports_sample_count:{
  unit:"sampled reports",
  meaning:"The sample contains reports with a reported native date within the past 24 hours. This is not independently verified event incidence.",
  market:"Humanitarian reporting can signal areas for further geopolitical research, without proving a market impact.",
  watch:"Identify originating publishers and verify dates, locations and factual claims."
 },
 cryptocompare_24h_news_sample_count:{
  unit:"unique items in bounded API sample",
  meaning:"A source API returned a sample count of recent news records; this is not the total news universe.",
  market:"Article count does not establish the direction or magnitude of crypto/FX markets.",
  watch:"Independently inspect original reports and check provider restrictions before any downstream analysis."
 },
 portwatch_daily_transit_pct_change:{
  unit:"percent day-on-day",
  meaning:"An IMF PortWatch daily maritime flow percentage-change observation is a provisional activity signal, not an independently certified blockade.",
  market:"Shipping flow changes may influence corridor exposure; causation, vessel mix and commercial effects require separate evidence.",
  watch:"Compare later source-native daily counts, reporting lag, and independent route advisories."
 }
});
const URLS=Object.freeze({
 imf_portwatch:"https://portwatch.imf.org/",
 gdelt_v2_15m:"https://data.gdeltproject.org/gdeltv2/lastupdate.txt",
 world_bank_wdi:"https://api.worldbank.org/v2/",
 ecb_data:"https://data.ecb.europa.eu/",
 eurostat_data:"https://ec.europa.eu/eurostat/",
 fred_api:"https://fred.stlouisfed.org/",
 reliefweb_v2:"https://reliefweb.int/",
 cryptocompare_news:"https://www.cryptocompare.com/"
});
const sha=s=>createHash("sha256").update(s).digest("hex");
function configFor(row){
 if(row.source_id==="world_bank_wdi"&&
   /^wdi_gdp_growth_(us|cn|in|de|gb)$/u.test(row.metric_id)){
  return {
   unit:"annual percent",
   meaning:"A World Bank GDP growth figure is a country-level annual economic reference, not a corridor event.",
   market:"GDP growth can inform demand and exposure baselines; it cannot by itself prove a bilateral freight impact.",
   watch:"Compare the same country's subsequent official vintages and revisions."
  };
 }
 return DEFINITIONS[row.metric_id]??null;
}
function allowedRow(row,checkedAt){
 const source=SOURCES.get(row?.source_id);
 const originalUrl=URLS[row?.source_id]??source?.url;
 if(!source||!configFor(row)||!originalUrl||
  typeof row.id!=="string"||!/^[a-f0-9]{64}$/u.test(row.id)||
  typeof row.observation_period!=="string"||row.observation_period.length>32||
  typeof row.numeric_value!=="number"||!Number.isFinite(row.numeric_value)||
  typeof row.observed_at!=="string"||!Number.isFinite(Date.parse(row.observed_at))||
  Math.abs(Date.parse(checkedAt)-Date.parse(row.observed_at))>15*60000||
  !Array.isArray(row.corridor_ids)||row.corridor_ids.length>6||
  row.corridor_ids.some(id=>typeof id!=="string"||!/^[a-z_]{3,45}$/u.test(id))||
  row.source_observation_is_not_live_event!==true||
  row.context_only!==true||row.independently_verified_event!==false||
  row.commercial_rights_verified!==false||row.customer_delivery_enabled!==false)
  throw Error("CORRIDOR_DERIVED_SOURCE_PROVENANCE_INVALID");
 return {source,originalUrl,definition:configFor(row)};
}
function structuralAnalysis(row,checkedAt){
 const {source,originalUrl,definition}=allowedRow(row,checkedAt);
 const referenceValue=Number(row.numeric_value.toPrecision(8));
 const impact=row.source_id==="imf_portwatch"&&row.corridor_ids.length>0?
  "Route: "+row.corridor_ids.join(", ")+". "+definition.market:definition.market;
 return Object.freeze({
  id:sha("geomacro.corridor-private-structured-research.v1\x1f"+row.id),
  channel:"CORRIDOR_ONLY",analysis_kind:"PRIVATE_SOURCE_GROUNDED_RESEARCH",
  source_reference_id:row.id,source_id:row.source_id,
  source_name:source.name,source_url:originalUrl,
  observation_period:row.observation_period,
  source_observed_at:row.observed_at,analysis_at:checkedAt,
  metric_id:row.metric_id,metric_value:referenceValue,unit:definition.unit,
  candidate_corridor_ids:row.corridor_ids.slice(),
  what_happened:"The source reported "+row.metric_id+" = "+String(referenceValue)+
    " ("+definition.unit+") for "+row.observation_period+
    ". This is a reported observation, not an independently established event.",
  why_it_matters:definition.meaning,
  market_relevance:impact,
  what_to_watch:definition.watch,
  evidence_and_confidence:{
   evidence_type:"FIRST_PARTY_DATED_METRIC_OR_SOURCE_INDEX",
   source_name:source.name,source_url:originalUrl,
   period:row.observation_period,
   source_native_publication_time_verified:false,
   observation_retrieval_time:row.observed_at,
   independent_event_corroboration:false,
   causality_verified:false,
   source_specific_reuse_review:POLICY[row.source_id]??"PERMISSION_REVIEW_REQUIRED",
   confidence:"SOURCE_METADATA_ONLY",
   commercial_permission_confirmed:false
  },
  interpretation_is_automated:true,
  verified_news_event:false,signed_gro:false,
  commercial_eligible:false,customer_delivery_authorized:false,
  website_intelligence_writes:0,predge_writes:0
 });
}
export function buildPrivateCorridorStructuredResearch({
 sourceReceipt, checkedAt=sourceReceipt?.checked_at
}={}){
 if(sourceReceipt?.channel!=="CORRIDOR_ONLY"||
    !/^\d{4}-\d{2}-\d{2}T/u.test(checkedAt??"")||
    !Number.isFinite(Date.parse(checkedAt))||
    !Array.isArray(sourceReceipt.official_reference_observations)||
    sourceReceipt.official_reference_observations.length>65||
    !Number.isInteger(sourceReceipt.news_candidate_count)||
    sourceReceipt.news_candidate_count<0||sourceReceipt.news_candidate_count>160)
  throw Error("CORRIDOR_DERIVED_INPUT_INVALID");
 const seen=new Set(),analysis=[];
 for(const row of sourceReceipt.official_reference_observations){
  const item=structuralAnalysis(row,checkedAt);
  if(seen.has(item.source_reference_id))
    throw Error("CORRIDOR_DERIVED_DUPLICATE_SOURCE_REFERENCE");
  seen.add(item.source_reference_id);analysis.push(item);
 }
 return Object.freeze({
  schema:"geomacro.corridor-private-structured-research.v1",
  channel:"CORRIDOR_ONLY",generated_at:checkedAt,
  structured_record_count:analysis.length,
  structured_records:analysis,
  source_article_candidates_not_converted:sourceReceipt.news_candidate_count,
  reason_unconverted:"Article candidates only contain source links/time/hash; no verified article event evidence or licensed text.",
  raw_article_text_persisted:false,
  raw_api_response_persisted:false,
  independent_event_evidence_verified:false,
  commercial_eligible:false,customer_delivery_authorized:false,
  signed_gro_generated:false,
  website_intelligence_writes:0,predge_writes:0,
  retention_hours:72
 });
}
