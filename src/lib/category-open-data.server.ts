/**
 * No-key OPEN DATA measurement layer for the 3 existing category endpoints.
 *
 * Transport access ≠ source rights ≠ original publication ≠ commercial GRO.
 * Native event clocks, catalog addition dates, monthly/annual observation
 * reference periods and procurement obligation dates are never interchanged.
 * No raw publisher payload, upstream links or identifying article text leaves
 * this module, and no raw data is persisted. All upstream URLs are fixed.
 */
import type { CommercialIntelligenceCategory } from "./public-intelligence-source-coverage";

type Domain = CommercialIntelligenceCategory;
type Timing = "event_occurrence" | "catalog_added_day" | "reference_year" |
  "reference_month" | "reference_day" | "retrieval_snapshot" | "award_obligation_day";
export type OpenDataSignal = {
  finding_key: string;
  evidence_class: "official_open_data_unscored";
  observation_type: string;
  observation_period: string;
  clock_semantics: Timing;
  geomacro_finds: string;
  why_it_matters: string;
  independent_same_event_verification: false;
  score: null;
};
type Provider = {
  id: string;
  category: Domain;
  url: string;
  maxBytes: number;
  timeoutMs: number;
  method: "GET" | "POST";
  format?: "xml" | "json";
  body?: string;
};
type Extracted = { signals: OpenDataSignal[]; credits: string[] };
const UPSTREAMS: readonly Provider[] = Object.freeze([
  { id: "usgs_earthquakes", category: "geopolitics",
    url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson",
    maxBytes: 600_000, timeoutMs: 5_000, method: "GET" },
  { id: "noaa_nhc", category: "geopolitics",
    url: "https://www.nhc.noaa.gov/CurrentStorms.json",
    maxBytes: 75_000, timeoutMs: 5_000, method: "GET" },
  { id: "cisa_kev", category: "geopolitics",
    url: "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
    maxBytes: 3_000_000, timeoutMs: 6_000, method: "GET" },
  { id: "federal_register", category: "geopolitics",
    url: "https://www.federalregister.gov/api/v1/documents.json?conditions%5Bterm%5D=sanctions&per_page=5&order=newest",
    maxBytes: 150_000, timeoutMs: 5_000, method: "GET" },
  { id: "treasury_fiscaldata", category: "macro-fx",
    url: "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates?page%5Bsize%5D=4&sort=-record_date",
    maxBytes: 100_000, timeoutMs: 5_000, method: "GET" },
  { id: "ecb_fx", category: "macro-fx",
    url: "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",
    maxBytes: 70_000, timeoutMs: 5_000, method: "GET", format: "xml" },
  { id: "bls_cpi", category: "macro-fx",
    url: "https://api.bls.gov/publicAPI/v1/timeseries/data/CUUR0000SA0",
    maxBytes: 125_000, timeoutMs: 5_000, method: "GET" },
  { id: "world_bank_wdi", category: "macro-fx",
    url: "https://api.worldbank.org/v2/country/USA/indicator/NY.GDP.MKTP.CD?format=json&source=2&per_page=7",
    maxBytes: 100_000, timeoutMs: 5_000, method: "GET" },
  { id: "usaspending", category: "critical-minerals",
    url: "https://api.usaspending.gov/api/v2/search/spending_by_award/",
    maxBytes: 180_000, timeoutMs: 6_000, method: "POST",
    body: JSON.stringify({
      filters: { keywords: ["critical minerals"], award_type_codes: ["A","B","C","D"] },
      fields: ["Award ID","Description","Base Obligation Date","Last Modified Date"],
      sort: "Base Obligation Date", order: "desc", page: 1, limit: 5,
    }) },
]);
const CACHE_MS = 120_000;
const cache = new Map<Domain,{ until: number; value: Promise<ReturnType<typeof buildSnapshot>> }>();
const NOW_MAX_SKEW = 5 * 60_000;
function dateOnly(s: unknown): string | null {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(s)) return null;
  const date = Date.parse(s + "T00:00:00Z");
  return Number.isFinite(date) && new Date(date).toISOString().slice(0,10) === s ? s : null;
}
function boundedNumeric(value: unknown, lo: number, hi: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value>=lo && value<=hi ? value : null;
}
function stableKey(input:string):string {
  // Non-security UI dedupe identifier only. This is not a signing digest.
  let h=2166136261;
  for(let i=0;i<input.length;i++){h^=input.charCodeAt(i);h=Math.imul(h,16777619);}
  return (h>>>0).toString(16).padStart(8,"0");
}
function signal(kind: string, key: string, period: string, clock: Timing,
  finding: string, impact: string): OpenDataSignal {
  return {
    finding_key: kind + ":" + stableKey(key),
    evidence_class: "official_open_data_unscored",
    observation_type: kind,
    observation_period: period, clock_semantics: clock,
    geomacro_finds: finding, why_it_matters: impact,
    independent_same_event_verification: false, score: null,
  };
}
function fromUsgs(payload: unknown, now: number): Extracted | null {
  const data=payload as Record<string,unknown>;
  if (data?.type!=="FeatureCollection" || !Array.isArray(data.features)) return null;
  const row = data.features.slice(0,150).flatMap((f: unknown): {id:string; ms:number}[] => {
    const item = f as Record<string,any>;
    const p=item?.properties;
    const ms=boundedNumeric(p?.time, 1_000_000_000_000, now+NOW_MAX_SKEW);
    const mag=boundedNumeric(p?.mag, 4.5, 10);
    const id=typeof item?.id==="string"&&/^[a-z0-9]{4,32}$/iu.test(item.id)?item.id:"";
    if (!ms || mag===null || !id || ms>now-15*60_000 ||
        ms<now-24*3600_000) return [];
    return [{id,ms}];
  }).sort((a,b)=>b.ms-a.ms).slice(0,3);
  return { signals:row.map(x=>signal(
    "seismic_hazard",x.id,new Date(x.ms).toISOString(),"event_occurrence",
    "Geomacro detects a recorded earthquake in the M4.5-or-higher seismic band within the past day.",
    "Seismic events may disrupt logistics or infrastructure locally; no geopolitical conflict, damage or supply disruption is inferred."
  )),credits:[] };
}
function fromNhc(payload:unknown,now:number):Extracted|null{
  const data=payload as Record<string,unknown>;
  if(!Array.isArray(data?.activeStorms) || data.activeStorms.length>60 ||
     !data.activeStorms.every(x=>x && typeof x==="object" && !Array.isArray(x)))
    return null;
  // The file's current-status snapshot is not a certified original advisory
  // or evidence of landfall, fatalities, damage, conflict or disruptions.
  // An empty active-storms array is a valid source response with zero events.
  const found=data.activeStorms.length>0;
  return {signals:found?[signal(
    "noaa_tropical_cyclone_listing","active:"+Math.floor(now/600_000),
    new Date(now).toISOString(),"retrieval_snapshot",
    "Geomacro observes one or more tropical cyclone records in an official current-storms status snapshot.",
    "The listing indicates weather-hazard monitoring only; no original advisory date, landfall, damage or trade impact is confirmed."
  )]:[],credits:[]};
}
function fromEcbXml(input:string,now:number):Extracted|null{
  // Intentionally accept only a bounded XML envelope with dated cube.
  // This is a provider reference date, not a market transaction or timestamp
  // of user request. No exchange rate value is redistributed.
  if(typeof input!=="string" || input.length>70_000 ||
     !/<(?:[A-Za-z][\w.-]*:)?Envelope\b/iu.test(input) ||
     !/<Cube\b/u.test(input) ||
     /<!DOCTYPE|<!ENTITY/iu.test(input))return null;
  const dates=[...input.matchAll(/<Cube\s+time=["'](\d{4}-\d{2}-\d{2})["']/gu)]
    .map(x=>dateOnly(x[1])).filter((x):x is string=>x!==null);
  if(!dates.length)return null;
  const day=dates.sort().reverse()[0];
  const ms=Date.parse(day+"T00:00:00Z");
  if(ms>now || now-ms>14*86_400_000)return {signals:[],credits:["European Central Bank"]};
  return {signals:[signal(
    "ecb_daily_fx_reference","day:"+day,day,"reference_day",
    "Geomacro detects an available ECB daily foreign-exchange reference-date observation.",
    "ECB reference rates are for information, not executable FX quotes; currency direction or market movements are not inferred."
  )],credits:["European Central Bank"]};
}
function fromCisa(payload: unknown, now: number): Extracted | null {
  const data=payload as Record<string,unknown>;
  if(typeof data?.catalogVersion!=="string"||!Array.isArray(data.vulnerabilities))
    return null;
  // Date added is a DAY, not a timestamp of the exploit. Conservative
  // next-day 12:15 UTC embargo prevents publication-before-fact claims.
  const rows=data.vulnerabilities.slice(-180).flatMap((row:unknown):{day:string;key:string}[]=>{
    const x=row as Record<string,unknown>;
    const day=dateOnly(x?.dateAdded);
    const cve=typeof x?.cveID==="string" && /^CVE-\d{4}-\d{4,10}$/u.test(x.cveID)?x.cveID:null;
    const t=day ? Date.parse(day+"T00:00:00Z")+36*3600_000+15*60_000 : 0;
    if (!day || !cve || t>now || now-t>7*86_400_000) return [];
    return [{day,key:cve}];
  }).sort((a,b)=>b.day.localeCompare(a.day)).slice(0,2);
  return {signals:rows.map(x=>signal(
    "exploited_vulnerability_catalog","date:"+x.day+":"+x.key,x.day,"catalog_added_day",
    "Geomacro detects a recent addition to an official exploited-vulnerability catalog.",
    "The listing may affect cyber-exposure reviews; exploitation date, affected country and event attribution are not established."
  )),credits:[]};
}
function fromFederalRegister(payload:unknown,now:number):Extracted|null{
  const data=payload as Record<string,unknown>;
  if(!Array.isArray(data?.results) || !Number.isFinite(data?.count))return null;
  const rows=data.results.flatMap((x:unknown):{day:string}[]=>{
    const item=x as Record<string,unknown>;
    if(typeof item?.title!=="string" ||
        !/\b(?:sanctions?|embargo|assets? freeze|foreign assets? control)\b/iu.test(item.title))
      return [];
    const day=dateOnly(item.publication_date);
    const ms=day?Date.parse(day+"T00:00:00Z")+36*3600_000+15*60_000:0;
    return day && ms<=now && now-ms<=14*86_400_000 ? [{day}] : [];
  }).sort((a,b)=>b.day.localeCompare(a.day)).slice(0,2);
  return {signals:rows.map((r,i)=>signal(
    "sanctions_federal_publication",r.day+":"+i,r.day,"catalog_added_day",
    "Geomacro detects a recently published U.S. federal regulatory document concerning sanctions.",
    "A regulatory publication is not proof sanctions are currently enforceable or that a named counterparty is designated; check effective dates separately."
  )),credits:[]};
}
function fromBls(payload:unknown):Extracted|null{
  const data=payload as Record<string,unknown>;
  if(data?.status!=="REQUEST_SUCCEEDED")return null;
  const series=(data?.Results as Record<string,unknown>)?.series;
  if(!Array.isArray(series))return null;
  const periods=series.flatMap((s:unknown):string[]=>{
    const series=s as Record<string,unknown>;
    if(series?.seriesID!=="CUUR0000SA0"||!Array.isArray(series?.data))return [];
    return series.data.flatMap((p:unknown):string[]=>{
      const x=p as Record<string,unknown>;
      if(!/^20\d{2}$/u.test(String(x?.year??"")) ||
          !/^M(?:0[1-9]|1[0-2])$/u.test(String(x?.period??"")))return [];
      return [String(x.year)+"-"+String(x.period).slice(1)];
    });
  }).sort().reverse();
  return {signals:periods.length?[signal(
    "consumer_prices_reference_month",periods[0],periods[0],"reference_month",
    "Geomacro detects an available official U.S. consumer-price index reference month.",
    "BLS index values, their release date and inflation direction require separate verification; the monthly reference period is not a publication timestamp."
  )]:[],credits:[]};
}
function fromTreasury(payload:unknown): Extracted | null {
  const data=payload as Record<string,unknown>;
  if(!Array.isArray(data?.data))return null;
  const months=data.data.flatMap((x:unknown):string[]=>{
    const day=dateOnly((x as Record<string,unknown>)?.record_date);
    return day?[day]:[];
  }).sort().reverse();
  if(!months.length)return {signals:[],credits:[]};
  const month=months[0].slice(0,7);
  return {signals:[signal(
    "treasury_rate_reference_period","month:"+month,month,"reference_month",
    "Geomacro detects an available official U.S. Treasury monthly interest-rate reference period.",
    "This is an economic reference period, not a same-day rate decision, forecast or current market quote."
  )],credits:[]};
}
function fromWorldBank(payload:unknown): Extracted | null {
  if(!Array.isArray(payload)||!Array.isArray(payload[1]))return null;
  const years=payload[1].flatMap((x:unknown):string[]=>{
    const row=x as Record<string,any>;
    if(row?.indicator?.id!=="NY.GDP.MKTP.CD" || row?.value===null ||
       (typeof row?.value!=="number"&&typeof row?.value!=="string") ||
       !/^\d{4}$/u.test(String(row?.date??"")))return [];
    return [String(row.date)];
  }).sort().reverse();
  if(!years.length)return {signals:[],credits:["World Bank (CC BY 4.0)"]};
  return {signals:[signal(
    "annual_gdp_reference_period","year:"+years[0],years[0],"reference_year",
    "Geomacro detects a populated official annual GDP reference period for the United States.",
    "Annual GDP is historical national-accounts context and must not be described as live FX movement or a current release."
  )],credits:["World Bank (CC BY 4.0)"]};
}
function fromUsaSpending(payload:unknown,now:number): Extracted | null {
  const data=payload as Record<string,unknown>;
  if(!Array.isArray(data?.results))return null;
  const awards=data.results.flatMap((x:unknown):{day:string;idx:number}[]=>{
    const row=x as Record<string,unknown>;
    // Only the original award description may establish mineral relevance.
    // Provider keyword search alone can match unrelated third-party text.
    const description=typeof row?.Description==="string"?row.Description:"";
    if(!/\b(?:critical minerals?|rare[- ]earths?|lithium|cobalt|nickel|graphite|gallium|germanium)\b/iu.test(description))
      return [];
    const day=dateOnly(row["Base Obligation Date"]);
    const t=day?Date.parse(day+"T00:00:00Z")+36*3600_000+15*60_000:0;
    if(!day||t>now||now-t>90*86_400_000)return [];
    return [{day,idx:0}];
  }).sort((a,b)=>b.day.localeCompare(a.day)).slice(0,2);
  return {signals:awards.map((x,i)=>signal(
    "critical_minerals_federal_award","award:"+x.day+":"+i,x.day,"award_obligation_day",
    "Geomacro detects a federal contract award whose description references critical-mineral supply or materials.",
    "The award may indicate procurement activity, not a mineral discovery, new production capacity or verified supply delivery."
  )),credits:[]};
}
export function extractOpenData(specId: string, body:unknown, now=Date.now()): Extracted | null {
  if(!Number.isFinite(now))return null;
  switch(specId){
    case "usgs_earthquakes":return fromUsgs(body,now);
    case "cisa_kev":return fromCisa(body,now);
    case "noaa_nhc":return fromNhc(body,now);
    case "federal_register":return fromFederalRegister(body,now);
    case "bls_cpi":return fromBls(body);
    case "treasury_fiscaldata":return fromTreasury(body);
    case "world_bank_wdi":return fromWorldBank(body);
    case "usaspending":return fromUsaSpending(body,now);
    default:return null;
  }
}
async function boundedJson(r:Response,maxBytes:number,format:"json"|"xml"="json"):Promise<unknown|null>{
  if(!r.ok||!r.body)return null;
  const len=Number(r.headers.get("content-length")??"0");
  if(Number.isFinite(len)&&len>maxBytes)return null;
  const reader=r.body.getReader();
  let size=0;
  const chunks:Uint8Array[]=[];
  try {
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>maxBytes)return null;
      chunks.push(value);
    }
    const out=new Uint8Array(size);let i=0;
    for(const c of chunks){out.set(c,i);i+=c.byteLength;}
    const raw=new TextDecoder("utf-8",{fatal:true}).decode(out);
    return format==="xml" ? raw : JSON.parse(raw);
  }catch{return null;}
  finally{await reader.cancel().catch(()=>undefined);}
}
async function fetchOne(spec:Provider,now:number,fetcher:typeof fetch):
  Promise<{readable:boolean;data:Extracted|null}> {
  try {
    const response=await fetcher(spec.url,{
      method:spec.method,redirect:"error",cache:"no-store",
      headers:{
        Accept:"application/json",
        ...(spec.method==="POST"?{"Content-Type":"application/json"}:{}),
      },
      ...(spec.body?{body:spec.body}:{}),
      signal:AbortSignal.timeout(spec.timeoutMs),
    });
    const contentType=response.headers.get("content-type")??"";
    if(spec.format==="xml"
      ? !/^(?:application|text)\/(?:xml|[a-z0-9.+-]+\+xml)(?:;|$)/iu.test(contentType)
      : !/^application\/(?:json|geo\+json)(?:;|$)/iu.test(contentType))
      return {readable:false,data:null};
    const body=await boundedJson(response,spec.maxBytes,spec.format==="xml"?"xml":"json");
    const parsed=body===null?null:spec.id==="ecb_fx"
      ? fromEcbXml(body as string,now) : extractOpenData(spec.id,body,now);
    return {readable:parsed!==null,data:parsed};
  }catch{return {readable:false,data:null};}
}
function buildSnapshot(category:Domain,rows:{readable:boolean;data:Extracted|null}[],at:number){
  const out=rows.flatMap(x=>x.data?.signals??[]);
  const credits=[...new Set(rows.flatMap(x=>x.data?.credits??[]))];
  // No duplicate source IDs or raw values are returned to customers.
  return {
    schema_version:"geomacro.category-open-data-observations.v1" as const,
    category,mode:"UNSCORED_OPEN_DATA_CONTEXT" as const,
    checked_at:new Date(at).toISOString(),
    source_families_attempted:rows.length,
    source_families_readable:rows.filter(x=>x.readable).length,
    source_families_unavailable:rows.filter(x=>!x.readable).length,
    status:rows.every(x=>!x.readable)?"ALL_SOURCES_UNAVAILABLE":
      out.length?"DERIVED_CONTEXT_AVAILABLE":"NO_QUALIFYING_CONTEXT",
    findings:out.slice(0,8),
    licensed_source_credits:credits,
    observations_are_current_release_news:false,
    source_event_and_period_clocks_distinct:true,
    source_names_and_urls_private_except_required_credits:true,
    upstream_payloads_exposed:false,
    risk_score:null,
    independent_same_event_verification:false,
    signed_gro_generated:false,
    x402_payment_required:false,
    chargeable:false,
    paid_delivery_authorized:false,
    persistent_storage_written:false,
  };
}
export async function readCategoryOpenData(
  category:Domain,{now=Date.now(),fetcher=fetch}:{now?:number;fetcher?:typeof fetch}={}
){
  if(!["geopolitics","macro-fx","critical-minerals"].includes(category)||
      !Number.isFinite(now))throw Error("OPEN_DATA_CATEGORY_INVALID");
  const selected=UPSTREAMS.filter(x=>x.category===category);
  if(fetcher!==fetch){
    const responses=await Promise.all(selected.map(x=>fetchOne(x,now,fetcher)));
    return buildSnapshot(category,responses,now);
  }
  const cached=cache.get(category);
  if(cached&&cached.until>now)return cached.value;
  const value=Promise.all(selected.map(x=>fetchOne(x,now,fetch))).then(x=>buildSnapshot(category,x,now)).catch(e=>{
    cache.delete(category);throw e;
  });
  cache.set(category,{until:now+CACHE_MS,value});
  return value;
}
export const OPEN_DATA_SOURCE_FAMILIES=Object.freeze(
  Object.fromEntries((["geopolitics","macro-fx","critical-minerals"] as const).map(category=>
    [category,UPSTREAMS.filter(x=>x.category===category).length]))
);
