// World Bank WDI no-key two-indicator country-wide bulk reference audit.
// 1 upstream request for the existing fixed 195-country routing universe.
// Latest completed calendar year only to halve the WDI payload after a live
// 12-second bulk timeout. Annual years are NOT live FX/risk event times.
import {readFileSync} from "node:fs";
export const WORLD_BANK_WDI_BULK_ENDPOINT="https://api.worldbank.org/v2/country/all/indicator/FP.CPI.TOTL.ZG;NY.GDP.MKTP.KD.ZG";
export const WORLD_BANK_WDI_INDICATORS=Object.freeze(["FP.CPI.TOTL.ZG","NY.GDP.MKTP.KD.ZG"]);
const MAX_BYTES=512*1024;
function country195Map(source=readFileSync("src/lib/canonical-country-registry-195.ts","utf8")){
 const match=/const COUNTRY_ROWS=\x60([^\x60]{1,10000})\x60;/u.exec(source);
 if(!match)throw Error("WDI_COUNTRY_CANON_INVALID");
 const rows=match[1].trim().split("\n");
 if(rows.length!==195)throw Error("WDI_COUNTRY_CANON_INVALID");
 const codes=new Set();
 for(const row of rows){
   const parts=row.split("|");
   if(parts.length!==3||!/^[A-Z]{3}$/u.test(parts[0])||
      !/^[A-Z]{2}$/u.test(parts[1])||codes.has(parts[0]))
     throw Error("WDI_COUNTRY_CANON_INVALID");
   codes.add(parts[0]);
 }
 if(!codes.has("VAT")||!codes.has("PSE")||codes.has("TWN"))
   throw Error("WDI_COUNTRY_CANON_INVALID");
 return codes;
}
export function wdiBulkQueryUrl(now=new Date()){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error("WDI_CLOCK_INVALID");
 const year=now.getUTCFullYear();
 const url=new URL(WORLD_BANK_WDI_BULK_ENDPOINT);
 url.searchParams.set("format","json");
 url.searchParams.set("source","2");
 url.searchParams.set("date",String(year-1));
 url.searchParams.set("per_page","700");
 url.searchParams.set("page","1");
 return url.href;
}
export function summarizeWorldBank195Batch(data,{now=new Date(),registrySource}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error("WDI_CLOCK_INVALID");
 const codes=country195Map(registrySource);
 if(!Array.isArray(data)||data.length!==2||typeof data[0]!=="object"||
    !Array.isArray(data[1])||data[1].length>700||
    Number(data[0]?.pages)!==1||Number(data[0]?.page)!==1||
    Number(data[0]?.total)!==data[1].length)
    throw Error("WDI_BULK_PAGINATION_OR_SHAPE_UNVERIFIED");
 const nowYear=now.getUTCFullYear();
 const yearFloor=nowYear-1;
 const present=new Map(WORLD_BANK_WDI_INDICATORS.map(id=>[id,new Map()]));
 let ignored=0;
 for(const row of data[1]){
   const code=row?.countryiso3code,indicator=row?.indicator?.id;
   if(!codes.has(code)||!present.has(indicator)){ignored++;continue;}
   const year=Number(row?.date);
   if(!/^\d{4}$/u.test(String(row?.date))||year!==yearFloor){
     ignored++;continue;
   }
   if(row.value===null)continue;
   if(typeof row.value!=="number"||!Number.isFinite(row.value)){
     ignored++;continue;
   }
   const byCountry=present.get(indicator),old=byCountry.get(code);
   if(old===undefined || year>old)byCountry.set(code,year);
 }
 const countryResults=[...codes].sort().map(iso3=>{
   const observations=Object.fromEntries(WORLD_BANK_WDI_INDICATORS.map(id=>[
     id,present.get(id).get(iso3)??null
   ]));
   return {iso3,latest_available_observation_year:observations,
      current_real_time_macro_or_fx_verified:false};
 });
 return {
   schema:"geomacro.wdi-195-two-indicator-reference-audit.v1",
   source_family:"world_bank_wdi",checked_at:now.toISOString(),
   iso3_routing_universe_count:195,source_page_count:1,source_calls:1,
   metadata_only:true,
   observation_year_floor:yearFloor,observation_year_ceiling:yearFloor,
   indicators:WORLD_BANK_WDI_INDICATORS.map(id=>({
     id,canonical_countries_with_recent_nonnull_values:present.get(id).size,
     canonical_countries_without_recent_values:195-present.get(id).size
   })),
   non_canonical_or_invalid_rows_ignored:ignored,
   per_country_reference_availability:countryResults,
   realtime_fx_quotes_verified:false,
   macroeconomic_release_time_verified:false,
   all_195_macro_countries_current:false,
   source_licence_for_paid_derived_output_reviewed:false,
   paid_delivery_enabled:false,raw_provider_data_stored:false,
   supabase_requests:0,d1_writes:0,b2_requests:0,payments:0
 };
}
async function boundedJson(response){
 if([401,403,429].includes(response.status))throw Error("WDI_DENIED_OR_QUOTA");
 if(!response.ok)throw Error("WDI_HTTP_UNAVAILABLE");
 if(Number(response.headers.get("content-length")||0)>MAX_BYTES)throw Error("WDI_BODY_LIMIT");
 if(!response.body)throw Error("WDI_BODY_EMPTY");
 let bytes=0;const parts=[],reader=response.body.getReader();
 try{for(;;){const {done,value}=await reader.read();if(done)break;
  bytes+=value.length;if(bytes>MAX_BYTES)throw Error("WDI_BODY_LIMIT");
  parts.push(value);
 }}finally{try{await reader.cancel()}catch{}reader.releaseLock();}
 const b=new Uint8Array(bytes);let offset=0;
 for(const p of parts){b.set(p,offset);offset+=p.length}
 try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(b))}
 catch{throw Error("WDI_JSON_UNVERIFIED")}
}
export async function observeWorldBank195({fetchImpl=fetch,now=new Date(),registrySource}={}){
 const url=wdiBulkQueryUrl(now);
 const response=await fetchImpl(url,{method:"GET",redirect:"error",
   headers:{accept:"application/json"},signal:AbortSignal.timeout(12000)});
 const body=await boundedJson(response);
 return summarizeWorldBank195Batch(body,{now,registrySource});
}
