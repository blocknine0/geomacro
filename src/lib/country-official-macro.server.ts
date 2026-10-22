import {fetchWithoutRedirectUsing} from "./fetch-without-redirect";
import {country195ByIso3} from "./canonical-country-registry-195";

/** An actual one-country official WDI observation, not today's economic news.
 * It has NO provider article, B2/D1 write, Groq synthesis or paid eligibility.
 * One bounded country query retrieves BOTH requested annual indicators.
 */
export const COUNTRY_WDI_ANNUAL_INDICATORS = [
 {id:"FP.CPI.TOTL.ZG",name:"consumer-price inflation"},
 {id:"NY.GDP.MKTP.KD.ZG",name:"real GDP growth"},
] as const;
type PeriodObservation={year:number;value:number};
export type CountryMacroReference=Readonly<{
  category:"macro-fx";country_iso3:string;checked_at:string;
  observations:readonly {
    kind:string;observation_period:string;clock_semantics:"reference_year";
    finding:string;why_it_matters:string;attribution:string;
    source_rights_scope:"WDI_SOURCE_2_CC_BY_4_0";score:null;
    original_event_time_verified:false;
  }[];
  source_native_statistical_release_time_verified:false;
  fetch_time_is_not_publisher_release_time:true;
  actual_current_macro_news_verified:false;
  source_commercial_rights_verified:false;
  customer_chargeable:false;
}>;
const MAX_BYTES=256_000;
const fmt=(n:number)=>Number(n.toPrecision(7)).toLocaleString("en-US",{maximumFractionDigits:5});
export function countryWdiQueryUrl(iso3:string){
  if(!country195ByIso3(iso3))throw Error("COUNTRY_WDI_INVALID_ISO3");
  const url=new URL("https://api.worldbank.org/v2/country/"+
    iso3.toLowerCase()+"/indicator/FP.CPI.TOTL.ZG;NY.GDP.MKTP.KD.ZG");
  url.searchParams.set("source","2");
  url.searchParams.set("format","json");
  url.searchParams.set("mrnev","2");
  url.searchParams.set("per_page","24");
  url.searchParams.set("page","1");
  return url.href;
}
export function parseCountryWdiRows(body:unknown,iso3:string,now=new Date()):CountryMacroReference{
  if(!country195ByIso3(iso3)||!Number.isFinite(now.getTime())||
     !Array.isArray(body)||body.length!==2||
     !body[0]||typeof body[0]!=="object"||
     !Array.isArray(body[1])||body[1].length>24||
     Number(body[0].page)!==1||Number(body[0].pages)!==1||
     Number(body[0].total)!==body[1].length)
    throw Error("COUNTRY_WDI_RESPONSE_SCOPE_INVALID");
  const years=new Map(COUNTRY_WDI_ANNUAL_INDICATORS.map(x=>[x.id,new Map<number,number>()]));
  for(const raw of body[1]){
    if(!raw||typeof raw!=="object"||
       raw.countryiso3code!==iso3||
       !years.has(raw.indicator?.id))continue;
    const year=Number(raw.date);
    if(typeof raw.date!=="string"||!/^(?:19|20)\d{2}$/u.test(raw.date)||
       !Number.isInteger(year)||year>now.getUTCFullYear()||
       year<now.getUTCFullYear()-12)continue;
    if(typeof raw.value!=="number"||!Number.isFinite(raw.value)||
       raw.value< -100||raw.value>1000)continue;
    // Same canonical year/indicator with disagreeing values is not accepted.
    const set=years.get(raw.indicator.id)!;
    if(set.has(year)&&set.get(year)!==raw.value)
      throw Error("COUNTRY_WDI_CONFLICTING_OFFICIAL_ROWS");
    set.set(year,raw.value);
  }
  const observations=COUNTRY_WDI_ANNUAL_INDICATORS.flatMap(indicator=>{
    const series=years.get(indicator.id)!;
    const rows=[...series.entries()].sort((a,b)=>b[0]-a[0]);
    if(!rows.length)return [];
    const [latest,previous]=rows;
    const narrative=iso3+" latest available annual "+indicator.name+
      " was "+fmt(latest[1])+"% in "+latest[0]+".";
    const comparison=previous?" Versus "+previous[0]+", the rate changed by "+
      fmt(latest[1]-previous[1])+" percentage points.":" Previous comparable annual rate unavailable.";
    return [{
      kind:indicator.id,observation_period:String(latest[0]),
      clock_semantics:"reference_year" as const,
      finding:narrative+comparison,
      why_it_matters:"Official annual reference, not current monthly CPI, same-day GDP news, or live FX. Observation year and request time differ.",
      attribution:"World Bank, World Development Indicators (CC BY 4.0); Geomacro-adapted annual comparison",
      source_rights_scope:"WDI_SOURCE_2_CC_BY_4_0" as const,
      original_event_time_verified:false as const,score:null,
    }];
  });
  return {category:"macro-fx",country_iso3:iso3,checked_at:now.toISOString(),
    observations,
    source_native_statistical_release_time_verified:false,
    fetch_time_is_not_publisher_release_time:true,
    actual_current_macro_news_verified:false,
    source_commercial_rights_verified:false,customer_chargeable:false};
}
export async function readCountryOfficialMacro(iso3:string,{
 now=new Date(),fetchImpl=fetch,
}:{now?:Date;fetchImpl?:typeof fetch}={}):Promise<CountryMacroReference>{
 const url=countryWdiQueryUrl(iso3);
 if(!Number.isFinite(now.getTime()))throw Error("COUNTRY_WDI_CLOCK_INVALID");
 const response=await fetchWithoutRedirectUsing(fetchImpl,url,{
   method:"GET",headers:{Accept:"application/json"},
   signal:AbortSignal.timeout(16000),
 });
 if(!response.ok||!response.body)throw Error("COUNTRY_WDI_HTTP_UNAVAILABLE");
 if(Number(response.headers.get("content-length")??0)>MAX_BYTES)
   throw Error("COUNTRY_WDI_SIZE_LIMIT");
 const reader=response.body.getReader(),parts:Uint8Array[]=[];let count=0;
 try{for(;;){
   const {done,value}=await reader.read();if(done)break;
   count+=value.byteLength;
   if(count>MAX_BYTES)throw Error("COUNTRY_WDI_SIZE_LIMIT");
   parts.push(value);
 }}finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
 const bytes=new Uint8Array(count);let offset=0;
 for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
 let body:unknown;
 try{body=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}
 catch{throw Error("COUNTRY_WDI_JSON_INVALID");}
 return parseCountryWdiRows(body,iso3,now);
}
