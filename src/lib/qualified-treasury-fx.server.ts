import {createHash} from "node:crypto";
import {canonicalJson} from "./canonical-json";
import type {StructuralContext} from "./structural-context.server";
import type {SourceRightsRow} from "./commercial-source-eligibility.server";

// Published API permission for analysis services; no independent-reviewer or
// government endorsement claim. Scope is numerical India reporting FX only.
import {TREASURY_FX_SOURCE_ID,TREASURY_TERMS_SHA256} from "./treasury-fx-source-identity";
export {TREASURY_FX_SOURCE_ID,TREASURY_TERMS_SHA256} from "./treasury-fx-source-identity";
export const TREASURY_TERMS_URL="https://treasurydirect.gov/legal-information/developers/web-api-terms/";
export const TREASURY_FX_URL="https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/rates_of_exchange?filter=country_currency_desc:eq:India-Rupee&sort=-record_date&page[size]=2";
const DAY=86400_000, TTL=5*60_000;
const hash=(x:Uint8Array|string)=>createHash("sha256").update(x).digest("hex");
type Options={fetchImpl?:typeof fetch;now?:Date;noCache?:boolean};
type Release={changePct:number;observedAt:string;previousAt:string;sourceHash:string;rightsHash:string;checkedAt:string};
let cache:{until:number;value:Release}|null=null;
let pending:Promise<Release|null>|null=null;
let failedUntil=0;
async function read(url:string,limit:number,f:typeof fetch){
 const r=await f(url,{redirect:"error",signal:AbortSignal.timeout(12_000)});
 if(r.status!==200||!r.body)throw Error("TREASURY_HTTP_UNAVAILABLE");
 const reader=r.body.getReader(),parts:Uint8Array[]=[];let n=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;
  n+=value.length;if(n>limit)throw Error("TREASURY_RESPONSE_TOO_LARGE");parts.push(value);
 }}finally{await reader.cancel().catch(()=>undefined)}
 if(!n)throw Error("TREASURY_EMPTY_RESPONSE");
 return Buffer.concat(parts);
}
function quarterEnd(raw:unknown,now:Date){
 if(typeof raw!=="string"||!/^\d{4}-(?:03-31|06-30|09-30|12-31)$/u.test(raw))throw Error("TREASURY_QUARTER_INVALID");
 const ms=Date.parse(raw+"T23:59:59.000Z");
 if(!Number.isFinite(ms)||ms>now.getTime()||now.getTime()-ms>125*DAY)throw Error("TREASURY_REFERENCE_STALE_OR_FUTURE");
 return {ms,iso:new Date(ms).toISOString(),ordinal:Number(raw.slice(0,4))*4+(Number(raw.slice(5,7))/3)-1};
}
/** Pure validation, never treat capture time as the source's publication. */
export function deriveTreasuryQuarterlyFx(value:unknown,now:Date){
 const data=(value as any)?.data;
 if(!Array.isArray(data)||data.length!==2)throw Error("TREASURY_TWO_RECORDS_REQUIRED");
 const [a,b]=data;
 for(const x of data){
  if(x?.country!=="India"||x?.currency!=="Rupee"||x?.country_currency_desc!=="India-Rupee"||
     x?.effective_date!==x?.record_date||typeof x.exchange_rate!=="string"||
     !/^[0-9]{1,6}(?:\.[0-9]{1,6})?$/u.test(x.exchange_rate)||Number(x.exchange_rate)<=0)
   throw Error("TREASURY_COUNTRY_RATE_OR_EFFECTIVE_DATE_INVALID");
 }
 const current=quarterEnd(a.record_date,now);
 // Previous record may be older than 125 days; only latest reference has SLA.
 const priorDate=new Date(current.ms);
 const previous=quarterEnd(b.record_date,priorDate);
 if(current.ordinal-previous.ordinal!==1)throw Error("TREASURY_CONSECUTIVE_QUARTERS_REQUIRED");
 // Exact fixed-point arithmetic, six-decimal percent, ties to even.
 const scale=(s:string)=>{const [i,d=""]=s.split(".");return BigInt(i)*1_000_000n+BigInt(d.padEnd(6,"0"))};
 const old=scale(b.exchange_rate),recent=scale(a.exchange_rate);
 const numerator=(recent-old)*100_000_000n,negative=numerator<0n;
 const abs=negative?-numerator:numerator;
 let q=abs/old;const remainder=abs%old;
 if(remainder*2n>old||(remainder*2n===old&&q%2n===1n))q++;
 const changePct=Number(negative?-q:q)/1_000_000;
 if(!Number.isFinite(changePct))throw Error("TREASURY_CHANGE_INVALID");
 return {changePct,observedAt:current.iso,previousAt:previous.iso};
}
export async function loadQualifiedTreasuryFx(options:Options={}):Promise<Release|null>{
 const now=options.now??new Date();if(!Number.isFinite(now.getTime()))return null;
 // Injected fetchers are isolated and may never seed production cache.
 const useCache=!options.noCache&&!options.fetchImpl;
 if(useCache&&cache&&cache.until>now.getTime())return cache.value;
 if(useCache&&failedUntil>now.getTime())return null;
 if(useCache&&pending)return pending;
 const work=(async()=>{
  const f=options.fetchImpl??fetch;
  // Exact reviewed publisher terms must be read before acquiring source data.
  const terms=await read(TREASURY_TERMS_URL,100_000,f);
  if(hash(terms)!==TREASURY_TERMS_SHA256)throw Error("TREASURY_TERMS_REVISION_UNREVIEWED");
  const bytes=await read(TREASURY_FX_URL,50_000,f);
  return {...deriveTreasuryQuarterlyFx(JSON.parse(bytes.toString("utf8")),now),
   sourceHash:hash(bytes),rightsHash:hash(terms),checkedAt:now.toISOString()};
 })().catch(()=>null);
 if(useCache)pending=work;
 try{const value=await work;if(useCache){if(value)cache={until:now.getTime()+TTL,value};else failedUntil=now.getTime()+60_000}return value}
 finally{if(useCache)pending=null}
}
export async function loadQualifiedTreasuryFxCountryContext(iso3:string,options:Options={}):Promise<StructuralContext|null>{
 if(iso3!=="IND")return null;
 const r=await loadQualifiedTreasuryFx(options);if(!r)return null;
 const {checkedAt:_capture,...native}=r;
 const normalized=hash(canonicalJson({source:TREASURY_FX_SOURCE_ID,...native}));
 return {status:"AVAILABLE",methodology_status:"EVIDENCE_ONLY_NOT_IN_GRI_V1_2",
  subject:{type:"country",country_iso3:"IND"},observations:[{
   observation_id:"derived:"+normalized,source_id:TREASURY_FX_SOURCE_ID,source_record_id:normalized,
   dimension:"external_fx",country_iso3:"IND",partner_country_iso3:null,
   observed_at:r.observedAt,published_at:null,metric:"quarterly_reporting_fx_change_pct",
   value_numeric:r.changePct,value_text:"Quarterly USD reporting-conversion comparison; not a live or tradable FX quote.",
   unit:"percent_change",event_type:null,signal_type:"QUARTERLY_STRUCTURAL_NOT_CURRENT_NEWS",
   source_url:null,parser_version:"geomacro.quarterly-reporting-fx-change.v1",
   methodology_status:"EVIDENCE_ONLY_NOT_IN_GRI_V1_2",quality_status:"VERIFIED",
   provenance:{source_file_sha256:r.sourceHash,rights_metadata_sha256:r.rightsHash,
    previous_reference_period_end:r.previousAt,date_precision:"QUARTER",
    reference_period_end_is_not_publication_time:true},normalized_hash:normalized,retrieved_at:r.checkedAt}],
  metadata:{serving_layer:"QUALIFIED_RELEASE_DERIVED_V1",warehouse_methodology_status:"EVIDENCE_ONLY_NOT_IN_GRO_V02",
   coverage:[],composition_method:null,route_modeling_status:null,direct_evidence_status:null},
  note:"One derived quarterly reporting-FX comparison; not live FX, current news, a causal explanation, a calibrated risk score or signed GRO."};
}
export async function qualifiedTreasuryFxSourceRights(id:string):Promise<SourceRightsRow|null>{
 if(id!==TREASURY_FX_SOURCE_ID||!await loadQualifiedTreasuryFx())return null;
 return {source_id:id,category:"MACRO",certification_state:"CERTIFIED",
  commercial_usage_status:"DERIVED_ONLY",enabled_for_ingestion:true,enabled_for_commercial_signals:true,
  raw_redistribution_allowed:false,attribution_required:false,
  licence_name:"Published Fiscal Service API analysis-service permission; exact reviewed terms; numerical India reporting FX only"};
}
