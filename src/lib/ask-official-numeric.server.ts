import {fetchWithoutRedirectUsing} from "./fetch-without-redirect";
import {resolveAskCountry} from "./ask-on-demand-original.server";
import type {HybridAskAnswer} from "./hybrid-ask-intelligence.server";
import {parseCsvRecords} from "../../global-intelligence/adapters/public-reference-extraction.mjs";

/** Finite, public, source-rights-reviewed numerical lanes. Not a tick/spot
 * feed, monthly CPI, risk score, or permission to redistribute raw datasets. */
const FX=new Set("EUR USD INR GBP JPY CNY CHF CAD AUD NZD BRL ZAR KRW SGD HKD SEK NOK DKK PLN CZK HUF RON BGN TRY ILS IDR MYR THB PHP MXN".split(" "));
type Plan={kind:"wdi";iso3:string;name:string;indicator:"FP.CPI.TOTL.ZG"|"NY.GDP.MKTP.KD.ZG"}|{kind:"fx";base:string;quote:string};
export function planAskOfficialNumeric(question:string):Plan|null{
 if(!question||question.length>300||/\b(forecast|predict|projection|intraday|executable|spot market|risk index|gri)\b/iu.test(question))return null;
 const codes=[...new Set([...question.matchAll(/\b[A-Z]{3}\b/gu)].map(x=>x[0]).filter(x=>FX.has(x)))];
 if(codes.length===2&&/\b(exchange|fx|rate|currency|convert|to)\b|[/]/iu.test(question))
   return {kind:"fx",base:codes[0],quote:codes[1]};
 if(codes.length)return null;
 const country=resolveAskCountry(question);
 if(!country)return null;
 const cpi=/\b(inflation|consumer prices?|cpi)\b/iu.test(question);
 const growth=/\b(gdp growth|economic growth)\b/iu.test(question);
 if(cpi===growth||!/\b(latest|current|annual|yearly|rate|value|what|how|figure|recent)\b/iu.test(question))return null;
 return {kind:"wdi",iso3:country.iso3,name:country.name,indicator:cpi?"FP.CPI.TOTL.ZG":"NY.GDP.MKTP.KD.ZG"};
}
async function bounded(url:string,accept:string,fetchImpl:typeof fetch,timeoutMs=6000):Promise<string>{
 const u=new URL(url);
 if(u.protocol!=="https:"||u.username||u.password||u.port||u.hash||
   !["api.worldbank.org","data-api.ecb.europa.eu"].includes(u.hostname))
   throw Error("ASK_OFFICIAL_NUMERIC_ORIGIN");
 // Cloudflare workerd rejects redirect:"error" before issuing the request.
 // The shared helper uses redirect:"manual" and rejects every 3xx, so this
 // restores official HTTPS reads without following an upstream redirect.
 const res=await fetchWithoutRedirectUsing(fetchImpl,url,{method:"GET",signal:AbortSignal.timeout(timeoutMs),
   headers:{Accept:accept}});
 if(!res.ok||!res.body)throw Error("ASK_OFFICIAL_NUMERIC_HTTP_"+res.status);
 if(Number(res.headers.get("content-length")??0)>256_000)throw Error("ASK_OFFICIAL_NUMERIC_SIZE");
 const reader=res.body.getReader();const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;
   size+=value.length;if(size>256_000)throw Error("ASK_OFFICIAL_NUMERIC_SIZE");chunks.push(value);}
 }finally{await reader.cancel().catch(()=>undefined);}
 const bytes=new Uint8Array(size);let i=0;for(const part of chunks){bytes.set(part,i);i+=part.length;}
 return new TextDecoder("utf-8",{fatal:true}).decode(bytes);
}
export function parseAnnualWdi(json:unknown,iso3:string,indicator:string,now=new Date()){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||!Array.isArray(json)||!Array.isArray(json[1]))return [];
 const rows:{year:string;value:number}[]=[];
 for(const row of json[1].slice(0,20)){
  if(!row||row.countryiso3code!==iso3||row.indicator?.id!==indicator||
     typeof row.date!=="string"||!/^(?:19|20)\d{2}$/u.test(row.date)||
     typeof row.value!=="number"||!Number.isFinite(row.value)||
     Number(row.date)>now.getUTCFullYear())continue;
  if(rows.every(x=>x.year!==row.date))rows.push({year:row.date,value:row.value});
 }
 return rows.sort((a,b)=>b.year.localeCompare(a.year)).slice(0,2);
}
export function parseEcbFix(text:string,currency:string,now=new Date()){
 if(currency==="EUR"||!FX.has(currency)||!(now instanceof Date)||!Number.isFinite(now.getTime()))return [];
 const rows=parseCsvRecords(text) as Array<Record<string,string>>;
 return rows.filter(x=>x.FREQ==="D"&&x.CURRENCY===currency&&
 x.CURRENCY_DENOM==="EUR"&&x.EXR_TYPE==="SP00"&&x.EXR_SUFFIX==="A"&&
 /^\d{4}-\d{2}-\d{2}$/u.test(x.TIME_PERIOD)&&
 Number.isFinite(Date.parse(x.TIME_PERIOD+"T00:00:00Z")) &&
 Date.parse(x.TIME_PERIOD+"T00:00:00Z")<=now.getTime() &&
 now.getTime()-Date.parse(x.TIME_PERIOD+"T00:00:00Z")<=14*86400_000 &&
 Number.isFinite(Number(x.OBS_VALUE))&&Number(x.OBS_VALUE)>0)
 .map(x=>({day:x.TIME_PERIOD,value:Number(x.OBS_VALUE)}))
 .sort((a,b)=>b.day.localeCompare(a.day)).slice(0,6);
}
const fmt=(n:number)=>Number(n.toPrecision(8)).toLocaleString("en-US",{maximumFractionDigits:6});
function result(now:Date,summary:string,what:string,why:string,view:string,period:string):HybridAskAnswer{
 return {summary,what_changed:what,why_it_matters:why,geomacro_view:view,
 evidence:[{eventId:"live:official:numeric",title:"Official period "+period,relevance:100}],
 insufficient_evidence:false,mean_relevance:null,low_confidence:false,gri:null,
 generatedAt:now.toISOString(),data_mode:"ephemeral_live",cache_status:"bypassed",
 source_identity_exposed:false,durable_live_storage_write:false,
 real_time_message:"Official numeric data checked on demand; period and retrieval are different clocks.",
 signed_gro_generated:false,independent_same_event_verification:false};
}
async function query(plan:Plan,now:Date,fetchImpl:typeof fetch):Promise<HybridAskAnswer|null>{
 if(plan.kind==="wdi"){
  const json=JSON.parse(await bounded("https://api.worldbank.org/v2/country/"+
   plan.iso3.toLowerCase()+"/indicator/"+plan.indicator+
   "?source=2&format=json&mrnev=3","application/json",fetchImpl,16000));
  const rows=parseAnnualWdi(json,plan.iso3,plan.indicator,now);
  if(!rows.length)throw Error("ASK_OFFICIAL_NUMERIC_NO_MATCHING_ROWS");
  const [latest,prior]=rows;
  const metric=plan.indicator==="FP.CPI.TOTL.ZG"?"consumer-price inflation":"GDP growth";
  return result(now,plan.name+"'s latest available ANNUAL "+metric+" is "+
   fmt(latest.value)+"% for "+latest.year+".",
   prior?"Compared with "+prior.year+" the annual rate changed "+
    fmt(latest.value-prior.value)+" percentage points.":"No previous comparable annual value available.",
   "The WDI series is ANNUAL, not today's/monthly CPI or an intraday economic release.",
   "World Bank, World Development Indicators (CC BY 4.0). Adapted annual comparison. "+
    "Reference year "+latest.year+"; retrieved "+now.toISOString()+".",latest.year);
 }
 const currencies=[...new Set([plan.base,plan.quote])].filter(x=>x!=="EUR");
 const data=await Promise.all(currencies.map(async currency=>({
  currency,rows:parseEcbFix(await bounded("https://data-api.ecb.europa.eu/service/data/EXR/D."+
   currency+".EUR.SP00.A?format=csvdata&lastNObservations=6","text/csv",fetchImpl),currency,now)
 })));
 const from=plan.base==="EUR"?null:data.find(x=>x.currency===plan.base)?.rows;
 const to=plan.quote==="EUR"?null:data.find(x=>x.currency===plan.quote)?.rows;
 const shared=(from??to??[]).find(row=>(!from||from.some(x=>x.day===row.day))&&
   (!to||to.some(x=>x.day===row.day)));
 if(!shared)throw Error("ASK_OFFICIAL_NUMERIC_NO_SHARED_DATE");
 const a=plan.base==="EUR"?1:from?.find(x=>x.day===shared.day)?.value;
 const b=plan.quote==="EUR"?1:to?.find(x=>x.day===shared.day)?.value;
 if(!a||!b)return null;
 const cross=b/a;
 if(!Number.isFinite(cross)||cross<=0)return null;
 return result(now,"ECB's latest available daily reference gives 1 "+plan.base+
   " = "+fmt(cross)+" "+plan.quote+" on "+shared.day+".",
   from&&to?"Calculated from EUR-based series for the exact SAME day; not a direct cross-market quote.":
     "Official euro foreign exchange reference rate.",
   "Reference fixes are not live executable FX prices.",
   "Source: ECB statistics. "+(from&&to?"Geomacro calculated a currency cross; original series unmodified.":"Original reference observation.")+
     " Retrieved "+now.toISOString()+".",shared.day);
}
const cache=new Map<string,{until:number;value:HybridAskAnswer}>();
const inFlight=new Map<string,Promise<HybridAskAnswer|null>>();
export async function answerOfficialNumeric(question:string,opts:{fetchImpl?:typeof fetch;now?:Date;noCache?:boolean;onFailure?:(code:string)=>void}={}):Promise<HybridAskAnswer|null>{
 const plan=planAskOfficialNumeric(question);if(!plan)return null;
 const key=JSON.stringify(plan),now=opts.now??new Date();
 if(!opts.noCache){
  const cached=cache.get(key);
  if(cached&&cached.until>now.getTime())return {...cached.value,generatedAt:now.toISOString(),cache_status:"hit"};
  const pending=inFlight.get(key);if(pending)return pending;
 }
 const work=query(plan,now,opts.fetchImpl??fetch).catch(error=>{
   // Strictly bounded telemetry: never forward provider body, URL, stack,
   // source title, customer text or token to a public or log surface.
   const message=error instanceof Error?error.message:"";
   const safe=/^ASK_OFFICIAL_NUMERIC_(?:HTTP_\d{3}|NO_MATCHING_ROWS|NO_SHARED_DATE|SIZE|ORIGIN)$/u.test(message)
     ? message : message.includes("timeout")||message.includes("Timeout")||message.includes("abort")
       ? "ASK_OFFICIAL_NUMERIC_TIMEOUT" : "ASK_OFFICIAL_NUMERIC_TRANSPORT_UNAVAILABLE";
   opts.onFailure?.(safe);
   return null;
 });
 if(!opts.noCache)inFlight.set(key,work);
 try{const answer=await work;if(answer&&!opts.noCache){
   cache.set(key,{value:answer,until:now.getTime()+120_000});
   if(cache.size>100)cache.delete(cache.keys().next().value!);
 }return answer;}finally{if(!opts.noCache)inFlight.delete(key);}
}
