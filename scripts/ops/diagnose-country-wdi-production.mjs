// Independently read genuine WDI response metadata on the same GitHub runner
// that checks customer-facing annual Macro delivery. No raw provider values,
// source URI logging, wallet, paid API, Supabase, B2 or D1 writes.
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {mkdirSync,writeFileSync} from "node:fs";
const INDICATORS=new Set(["FP.CPI.TOTL.ZG","NY.GDP.MKTP.KD.ZG"]);
const SAMPLES=["IND","USA"];
const MAX_BYTES=256_000;
async function boundedJson(response){
 if(!response.ok||!response.body)throw Error("WDI_HTTP_UNAVAILABLE");
 const n=Number(response.headers.get("content-length")??0);
 if(n>MAX_BYTES)throw Error("WDI_BODY_OVERSIZE");
 const reader=response.body.getReader(),parts=[];let bytes=0;
 try{for(;;){
  const {value,done}=await reader.read();if(done)break;
  bytes+=value.byteLength;
  if(bytes>MAX_BYTES)throw Error("WDI_BODY_OVERSIZE");
  parts.push(value);
 }}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 const out=new Uint8Array(bytes);let i=0;
 for(const x of parts){out.set(x,i);i+=x.byteLength;}
 try{return JSON.parse(new TextDecoder("utf8",{fatal:true}).decode(out));}
 catch{throw Error("WDI_NON_JSON");}
}
export async function observeWdiDirectAcceptance({
 fetchImpl=fetch,now=new Date(),countries=SAMPLES
}={}){
 if(!Array.isArray(countries)||countries.length===0||countries.length>2||
    countries.some(x=>!SAMPLES.includes(x)))throw Error("WDI_PROBE_SCOPE_INVALID");
 const rows=[];
 for(const iso3 of countries){
  let response;
  try{
   const u=new URL("https://api.worldbank.org/v2/country/"+
     iso3.toLowerCase()+"/indicator/FP.CPI.TOTL.ZG;NY.GDP.MKTP.KD.ZG");
   for(const [k,v] of [["format","json"],["source","2"],["mrnev","2"],
     ["per_page","24"],["page","1"]])u.searchParams.set(k,v);
   response=await fetchImpl(u.href,{method:"GET",redirect:"error",
     headers:{Accept:"application/json"},signal:AbortSignal.timeout(18000)});
   const data=await boundedJson(response);
   if(!Array.isArray(data)||data.length!==2||!Array.isArray(data[1])) {
     rows.push({iso3,status:"WDI_RESPONSE_SHAPE_UNVERIFIED",http_status:response.status});
     continue;
   }
   const recognized=data[1].filter(r=>r?.countryiso3code===iso3&&
      INDICATORS.has(r?.indicator?.id)&&
      typeof r?.value==="number"&&Number.isFinite(r.value)&&
      typeof r.date==="string"&&/^(?:19|20)\d{2}$/.test(r.date)&&
      Number(r.date)<=now.getUTCFullYear()&&Number(r.date)>=now.getUTCFullYear()-12);
   rows.push({iso3,status:recognized.length?"DIRECT_WDI_ROWS_PRESENT":"DIRECT_WDI_NO_COUNTRY_MATCHING_NUMBERS",
     http_status:response.status,page:Number(data[0]?.page)||null,
     pages:Number(data[0]?.pages)||null,
     total:Number(data[0]?.total)||null,
     response_rows:data[1].length,
     native_iso3_rows:data[1].filter(r=>r?.countryiso3code===iso3).length,
     matching_official_numeric_rows:recognized.length,
     numeric_reference_years:[...new Set(recognized.map(r=>r.date))].sort().reverse(),
     response_has_invalid_country_code:data[1].some(r=>r?.countryiso3code!==iso3),
     original_publication_time_verified:false});
  }catch(e){
   rows.push({iso3,status:"DIRECT_WDI_SOURCE_UNAVAILABLE",
     reason:response&&[401,403,429].includes(response.status)
      ?"UPSTREAM_ACCESS_OR_QUOTA":e?.name==="TimeoutError"
       ?"UPSTREAM_TIMEOUT":"UPSTREAM_TRANSPORT_OR_JSON_INVALID"});
  }
 }
 return {schema:"geomacro.direct-195-country-wdi-live-probe.v1",
   checked_at:now.toISOString(),source:"WDI_SOURCE_2",
   country_requests:countries.length,
   working_country_references:rows.filter(r=>r.status==="DIRECT_WDI_ROWS_PRESENT").length,
   source_value_payloads_written:false,
   native_release_clock_unequivocally_verified:false,
   all_195_country_macro_coverage_verified:false,
   paid_delivery_enabled:false,upstream_raw_values_logged:false,payments:0,
   rows};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    process.env.GITHUB_REF!=="refs/heads/main"||
    !/^\d{1,20}$/.test(process.env.GITHUB_RUN_ID??""))
    throw Error("WDI_DIRECT_DIAGNOSTIC_PROTECTED_MAIN_REQUIRED");
 const receipt=await observeWdiDirectAcceptance();
 mkdirSync("artifacts/live-country-macro",{recursive:true,mode:0o700});
 writeFileSync("artifacts/live-country-macro/direct-official-wdi.json",
   JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify({schema:receipt.schema,
  working_country_references:receipt.working_country_references,
  country_readback_states:receipt.rows.map(x=>({iso3:x.iso3,status:x.status,
    http_status:x.http_status??null,
    matching_official_numeric_rows:x.matching_official_numeric_rows??0,
    reason:x.reason??null})),
  source_values_published:false,paid_output_enabled:false,payments:0}));
 if(receipt.working_country_references!==receipt.country_requests)process.exitCode=3;
}
