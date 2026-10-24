/*
 * Exact-period macro REFERENCE alternatives after IMF/OECD access denial.
 * These are non-equivalent statistical series with their OWN native issuers.
 * World Bank WDI real GDP growth is not an IMF WEO revision, and BLS
 * unemployment uses the US 16+ CPS rather than OECD's 15+ harmonization.
 * No fresh original-news clock, signing, product promotion or rights grant.
 * 2 bounded, credential-free GETs, attempted only for failed primaries.
 */
export const MACRO_OFFICIAL_REFERENCE_ALTERNATES=Object.freeze({
 wdi_ind_growth:"https://api.worldbank.org/v2/country/IND/indicator/NY.GDP.MKTP.KD.ZG?format=json&source=2&date=2024%3A2025&per_page=10",
 bls_usa_unemployment:"https://api.bls.gov/publicAPI/v1/timeseries/data/LNS14000000",
});
const MAX_BYTES=256*1024;
async function officialJson(url,fetchImpl){
 let response;
 try{response=await fetchImpl(url,{
  method:"GET",redirect:"error",signal:AbortSignal.timeout(12000),
  headers:{accept:"application/json",
    "user-agent":"Geomacro-Noncommercial-Official-Reference/1.0"},
 });}catch{throw Error("ALT_TRANSPORT_DENIED");}
 if(!response||response.ok!==true||response.status!==200){
  const status=response?.status;
  try{await response?.body?.cancel();}catch{}
  if([401,403,429].includes(status))throw Error("ALT_DENIED_OR_QUOTA");
  throw Error("ALT_HTTP_UNAVAILABLE");
 }
 if(response.redirected===true||(response.url&&response.url!==url))
  throw Error("ALT_REDIRECT_DENIED");
 if(!/^application\/json(?:;|$)/iu.test(response.headers?.get("content-type")??""))
  throw Error("ALT_MIME_INVALID");
 const length=response.headers?.get("content-length");
 if(length!=null&&(!/^\d{1,7}$/u.test(length)||Number(length)>MAX_BYTES))
  throw Error("ALT_BODY_LIMIT");
 if(!response.body)throw Error("ALT_BODY_MISSING");
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{for(;;){
  const {done,value}=await reader.read();if(done)break;
  size+=value.byteLength;if(size>MAX_BYTES)throw Error("ALT_BODY_LIMIT");
  chunks.push(Buffer.from(value));
 }}catch(e){
  if(e?.message==="ALT_BODY_LIMIT")throw e;
  throw Error("ALT_BODY_UNREADABLE");
 }finally{
  try{await reader.cancel();}catch{}
  reader.releaseLock();
 }
 let parsed;
 try{parsed=JSON.parse(new TextDecoder("utf-8",{fatal:true})
   .decode(Buffer.concat(chunks)));}catch{throw Error("ALT_JSON_INVALID");}
 return parsed;
}
export function extractWdiIndiaGrowth(data){
 if(!Array.isArray(data)||data.length!==2||
  !Array.isArray(data[1])||data[1].length>10||
  Number(data[0]?.page)!==1||Number(data[0]?.pages)!==1||
  Number(data[0]?.total)!==data[1].length)
  throw Error("ALT_WDI_SHAPE_INVALID");
 const seen=new Map();
 for(const row of data[1]){
  if(row?.countryiso3code!=="IND"||
     row?.indicator?.id!=="NY.GDP.MKTP.KD.ZG"||
     !["2024","2025"].includes(row?.date))
   throw Error("ALT_WDI_ISSUER_SCOPE_INVALID");
  if(seen.has(row.date))throw Error("ALT_WDI_DUPLICATE");
  if(typeof row.value!=="number"||!Number.isFinite(row.value))
   throw Error("ALT_WDI_OBSERVATION_INVALID");
  seen.set(row.date,row.value);
 }
 if(!seen.size)throw Error("ALT_WDI_OBSERVATION_MISSING");
 return {source_id:"world_bank_wdi",country_iso3:"IND",
  indicator:"NY.GDP.MKTP.KD.ZG",
  reference_periods:[...seen.keys()].sort(),
  frequency:"annual",series_kind:"REAL_GDP_GROWTH",
  source_methodology_equivalent_to_imf:false,
  original_published_at:null,native_release_time_verified:false,
  commercial_rights_attested:false,paid_eligible:false};
}
export function extractBlsUsUnemployment(data){
 if(data?.status!=="REQUEST_SUCCEEDED"||
    !Array.isArray(data?.Results?.series)||
    data.Results.series.length!==1||
    data.Results.series[0]?.seriesID!=="LNS14000000"||
    !Array.isArray(data.Results.series[0].data)||
    data.Results.series[0].data.length>60)
   throw Error("ALT_BLS_SHAPE_INVALID");
 const periods=data.Results.series[0].data.filter(x=>
  x?.year==="2025"&&x?.period==="M06"&&x?.periodName==="June"&&
  typeof x?.value==="string"&&/^(?:\d{1,2})(?:\.\d{1,2})?$/u.test(x.value));
 if(periods.length!==1)throw Error("ALT_BLS_EXACT_PERIOD_UNVERIFIED");
 const rate=Number(periods[0].value);
 if(!Number.isFinite(rate)||rate<0||rate>100)
  throw Error("ALT_BLS_OBSERVATION_INVALID");
 return {source_id:"us_bls_cps",country_iso3:"USA",
  indicator:"LNS14000000",reference_period:"2025-06",
  frequency:"monthly",series_kind:"CPS_SEASONALLY_ADJUSTED_UNEMPLOYMENT_RATE",
  age_population:"16_PLUS",unit:"percent",
  harmonization_equivalent_to_oecd:false,
  original_published_at:null,native_release_time_verified:false,
  commercial_rights_attested:false,paid_eligible:false};
}
export async function fetchWdiIndiaGrowth({fetchImpl=fetch}={}){
 return extractWdiIndiaGrowth(await officialJson(
  MACRO_OFFICIAL_REFERENCE_ALTERNATES.wdi_ind_growth,fetchImpl));
}
export async function fetchBlsUsUnemployment({fetchImpl=fetch}={}){
 return extractBlsUsUnemployment(await officialJson(
  MACRO_OFFICIAL_REFERENCE_ALTERNATES.bls_usa_unemployment,fetchImpl));
}
