// Read-only actual UN Comtrade annual mineral trade observation for three major
// mineral jurisdictions, alongside the full canonical reporter catalogue census.
// An official reporter entry is NOT a numerical value or fresh news event.
import {readFileSync} from "node:fs";
import {fetchComtradeReporterCatalog,fetchComtrade} from "../../global-intelligence/adapters/un-comtrade.mjs";

export const MINERAL_TRADE_SENTINELS=Object.freeze([
  Object.freeze({iso3:"CHN",commodity:"260500",label:"cobalt_ores"}),
  Object.freeze({iso3:"IDN",commodity:"260400",label:"nickel_ores"}),
  Object.freeze({iso3:"CHL",commodity:"260300",label:"copper_ores"})
]);
function canonical195(source=readFileSync("src/lib/canonical-country-registry-195.ts","utf8")){
  const match=/const COUNTRY_ROWS=\x60([^\x60]{1,10000})\x60;/u.exec(source);
  if(!match)throw Error("COMTRADE_CANONICAL_REGISTRY_INVALID");
  const rows=match[1].trim().split("\n"),codes=new Set();
  for(const row of rows){
    const parts=row.split("|");
    if(parts.length!==3||!/^[A-Z]{3}$/u.test(parts[0])||
      codes.has(parts[0]))throw Error("COMTRADE_CANONICAL_REGISTRY_INVALID");
    codes.add(parts[0]);
  }
  if(codes.size!==195||!codes.has("PSE")||!codes.has("VAT"))
    throw Error("COMTRADE_CANONICAL_REGISTRY_INVALID");
  return codes;
}
export function summarizeComtrade195Reporters(catalog,{registrySource}={}){
  const countries=canonical195(registrySource);
  if(!catalog||typeof catalog!=="object"||Array.isArray(catalog))
    throw Error("COMTRADE_OFFICIAL_CATALOG_SHAPE_INVALID");
  const valid=[],missing=[];
  for(const iso3 of [...countries].sort()){
    const code=catalog[iso3]?.code;
    if(Number.isSafeInteger(code)&&code>0&&code<=999)valid.push(iso3);
    else missing.push(iso3);
  }
  return {
    schema:"geomacro.comtrade-195-live-reporter-census.v1",
    provider:"un_comtrade",canonical_countries:195,
    official_reporter_codes_confirmed:valid.length,
    countries_missing_valid_reporter:missing.length,
    missing_reporter_iso3:missing,
    reporter_identity_is_actual_trade_measurement:false,
    has_all_195_reporter_codes:missing.length===0,
    verified_current_trade_observations:0,
    country_specific_mineral_news_verified:false,
    paid_use_permitted:false
  };
}
function validTradeRow(row,iso3,reporterCode,year,commodity){
  const r=row?.raw;
  if(!r||typeof r!=="object"||r.reporter_iso3!==iso3||
    r.reporter_code!==reporterCode||
    String(r.period)!==year||String(r.cmd_code)!==commodity||
    String(r.flow_code).toUpperCase()!=="X"||
    String(r.partner_code)!=="0"||
    r.evidence_type!=="TRADE_EXPORT"||
    r.preview_limited!==true||
    r.commercial_rights_verified!==false||
    r.hs_vintage_verified!==false||
    typeof r.trade_value!=="number"||
    !Number.isFinite(r.trade_value)||r.trade_value<0)return false;
  return true;
}
function fixedReason(error){
  const str=String(error?.message??"");
  if(/\b(?:401|403|429)\b/u.test(str))return "PROVIDER_DENIED_OR_QUOTA";
  if(error?.name==="TimeoutError"||error?.name==="AbortError")return "PROVIDER_TIMEOUT";
  if(str==="UN_COMTRADE_ROW_SCOPE_UNVERIFIED")return "DATA_SCOPE_UNVERIFIED";
  return "NETWORK_OR_SOURCE_SCHEMA_UNAVAILABLE";
}
export async function observeComtrade195Minerals({
  now=new Date(),registrySource,fetchCatalog=fetchComtradeReporterCatalog,
  fetchRows=fetchComtrade
}={}){
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))
    throw Error("COMTRADE_CLOCK_INVALID");
  const year=String(now.getUTCFullYear()-1);
  let sourceRequests=1,catalog;
  try{catalog=await fetchCatalog();}
  catch(error){
    return {
      schema:"geomacro.comtrade-195-actual-mineral-reference.v1",
      checked_at:now.toISOString(),year,
      catalog_status:"UNAVAILABLE",catalog_reason:fixedReason(error),
      source_requests_attempted:sourceRequests,
      reporter_census:null,observations:[],
      verified_annual_numeric_samples:0,
      no_key_public_preview_only:true,
      raw_provider_body_saved:false,
      live_incidents_verified:0,current_195x3_coverage_verified:false,
      rights_for_paid_output_verified:false,
      d1_writes:0,b2_requests:0,supabase_requests:0,payments:0
    };
  }
  const census=summarizeComtrade195Reporters(catalog,{registrySource});
  const observations=[];
  for(const target of MINERAL_TRADE_SENTINELS){
    const reporter=catalog[target.iso3]?.code;
    if(!Number.isSafeInteger(reporter)||reporter<=0){
      observations.push({country_iso3:target.iso3,commodity:target.label,
        reference_year:Number(year),status:"NO_CURRENT_OFFICIAL_REPORTER"});
      continue;
    }
    sourceRequests++;
    try{
      // No key or paid subscription is supplied by this observer. One
      // officially documented no-key preview GET per commodity/jurisdiction.
      const rows=await fetchRows(target.iso3,{
        reporterCode:reporter,period:year,cmdCode:target.commodity,
        flowCode:"X",partnerCode:"0",category:"CRITICAL_MINERALS",
        allowPreview:true,maxRecords:25
      });
      const good=Array.isArray(rows)&&rows.length===1&&
        validTradeRow(rows[0],target.iso3,reporter,year,target.commodity);
      observations.push({
        country_iso3:target.iso3,commodity:target.label,
        hs_code:target.commodity,reference_year:Number(year),
        status:good?"ACTUAL_ANNUAL_EXPORT_VALUE_OBSERVED":
          "NO_UNAMBIGUOUS_NUMERIC_OBSERVATION",
        // Official numeric fact is retained only in a three-day PRIVATE
        // operator receipt; never to a public source/news endpoint or paid
        // product without a separately accepted licence and publication.
        normalized_reported_trade_value_usd:good?rows[0].raw.trade_value:null,
        temporal_class:"ANNUAL_REFERENCE_NOT_CURRENT_NEWS",
        publisher_native_release_timestamp_verified:false,
        commodity_hs_vintage_verified:false,customer_delivery_eligible:false
      });
    }catch(error){
      observations.push({country_iso3:target.iso3,commodity:target.label,
        hs_code:target.commodity,reference_year:Number(year),
        status:"UNAVAILABLE",reason:fixedReason(error)});
    }
  }
  return {
    schema:"geomacro.comtrade-195-actual-mineral-reference.v1",
    checked_at:now.toISOString(),year,
    catalog_status:"OFFICIAL_CATALOG_RESPONDED",
    source_requests_attempted:sourceRequests,reporter_census:census,
    observations,verified_annual_numeric_samples:observations.filter(x=>
      x.status==="ACTUAL_ANNUAL_EXPORT_VALUE_OBSERVED").length,
    no_key_public_preview_only:true,raw_provider_body_saved:false,
    live_incidents_verified:0,current_195x3_coverage_verified:false,
    rights_for_paid_output_verified:false,
    d1_writes:0,b2_requests:0,supabase_requests:0,payments:0
  };
}
