#!/usr/bin/env node
/**
 * One official Brazilian Central Bank SGS monthly IPCA observation.
 * Owner-only source-availability health, NOT commercial source qualification.
 * No raw publisher bytes/customer data/logged original URL, D1/B2, payment,
 * current publication/event timestamp or rights promotion.
 */
const BCB_IPCA_433="https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/3?formato=json";
const MAX_BYTES=48_000;
const DAY=86_400_000;
const monthKey=(year,month)=>year+"-"+String(month).padStart(2,"0");
const validClock=(date,now)=>{
  if(typeof date!=="string"||!/^(?:0[1-9]|[12][0-9]|3[01])\/(?:0[1-9]|1[0-2])\/20[0-9]{2}$/u.test(date))return null;
  const [dd,mm,yy]=date.split("/").map(Number);
  // A BCB SGS monthly value's date is only a REFERENCE month, not
  // the original report-release UTC timestamp.
  if(dd!==1)return null;
  const month=monthKey(yy,mm);
  const start=Date.parse(month+"-01T00:00:00Z");
  if(!Number.isFinite(start)||new Date(start).toISOString().slice(0,7)!==month||
     start>now.getTime()||now.getTime()-start>400*DAY)return null;
  return {month,ms:start};
};
export function summarizeBcbIpcaMonthly(payload,now=new Date()){
  if(!Number.isFinite(now.getTime())||!Array.isArray(payload)||
     payload.length<1||payload.length>3)throw Error("BCB_IPCA_PAYLOAD_UNVERIFIED");
  let latest=null;const seen=new Set();
  for(const row of payload){
    if(!row||typeof row!=="object"||Object.keys(row).sort().join(",")!=="data,valor"||
       typeof row.valor!=="string"||!/^[-+]?[0-9]{1,2}(?:\.[0-9]{1,4})?$/u.test(row.valor))
      throw Error("BCB_IPCA_PAYLOAD_UNVERIFIED");
    const clock=validClock(row.data,now);
    const value=Number(row.valor);
    if(!clock||!Number.isFinite(value)||value< -15||value>30||
       seen.has(clock.month))throw Error("BCB_IPCA_CLOCK_OR_SERIES_UNVERIFIED");
    seen.add(clock.month);
    if(!latest||clock.ms>latest.ms)latest=clock;
  }
  return {
    source_id:"brazil_bcb_sgs_433_official_candidate_only",
    country_iso3:"BRA",category:"macro-fx",
    series:"BCB_SGS_433_IPCA_MONTHLY",
    status:"OFFICIAL_MONTHLY_REFERENCE_PERIOD_OBSERVED_NOT_COMMERCIAL",
    latest_reference_month:latest.month,
    observations_with_valid_native_reference_month:seen.size,
    original_article_publication_clock_verified:false,
    economic_observation_is_current_release_news:false,
    source_specific_commercial_rights_approved:false,
    canonical_store_available:false,
    continuous_macro_country_news_verified:false,
    monetization_or_x402_eligible:false,
    upstream_raw_value_logged:false,
  };
}
export async function probeBcbIpca({fetchImpl=fetch,now=new Date()}={}){
  const base={
    schema:"geomacro.brazil-bcb-ipca-433-original-series-probe.v1",
    checked_at:now.toISOString(),country_iso3:"BRA",category:"macro-fx",
    source_family:"BRA_BCB_SGS_433",
    source_request_budget:1,source_requests_attempted:1,
    official_native_release_time_verified:false,
    data_licence_review_required:true,commercial_data_eligible:false,
    raw_payloads_persisted:false,qualified_news_created:false,
    d1_writes:0,b2_requests:0,payments:0,predge_modified:false,
  };
  try{
    const r=await fetchImpl(BCB_IPCA_433,{method:"GET",redirect:"error",
      signal:AbortSignal.timeout(8000),headers:{Accept:"application/json"}});
    if(!r.ok||r.status!==200||
       Number(r.headers.get("content-length")||0)>MAX_BYTES)
      throw Error("BCB_IPCA_UPSTREAM_UNAVAILABLE");
    const content=await r.text();
    if(Buffer.byteLength(content,"utf8")>MAX_BYTES)
      throw Error("BCB_IPCA_SOURCE_TOO_LARGE");
    const parsed=summarizeBcbIpcaMonthly(JSON.parse(content),now);
    return {...base,status:parsed.status,
      latest_reference_month:parsed.latest_reference_month,
      valid_months:parsed.observations_with_valid_native_reference_month,
      source_native_reference_period_verified:true};
  }catch{
    return {...base,status:"OFFICIAL_IPCA_SOURCE_UNAVAILABLE_OR_UNVERIFIED",
      latest_reference_month:null,valid_months:0,
      source_native_reference_period_verified:false};
  }
}
if(process.argv[1]?.endsWith("/probe-brazil-bcb-ipca-original.mjs")){
  const receipt=await probeBcbIpca();
  console.log(JSON.stringify(receipt));
  // A legitimate provider refusal stays unavailable, never an eligible event.
}
