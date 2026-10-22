// Outside-in *actual deployed* Geomacro country-specific annual Macro delivery.
// No GitHub token, x402, B2, D1 write, Supabase, or source credentials.
// Healthy source transport is insufficient: require real reference-year
// observations and customer HTTP readback with no false current-news claims.
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {mkdirSync,writeFileSync} from "node:fs";

export const SAMPLES=Object.freeze(["IND","USA"]); // bounded, non-exhaustive
const PATH="/api/v1/intelligence/live-structured";
const MAX_BYTES=24_000;
function boundedReason(status) {
 if(status===429)return "PUBLIC_API_RATE_LIMITED";
 if(status===503)return "PUBLIC_API_OR_SOURCE_UNAVAILABLE";
 if(status===422)return "NO_COUNTRY_OFFICIAL_REFERENCE_AVAILABLE";
 if(status===404)return "PUBLIC_API_DEPLOYMENT_MISSING";
 return "PUBLIC_API_HTTP_OR_CONTRACT_INVALID";
}
export function inspectCountryAnnualResponse(input,{
  httpStatus,body,now=new Date()
}={}){
 const bad=(reason)=>({country_iso3:input.country_iso3,
   accepted:false,reason,official_reference_periods:[],
   customer_chargeable:false});
 if(httpStatus!==200)return bad(boundedReason(httpStatus));
 if(!body||typeof body!=="object"||Array.isArray(body)||
    body.schema!=="geomacro.live-structured.v1"||
    body.status!=="OFFICIAL_ANNUAL_REFERENCE_FETCHED"||
    body.category!=="macro-fx"||
    body.country_iso3!==input.country_iso3||
    body.source_mode!=="WORLD_BANK_WDI_SOURCE_2"||
    body.coverage!=="COUNTRY_OFFICIAL_ANNUAL_REFERENCE_ONLY_NOT_CURRENT_NEWS"||
    body.source_period_is_not_retrieval_time!==true||
    body.original_publication_time_verified!==false||
    body.payment_required!==false||body.chargeable!==false||
    body.settlement_performed!==false||body.durable_storage_written!==false||
    body.signed_gro_required!==false||body.signature!==null||body.score!==null||
    body.raw_upstream_delivered!==false||
    body.source_commercial_rights_verified!==false)
    return bad("COUNTRY_REFERENCE_CONTRACT_INVALID");
 const checked=Date.parse(body.checked_at),sourceChecked=Date.parse(body.source_checked_at);
 if(!Number.isFinite(checked)||!Number.isFinite(sourceChecked)||
    checked>now.getTime()+2*60_000||sourceChecked>now.getTime()+2*60_000||
    now.getTime()-checked>10*60_000||now.getTime()-sourceChecked>10*60_000)
    return bad("COUNTRY_REFERENCE_DELIVERY_CLOCK_INVALID");
 const rows=body.observations;
 if(!Array.isArray(rows)||rows.length===0||rows.length>2||
    body.observation_count!==rows.length)
    return bad("COUNTRY_REFERENCE_OBSERVATION_COUNT_INVALID");
 const ids=new Set(),years=[];
 for(const row of rows){
  if(!row||typeof row!=="object"||
    !["FP.CPI.TOTL.ZG","NY.GDP.MKTP.KD.ZG"].includes(row.kind)||
    ids.has(row.kind)||row.clock_semantics!=="reference_year"||
    typeof row.observation_period!=="string"||
    !/^(?:19|20)\d{2}$/.test(row.observation_period)||
    Number(row.observation_period)>now.getUTCFullYear()||
    Number(row.observation_period)<now.getUTCFullYear()-12||
    row.original_event_time_verified!==false||
    row.score!==null||
    row.source_rights_scope!=="WDI_SOURCE_2_CC_BY_4_0"||
    typeof row.finding!=="string"||
    row.finding.length<20||!row.finding.includes("%")||
    row.finding.includes("https://")||
    typeof row.attribution!=="string"||
    !row.attribution.includes("World Bank"))
    return bad("COUNTRY_REFERENCE_OBSERVATION_SCOPE_INVALID");
  ids.add(row.kind);years.push(row.observation_period);
 }
 return {country_iso3:input.country_iso3,
   accepted:true,reason:null,observations:rows.length,
   official_reference_periods:years,customer_chargeable:false,
   publication_time_not_assumed_from_fetch:true};
}
async function smallResponse(response){
 const header=Number(response.headers.get("content-length")??0);
 if(header>MAX_BYTES)throw Error("BODY_OVERSIZE");
 const reader=response.body?.getReader();
 if(!reader)throw Error("EMPTY_BODY");
 let count=0;const parts=[];
 try{for(;;){
  const {value,done}=await reader.read();if(done)break;
  count+=value.byteLength;
  if(count>MAX_BYTES)throw Error("BODY_OVERSIZE");
  parts.push(value);
 }}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 const data=new Uint8Array(count);let at=0;
 for(const part of parts){data.set(part,at);at+=part.byteLength;}
 return JSON.parse(new TextDecoder("utf8",{fatal:true}).decode(data));
}
export async function probeProductionCountryMacro({
 fetchImpl=fetch,now=new Date(),base="https://geomacro.live",samples=SAMPLES
}={}){
 if(!Number.isFinite(now.getTime())||base!=="https://geomacro.live"||
    !Array.isArray(samples)||samples.length===0||samples.length>2||
    samples.some(x=>!SAMPLES.includes(x)))
    throw Error("LIVE_COUNTRY_MACRO_ACCEPTANCE_SCOPE_INVALID");
 const results=[];
 for(const iso3 of samples){
  const input={category:"macro-fx",country_iso3:iso3};
  try{
   const response=await fetchImpl(base+PATH,{
     method:"POST",
     headers:{"Content-Type":"application/json","Accept":"application/json"},
     body:JSON.stringify(input),
     redirect:"error",cache:"no-store",signal:AbortSignal.timeout(35_000)
   });
   const body=await smallResponse(response);
   results.push(inspectCountryAnnualResponse(input,{
      httpStatus:response.status,body,now
   }));
  }catch(error){
   results.push({country_iso3:iso3,accepted:false,
    reason:error?.name==="TimeoutError"?"PUBLIC_API_TIMEOUT":
      "PUBLIC_API_FETCH_OR_JSON_UNAVAILABLE",
    official_reference_periods:[],customer_chargeable:false});
  }
 }
 const accepted=results.filter(x=>x.accepted).length;
 return {schema:"geomacro.country-macro-actual-production-readback.v1",
   checked_at:now.toISOString(),method:"POST",countries_checked:samples.length,
   accepted_countries:accepted,
   status:accepted===samples.length?"PRODUCTION_ANNUAL_READBACK_ACCEPTED":
     "PRODUCTION_DATA_DELIVERY_UNVERIFIED",
   195_country_route_configuration_not_195_observations:true,
   country_category_cells_proved:samples.length,
   claim_all_585_live_verified:false,
   signed_products_unaffected:true,
   public_deployment_sha_verified_separately:true,
   source_license_for_paid_delivery_unverified:true,
   upstream_or_raw_payload_logged:false,
   payment_attempted:false,results};
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    process.env.GITHUB_REF!=="refs/heads/main"||
    !/^\d{1,20}$/.test(process.env.GITHUB_RUN_ID??""))
   throw Error("LIVE_COUNTRY_MACRO_PROTECTED_MAIN_REQUIRED");
 const receipt=await probeProductionCountryMacro();
 mkdirSync("artifacts/live-country-macro",{recursive:true,mode:0o700});
 writeFileSync("artifacts/live-country-macro/production-readback.json",
   JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify({status:receipt.status,countries_checked:receipt.countries_checked,
  accepted_countries:receipt.accepted_countries,
  result_codes:receipt.results.map(x=>({iso3:x.country_iso3,reason:x.reason??"OK"})),
  paid_eligibility_verified:false,mainnet_payments:0}));
 if(receipt.accepted_countries!==receipt.countries_checked)process.exitCode=3;
}
