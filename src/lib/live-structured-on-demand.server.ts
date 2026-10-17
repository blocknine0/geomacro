import {readCategoryOpenData} from "./category-open-data.server";
import {OPEN_CONTEXT_CATEGORIES} from "./category-open-data-contract";
import {answerOfficialNumeric,planAskOfficialNumeric} from "./ask-official-numeric.server";

/** Stateless request-time observations only. No paid rights are implied by access. */
type Category=(typeof OPEN_CONTEXT_CATEGORIES)[number];
type CategorySnapshot=Awaited<ReturnType<typeof readCategoryOpenData>>;
type NumericAnswer=Awaited<ReturnType<typeof answerOfficialNumeric>>;
type Dependencies={
  categoryReader?: (category:Category)=>Promise<CategorySnapshot>;
  numericReader?: (question:string)=>Promise<NumericAnswer>;
  now?:()=>Date;
};
const REVIEWED:Record<Category,Readonly<Record<string,{credit:string;rights:string}>>>={
  geopolitics:{
    seismic_hazard:{credit:"U.S. Geological Survey",rights:"USGS_PRODUCED_PUBLIC_DOMAIN"},
  },
  "macro-fx":{
    ecb_daily_fx_reference:{credit:"Source: ECB statistics",rights:"ESCB_PUBLIC_STATS_REUSE_CREDIT_REQUIRED"},
    annual_gdp_reference_period:{credit:"World Bank WDI (CC BY 4.0)",rights:"WDI_SOURCE_2_CC_BY_4_0"},
  },
  "critical-minerals":{
    usgs_mcs_dataset_catalog:{credit:"U.S. Geological Survey",rights:"USGS_PRODUCED_PUBLIC_DOMAIN"},
  },
};
const categories=new Set<string>(OPEN_CONTEXT_CATEGORIES);
export type LiveStructuredRequest={category:Category}|{question:string};
export function parseLiveStructuredRequest(raw:unknown):LiveStructuredRequest|null{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
 const obj=raw as Record<string,unknown>;
 const keys=Object.keys(obj);
 if(keys.length!==1)return null;
 if(keys[0]==="category"&&typeof obj.category==="string"&&categories.has(obj.category))
   return {category:obj.category as Category};
 if(keys[0]==="question"&&typeof obj.question==="string"&&
    obj.question.trim().length>=8&&obj.question.length<=300&&
    !/[<>]/u.test(obj.question))return {question:obj.question.trim()};
 return null;
}
function denied(at:string,code:string){
 return {schema:"geomacro.live-structured.v1",status:"NO_ELIGIBLE_OBSERVATION",checked_at:at,
  reason:code,observations:[],signature:null,score:null,chargeable:false,
  payment_required:false,durable_storage_written:false};
}
async function readFresh(category:Category):Promise<CategorySnapshot>{
 // Changing fetcher identity bypasses module in-memory cache. Disable D1 fallback.
 const fetchFresh:typeof fetch=(input,init)=>fetch(input,init);
 return readCategoryOpenData(category,{fetcher:fetchFresh,fallbackToD1:false});
}
export async function liveStructuredData(raw:unknown,dep:Dependencies={}){
 const at=(dep.now??(()=>new Date()))().toISOString();
 const input=parseLiveStructuredRequest(raw);
 if(!input)return {statusCode:400,body:denied(at,"INVALID_INPUT")};
 if("category" in input){
  let snapshot:CategorySnapshot;
  try{snapshot=await (dep.categoryReader??readFresh)(input.category);}
  catch{return {statusCode:503,body:denied(at,"SOURCE_FETCH_UNAVAILABLE")};}
  const rights=REVIEWED[input.category];
  const observations=snapshot.findings
    .filter(item=>Object.hasOwn(rights,item.observation_type)).slice(0,6)
    .map(item=>({
       kind:item.observation_type,observation_key:item.finding_key,
       finding:item.geomacro_finds,why_it_matters:item.why_it_matters,
       observation_period:item.observation_period,clock_semantics:item.clock_semantics,
       original_event_time_verified:item.clock_semantics==="event_occurrence",
       attribution:rights[item.observation_type].credit,
       source_rights_scope:rights[item.observation_type].rights,
       score:null,
    }));
  if(!observations.length)return {statusCode:422,body:{
    ...denied(at,snapshot.status==="ALL_SOURCES_UNAVAILABLE"?
       "SOURCE_FETCH_UNAVAILABLE":"NO_REVIEWED_OPEN_DATA_OBSERVATION"),
    category:input.category,
  }};
  return {statusCode:200,body:{
    schema:"geomacro.live-structured.v1",status:"LIVE_SOURCE_FETCHED",
    category:input.category,country_iso3:null,
    coverage:"GLOBAL_CONTEXT_NOT_COUNTRY_VERIFIED",
    checked_at:at,source_checked_at:snapshot.checked_at,
    observations,observation_count:observations.length,
    source_period_is_not_retrieval_time:true,
    signed_gro_required:false,signature:null,score:null,
    payment_required:false,chargeable:false,settlement_performed:false,
    durable_storage_written:false,source_licenses_scoped:true,
  }};
 }
 const plan=planAskOfficialNumeric(input.question);
 if(!plan)return {statusCode:422,body:denied(at,"QUERY_NOT_SUPPORTED_BY_REVIEWED_NUMERIC_SOURCES")};
 let answer:NumericAnswer;
 try{answer=await (dep.numericReader??((q)=>answerOfficialNumeric(q,{noCache:true})))(input.question);}
 catch{return {statusCode:503,body:denied(at,"SOURCE_FETCH_UNAVAILABLE")};}
 if(!answer||answer.insufficient_evidence||answer.durable_live_storage_write!==false)
   return {statusCode:422,body:denied(at,"NO_VERIFIED_LIVE_NUMERIC_OBSERVATION")};
 const credit=plan.kind==="wdi"?
    "World Bank, World Development Indicators (CC BY 4.0); adapted comparison":
    "Source: ECB statistics; calculated currency cross when applicable";
 const period=answer.evidence.find(item=>item.eventId==="live:official:numeric")?.title
    .replace(/^Official period /u,"")??null;
 return {statusCode:200,body:{
   schema:"geomacro.live-structured.v1",status:"LIVE_SOURCE_FETCHED",
   category:"macro-fx",country_iso3:plan.kind==="wdi"?plan.iso3:null,
   metric:plan.kind==="wdi"?plan.indicator:plan.base+"/"+plan.quote,
   checked_at:at,observation_period:period,
   clock_semantics:plan.kind==="wdi"?"reference_year":"reference_day",
   observations:[{
      finding:answer.summary,change:answer.what_changed,
      why_it_matters:answer.why_it_matters,attribution:credit,
      source_period_is_not_retrieval_time:true,
   }],
   signed_gro_required:false,signature:null,score:null,payment_required:false,
   chargeable:false,settlement_performed:false,durable_storage_written:false,
   source_licenses_scoped:true,
 }};
}
