#!/usr/bin/env node
/**
 * Source-neutral, no-funds, one-GET public readback of the canonical D1
 * control-plane projection. A source-code/CI success alone is not live proof.
 * Scheduled inside the EXISTING bundled intake runner; no separate cron.
 */
const PUBLIC_MACRO_URL="https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/macro-fastlane";
const ISO_DAY=/^\d{4}-\d{2}-\d{2}$/u;
const MAX_FX_AGE=8*86400000;
const MAX_PRICE_AGE=5*60000;
export function assessMacroPublicSnapshot(value,now=Date.now()){
 const base={schema:"geomacro.macro-production-readback.v1",
  checked_at:new Date(now).toISOString(),d1_public_projection_received:false,
  ecb_reference:"NOT_OBSERVED",metals:{XAU:"NOT_OBSERVED",XAG:"NOT_OBSERVED"},
  verified_live_fx_quote:false,verified_exchange_tick:false,
  complete:false};
 if(!value||value.schema!=="geomacro.macro-fastlane-public.v1"||
    value.category!=="macro"||!Array.isArray(value.prices)||value.prices.length>2)
  return {...base,reason:"INVALID_PUBLIC_PROJECTION"};
 const result={...base,d1_public_projection_received:true};
 const fx=value.fx_reference;
 const day=typeof fx?.reference_date==="string"&&ISO_DAY.test(fx.reference_date)
  ?Date.parse(fx.reference_date+"T00:00:00Z"):NaN;
 if(fx&&fx.provider==="ECB_DAILY_REFERENCE"&&fx.base==="EUR"&&
    fx.intraday_live_verified===false&&fx.transaction_price===false&&
    Number.isFinite(day)&&new Date(day).toISOString().slice(0,10)===fx.reference_date&&
    day<=now&&now-day<=MAX_FX_AGE&&Array.isArray(fx.rates)&&
    ["USD","GBP","JPY"].every((currency,i)=>fx.rates[i]?.currency===currency&&
    Number.isFinite(fx.rates[i]?.per_eur)&&fx.rates[i].per_eur>0)){
   result.ecb_reference="SOURCE_DATED_D1_READBACK";
   result.ecb_reference_date=fx.reference_date;
 }
 for(const q of value.prices){
  const instrument=q?.instrument;
  if(!["XAU/USD","XAG/USD"].includes(instrument))continue;
  const symbol=instrument.slice(0,3);
  const stamp=Date.parse(q.observed_at);
  if(q.currency==="USD"&&q.unit==="troy_ounce"&&
     q.quote_kind==="provider_spot_indication"&&
     q.exchange_tick_verified===false&&q.provider_latency_verified===false&&
     Number.isFinite(q.value)&&q.value>0&&Number.isFinite(stamp)&&
     stamp<=now&&now-stamp<=MAX_PRICE_AGE){
    result.metals[symbol]="SOURCE_DATED_D1_READBACK";
    result.metals[symbol+"_observed_at"]=q.observed_at;
  }
 }
 result.complete=result.ecb_reference==="SOURCE_DATED_D1_READBACK"&&
   result.metals.XAU==="SOURCE_DATED_D1_READBACK"&&
   result.metals.XAG==="SOURCE_DATED_D1_READBACK";
 return result;
}
export async function readMacroPublicSnapshot({fetchImpl=fetch,now=Date.now()}={}){
 let response;
 try{
  response=await fetchImpl(PUBLIC_MACRO_URL,{method:"GET",
   redirect:"error",headers:{accept:"application/json","cache-control":"no-cache"},
   signal:AbortSignal.timeout(8000)});
 }catch{return {schema:"geomacro.macro-production-readback.v1",
   checked_at:new Date(now).toISOString(),d1_public_projection_received:false,
   reason:"PUBLIC_MACRO_TRANSPORT_UNAVAILABLE",complete:false};}
 if(!response.ok)return {schema:"geomacro.macro-production-readback.v1",
   checked_at:new Date(now).toISOString(),d1_public_projection_received:false,
   reason:"PUBLIC_MACRO_HTTP_"+response.status,complete:false};
 let body;
 try{body=await response.json();}catch{
  return {schema:"geomacro.macro-production-readback.v1",
   checked_at:new Date(now).toISOString(),d1_public_projection_received:false,
   reason:"PUBLIC_MACRO_JSON_INVALID",complete:false};}
 return assessMacroPublicSnapshot(body,now);
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href){
 const report=await readMacroPublicSnapshot();
 console.log(JSON.stringify(report));
 if(report.d1_public_projection_received!==true)process.exitCode=2;
 else if(!report.complete)console.log("::warning::MACRO_FX_METALS_PARTIAL_D1_READBACK; source date, provider state, or market closure can explain missing current indications.");
}
