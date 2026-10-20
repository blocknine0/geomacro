// IMF DataMapper anonymous statistical reference gap audit for canonical 195.
// WEO outputs may be ACTUAL, ESTIMATED or FORECAST; the API response alone
// does not certify these classifications. NEVER feed this into live risk/paid.
import {readFileSync} from "node:fs";
export const IMF_GAP_INDICATORS=Object.freeze([
  Object.freeze({imf:"NGDP_RPCH",wdi:"NY.GDP.MKTP.KD.ZG",label:"real_gdp_growth"}),
  Object.freeze({imf:"PCPIPCH",wdi:"FP.CPI.TOTL.ZG",label:"consumer_price_inflation"})
]);
const IMF_BASE="https://www.imf.org/external/datamapper/api/v1/";
const LIMIT=256*1024;
export function imfCanonical195(source=readFileSync("src/lib/canonical-country-registry-195.ts","utf8")){
 const match=/const COUNTRY_ROWS=\x60([^\x60]{1,10000})\x60;/u.exec(source);
 if(!match)throw Error("IMF_COUNTRY_REGISTRY_INVALID");
 const rows=match[1].trim().split("\n");
 if(rows.length!==195)throw Error("IMF_COUNTRY_REGISTRY_INVALID");
 const iso3=rows.map(x=>x.split("|")[0]);
 const unique=new Set(iso3);
 if(unique.size!==195||!unique.has("PSE")||!unique.has("VAT")||
    iso3.some(x=>!/^[A-Z]{3}$/u.test(x)))throw Error("IMF_COUNTRY_REGISTRY_INVALID");
 return unique;
}
export function imfPeriodUrl(indicator,now=new Date()){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error("IMF_CLOCK_INVALID");
 if(!IMF_GAP_INDICATORS.some(x=>x.imf===indicator))throw Error("IMF_INDICATOR_NOT_ALLOWED");
 const u=new URL(indicator,IMF_BASE);
 u.searchParams.set("periods",String(now.getUTCFullYear()-1));
 return u.href;
}
export function inspectImfDataMapper195(body,indicator,{now=new Date(),registrySource}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error("IMF_CLOCK_INVALID");
 const allowed=IMF_GAP_INDICATORS.find(x=>x.imf===indicator);
 if(!allowed)throw Error("IMF_INDICATOR_NOT_ALLOWED");
 const universe=imfCanonical195(registrySource);
 if(!body||typeof body!=="object"||Array.isArray(body)||
    !body.values||typeof body.values!=="object"||
    !body.values[indicator]||typeof body.values[indicator]!=="object"||
    Array.isArray(body.values[indicator]))
   throw Error("IMF_VALUES_SCHEMA_INVALID");
 const year=String(now.getUTCFullYear()-1);
 const entries=Object.entries(body.values[indicator]);
 if(entries.length>320)throw Error("IMF_VALUES_OVERFLOW");
 const eligible=new Set();
 let rejected=0;
 for(const [country,years] of entries){
   if(!universe.has(country)||!years||typeof years!=="object"||
      Array.isArray(years)){rejected++;continue;}
   const number=years[year];
   if(typeof number==="number"&&Number.isFinite(number)){
     eligible.add(country);
   }else if(typeof number==="string"&&number.trim()!==""&&
            number.length<25&&Number.isFinite(Number(number))){
     eligible.add(country);
   }else{rejected++;}
 }
 return {
  schema:"geomacro.imf-195-annual-reference-gap.v1",
  source_family:"imf_datamapper_weo",publisher_family:"imf",
  indicator,aligned_wdi_indicator:allowed.wdi,
  reference_year:Number(year),countries_with_imf_reference:eligible.size,
  countries_missing_imf_reference:195-eligible.size,
  countries_with_imf_reference_iso3:[...eligible].sort(),
  invalid_or_aggregate_rows_ignored:rejected,
  source_observation_is_current_release:false,
  native_publication_datetime_verified:false,
  imf_actual_vs_estimate_vs_forecast_verified:false,
  imf_values_are_certified_observed_actuals:false,
  country_specific_rights_for_paid_derived_output_verified:false,
  signed_risk_generated:false,paid_delivery_enabled:false,
  raw_publisher_values_stored:false,
  external_requests:1,payments:0
 };
}
async function boundedJson(response){
 if([401,403,429].includes(response.status))throw Error("IMF_DENIED_OR_QUOTA");
 if(!response.ok)throw Error("IMF_HTTP_UNAVAILABLE");
 if(Number(response.headers.get("content-length")||0)>LIMIT)throw Error("IMF_BODY_LIMIT");
 if(!response.body)throw Error("IMF_BODY_EMPTY");
 const reader=response.body.getReader(),parts=[];let length=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;
  length+=value.byteLength;
  if(length>LIMIT)throw Error("IMF_BODY_LIMIT");
  parts.push(value);
 }}finally{try{await reader.cancel()}catch{}reader.releaseLock();}
 const result=new Uint8Array(length);let offset=0;
 for(const p of parts){result.set(p,offset);offset+=p.byteLength}
 try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(result))}
 catch{throw Error("IMF_JSON_INVALID")}
}
export async function observeImf195({fetchImpl=fetch,now=new Date(),registrySource}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error("IMF_CLOCK_INVALID");
 const rows=[];let attempted=0,publisherDenied=false;
 // Same publisher: once it denies access, never spend a second probe.
 for(const item of IMF_GAP_INDICATORS){
  if(publisherDenied){
   rows.push({schema:"geomacro.imf-195-annual-reference-gap.v1",
    source_family:"imf_datamapper_weo",indicator:item.imf,
    aligned_wdi_indicator:item.wdi,status:"UNVERIFIED_OR_UNAVAILABLE",
    reason:"IMF_PROVIDER_DENIED_HOLD",reference_year:now.getUTCFullYear()-1,
    countries_with_imf_reference:0,countries_missing_imf_reference:195,
    countries_with_imf_reference_iso3:[],imf_actual_vs_estimate_vs_forecast_verified:false,
    paid_delivery_enabled:false,raw_publisher_values_stored:false});
   continue;
  }
  attempted++;
  try{
   const response=await fetchImpl(imfPeriodUrl(item.imf,now),{
    method:"GET",redirect:"error",headers:{accept:"application/json"},
    signal:AbortSignal.timeout(14000)
   });
   rows.push(inspectImfDataMapper195(await boundedJson(response),item.imf,{now,registrySource}));
  }catch(error){
   const reason=String(error?.message??"");
   if(reason==="IMF_DENIED_OR_QUOTA")publisherDenied=true;
   rows.push({schema:"geomacro.imf-195-annual-reference-gap.v1",
    source_family:"imf_datamapper_weo",indicator:item.imf,
    aligned_wdi_indicator:item.wdi,
    status:"UNVERIFIED_OR_UNAVAILABLE",
    reason:/^IMF_[A-Z_]+$/u.test(reason)?reason:"IMF_NETWORK_UNAVAILABLE",
    reference_year:now.getUTCFullYear()-1,
    countries_with_imf_reference:0,countries_missing_imf_reference:195,
    countries_with_imf_reference_iso3:[],
    imf_actual_vs_estimate_vs_forecast_verified:false,
    paid_delivery_enabled:false,raw_publisher_values_stored:false});
  }
 }
 return {
  schema:"geomacro.imf-two-indicator-195-gap-reference.v1",
  checked_at:now.toISOString(),canonical_country_count:195,requests_attempted:attempted,
  source_family:"imf_datamapper_weo",indicators:rows,
  verified_indicator_transports:rows.filter(r=>r.status!=="UNVERIFIED_OR_UNAVAILABLE").length,
  current_realtime_macro_or_fx_verified:false,
  published_values_are_actual_not_forecast_verified:false,
  all_195_countries_with_current_live_macro_verified:false,
  aggregate_provider_groups_used_as_country_data:false,
  raw_source_values_stored:false,
  b2_requests:0,d1_writes:0,supabase_requests:0,payments:0
 };
}
export function compareWdiImfPresence(wdi,imf){
 if(!wdi||!imf||!Array.isArray(wdi.per_country_reference_availability)||
    !Array.isArray(imf.indicators))throw Error("IMF_WDI_COMPARISON_SHAPE_INVALID");
 const imfById=new Map(imf.indicators.map(x=>[x.aligned_wdi_indicator,x]));
 const out=[];
 const universe=imfCanonical195();
 for(const item of IMF_GAP_INDICATORS){
  const source=imfById.get(item.wdi);
  const imfSet=new Set(source?.countries_with_imf_reference_iso3??[]);
  const wdiSet=new Set(wdi.per_country_reference_availability.filter(x=>
    x?.latest_available_observation_year?.[item.wdi]!==null &&
    Number.isInteger(x?.latest_available_observation_year?.[item.wdi]))
      .map(x=>x.iso3));
  const union=[...universe].filter(x=>wdiSet.has(x)||imfSet.has(x));
  out.push({indicator:item.label,reference_year:imf.indicators[0]?.reference_year??null,
    wdi_annual_observation_presence:wdiSet.size,
    imf_weo_estimate_or_forecast_unclassified_presence:imfSet.size,
    country_reference_union_availability:union.length,
    imf_additional_reference_only_iso3:[...imfSet].filter(x=>!wdiSet.has(x)&&universe.has(x)).sort(),
    missing_reference_iso3:[...universe].filter(x=>!wdiSet.has(x)&&!imfSet.has(x)).sort(),
    distinct_source_type_classes:true,
    imf_reference_is_observed_actual_verified:false,
    union_is_fully_current_macro_verified:false});
 }
 return out;
}
