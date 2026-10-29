import {createHash} from "node:crypto";
import {canonicalJson} from "./canonical-json";
import type {StructuralContext,StructuralObservation} from "./structural-context.server";
import type {SourceRightsRow} from "./commercial-source-eligibility.server";

/**
 * Exact-source, public-domain USA CPI structural baseline.
 *
 * Official US Bureau of Labor Statistics, unadjusted all-items CPI-U:
 * https://api.bls.gov/publicAPI/v1/timeseries/data/CUUR0000SA0
 * BLS explicitly states its own data are US public domain:
 * https://www.bls.gov/opub/copyright-information.htm
 *
 * NOT an inflation forecast, monetary-policy statement, signed country risk,
 * current original news event or international indicator. No upstream payload
 * or source identity is delivered in customer JSON.
 */
export const BLS_US_CPI_SOURCE_ID="us_bls_public_domain_cpi_u_unadjusted_v1" as const;
export const BLS_CPI_SERIES="CUUR0000SA0" as const;
export const BLS_CPI_URL="https://api.bls.gov/publicAPI/v1/timeseries/data/CUUR0000SA0" as const;
export const BLS_CPI_METHOD="geomacro.bls-cpi-u-us-monthly-measurement.v1" as const;
const MAX_BYTES=220_000;
const CACHE_MS=12*60*60*1000;
const sha=(value:string|Uint8Array)=>createHash("sha256").update(value).digest("hex");
type Sample={year:number;month:number;value:number;period:string;rowHash:string};
type Release={data:Sample;responseHash:string;retrievedAt:string};
let cached:{until:number;result:Release}|null=null;
let pending:Promise<Release|null>|null=null;
let retryAfter=0;
let lastFailure:string|null=null;
export function blsCpiAcquisitionFailure(){return lastFailure;}
function monthEnd(year:number,month:number){
  const day=new Date(Date.UTC(year,month,0)).getUTCDate();
  return \`\${year}-\${String(month).padStart(2,"0")}-\${String(day).padStart(2,"0")}T23:59:59.000Z\`;
}
export function parseBlsUsCpiRelease(payload:unknown,asOf:Date):Sample|null{
  const root=payload as {status?:unknown;Results?:{series?:unknown}}|null;
  if(!root||root.status!=="REQUEST_SUCCEEDED"||
    !root.Results||!Array.isArray(root.Results.series)||root.Results.series.length!==1)return null;
  const series=root.Results.series[0] as {seriesID?:unknown;data?:unknown};
  if(series?.seriesID!==BLS_CPI_SERIES||!Array.isArray(series.data))return null;
  const asOfMs=asOf.getTime();
  if(!Number.isFinite(asOfMs))return null;
  const candidates:Sample[]=[];
  const unique=new Set<string>();
  for(const value of series.data){
    if(!value||typeof value!=="object")continue;
    const row=value as {year?:unknown;period?:unknown;value?:unknown;footnotes?:unknown};
    if(typeof row.year!=="string"||!/^20\d\d$/u.test(row.year)||
       typeof row.period!=="string"||!/^M(?:0[1-9]|1[0-2])$/u.test(row.period)||
       typeof row.value!=="string"||!/^(?:[0-9]+)(?:\.[0-9]{1,6})?$/u.test(row.value))
      continue;
    const year=Number(row.year),month=Number(row.period.slice(1)),amount=Number(row.value);
    if(year<2020||amount<=0||amount>3000)continue;
    const observed=Date.parse(monthEnd(year,month));
    if(observed>asOfMs)continue;
    // A preliminary or flagged observation is not sold as certified final data.
    if(Array.isArray(row.footnotes) && row.footnotes.some((f:unknown)=>
       f&&typeof f==="object"&&
       ["P","R","C"].includes(String((f as {code?:unknown}).code??"").toUpperCase())))
      continue;
    const key=year+"-"+row.period;
    if(unique.has(key))return null;
    unique.add(key);
    candidates.push({year,month,value:amount,period:key,rowHash:sha(canonicalJson({
      series:BLS_CPI_SERIES,year,period:row.period,value:row.value,
    }))});
  }
  candidates.sort((a,b)=>b.year-a.year||b.month-a.month);
  return candidates[0]??null;
}
async function acquire(fetcher:typeof fetch,now:Date):Promise<Release>{
  const r=await fetcher(BLS_CPI_URL,{
    method:"GET",redirect:"error",cache:"no-store",
    headers:{Accept:"application/json"},signal:AbortSignal.timeout(6500),
  });
  if(!r.ok||Number(r.headers.get("content-length")||0)>MAX_BYTES)
    throw Error("BLS_CPI_UPSTREAM_UNAVAILABLE");
  const body=await r.text();
  if(Buffer.byteLength(body,"utf8")>MAX_BYTES)throw Error("BLS_CPI_UPSTREAM_TOO_LARGE");
  let parsed:unknown;
  try{parsed=JSON.parse(body);}catch{throw Error("BLS_CPI_INVALID_JSON")}
  const data=parseBlsUsCpiRelease(parsed,now);
  if(!data)throw Error("BLS_CPI_OFFICIAL_SERIES_NOT_QUALIFIED");
  return{data,responseHash:sha(body),retrievedAt:now.toISOString()};
}
export async function loadQualifiedBlsCpiRelease(opts:{
  fetcher?:typeof fetch;now?:Date;noCache?:boolean;
}={}):Promise<Release|null>{
  const now=opts.now??new Date();
  if(!Number.isFinite(now.getTime()))return null;
  if(!opts.noCache&&cached?.until&&cached.until>now.getTime())return cached.result;
  if(!opts.noCache&&retryAfter>now.getTime())return null;
  if(!opts.noCache&&pending)return pending;
  const task=acquire(opts.fetcher??fetch,now).catch(e=>{
    lastFailure=e instanceof Error&&/^BLS_CPI_[A-Z_]+$/u.test(e.message)
      ?e.message:"BLS_CPI_UPSTREAM_UNAVAILABLE";
    return null;
  });
  if(!opts.noCache)pending=task;
  try{
    const v=await task;
    if(v){lastFailure=null;if(!opts.noCache)cached={until:now.getTime()+CACHE_MS,result:v};}
    else if(!opts.noCache)retryAfter=now.getTime()+60*60*1000;
    return v;
  }finally{if(!opts.noCache)pending=null;}
}
export async function loadQualifiedBlsCountryContext(
  iso3:string,opts:Parameters<typeof loadQualifiedBlsCpiRelease>[0]={},
):Promise<StructuralContext|null>{
  // This federal source is USA-only. Never infer or relabel other countries.
  if(iso3!=="USA")return null;
  const now=opts.now??new Date();
  const release=await loadQualifiedBlsCpiRelease(opts);
  if(!release)return null;
  const {data}=release;
  const observed=monthEnd(data.year,data.month);
  if(Date.parse(observed)>now.getTime()||now.getTime()-Date.parse(observed)>400*86400_000)
    return null;
  const normalized_hash=sha(canonicalJson({
    series:BLS_CPI_SERIES,year:data.year,month:data.month,
    value:data.value,original_row_sha256:data.rowHash,release_sha256:release.responseHash,
  }));
  const row:StructuralObservation={
    observation_id:"derived:"+normalized_hash,
    source_id:BLS_US_CPI_SOURCE_ID,
    source_record_id:BLS_CPI_SERIES+":"+data.period,
    dimension:"macro_monetary",
    country_iso3:"USA",partner_country_iso3:null,observed_at:observed,
    published_at:null,
    metric:"cpi_u_all_items_unadjusted_index",
    value_numeric:data.value,value_text:null,unit:"index_1982_84_100",
    event_type:null,signal_type:"MONTHLY_STRUCTURAL_NOT_CURRENT_NEWS",
    source_url:null,parser_version:BLS_CPI_METHOD,
    methodology_status:"EVIDENCE_ONLY_NOT_IN_GRI_V1_2",
    quality_status:"VERIFIED",
    provenance:{
      source_series_id:BLS_CPI_SERIES,
      source_response_sha256:release.responseHash,
      source_row_sha256:data.rowHash,
      measurement_period:\`\${data.year}-\${String(data.month).padStart(2,"0")}\`,
      original_measurement_month:true,
      retrieval_is_not_release_or_observation_date:true,
      rights_basis:"BLS_FEDERAL_PUBLIC_DOMAIN_NON_GRAPHICS",
    },
    normalized_hash,retrieved_at:release.retrievedAt,
  };
  return{
    status:"AVAILABLE",methodology_status:"EVIDENCE_ONLY_NOT_IN_GRI_V1_2",
    subject:{type:"country",country_iso3:"USA"},
    observations:[row],
    metadata:{
      serving_layer:"QUALIFIED_RELEASE_DERIVED_V1",
      warehouse_methodology_status:"EVIDENCE_ONLY_NOT_IN_GRO_V02",
      coverage:[],composition_method:null,route_modeling_status:null,direct_evidence_status:null,
    },
    note:"One first-party U.S. CPI-U unadjusted monthly index measurement. Does not establish current breaking news, inflation rate, Fed decision, forecast or signed risk score.",
  };
}
export async function qualifiedBlsSourceRights(sourceId:string):Promise<SourceRightsRow|null>{
  if(sourceId!==BLS_US_CPI_SOURCE_ID)return null;
  const release=await loadQualifiedBlsCpiRelease();
  if(!release)return null;
  return{
    source_id:BLS_US_CPI_SOURCE_ID,category:"MACRO",
    certification_state:"CERTIFIED",commercial_usage_status:"DERIVED_ONLY",
    enabled_for_ingestion:true,enabled_for_commercial_signals:true,
    raw_redistribution_allowed:false,attribution_required:false,
    licence_name:"US federal public domain, BLS own published data (non-photographic)",
  };
}
