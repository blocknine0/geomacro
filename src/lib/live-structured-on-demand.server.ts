import {readCategoryOpenData} from "./category-open-data.server";
import {OPEN_CONTEXT_CATEGORIES} from "./category-open-data-contract";
import {answerOfficialNumeric,planAskOfficialNumeric} from "./ask-official-numeric.server";
import {answerFromOriginalPlan,type AskOriginalPlan} from "./ask-on-demand-original.server";
import {country195ByIso3} from "./canonical-country-registry-195";
import {conservativeDayReleaseMs} from "./stateless-intelligence-model";
import {readCountryOfficialMacro,type CountryMacroReference} from "./country-official-macro.server";

/** Stateless request-time observations only. No paid rights are implied by access. */
type Category=(typeof OPEN_CONTEXT_CATEGORIES)[number];
type CategorySnapshot=Awaited<ReturnType<typeof readCategoryOpenData>>;
type NumericAnswer=Awaited<ReturnType<typeof answerOfficialNumeric>>;
type Dependencies={
  categoryReader?: (category:Category)=>Promise<CategorySnapshot>;
  numericReader?: (question:string)=>Promise<NumericAnswer>;
  originalReader?: typeof answerFromOriginalPlan;
  countryMacroReader?: (iso3:string,options:{now:Date})=>Promise<CountryMacroReference>;
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
export type LiveStructuredRequest={category:Category}|{question:string}|
  {category:Category;country_iso3:string;lookback_days:number};
export function parseLiveStructuredRequest(raw:unknown):LiveStructuredRequest|null{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
 const obj=raw as Record<string,unknown>;
 const keys=Object.keys(obj);
 if((keys.length===2||keys.length===3)&&keys.includes("country_iso3")&&
    keys.every(key=>["category","country_iso3","lookback_days"].includes(key))&&
    typeof obj.category==="string"&&categories.has(obj.category)&&
    typeof obj.country_iso3==="string"&&country195ByIso3(obj.country_iso3)&&
    (obj.lookback_days===undefined||(Number.isInteger(obj.lookback_days)&&
      Number(obj.lookback_days)>=1&&Number(obj.lookback_days)<=7)))
   return {category:obj.category as Category,country_iso3:obj.country_iso3,
     lookback_days:Number(obj.lookback_days??1)};
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
 if("country_iso3" in input){
  const country=country195ByIso3(input.country_iso3)!;
  const scope={geopolitics:{category:"geopolitics",topics:["sanctions_restrictions","conflict_geopolitics","political_governance"]},
    "macro-fx":{category:"macro",topics:["macro_risk","sovereign_risk","fx_external_risk"]},
    "critical-minerals":{category:"rare_earth",topics:["critical_minerals"]}} as const;
  const plan:AskOriginalPlan={country_iso3:country.iso3,country_name:country.name,
    categories:[scope[input.category].category],topics:[...scope[input.category].topics],
    mineral:null,max_age_seconds:input.lookback_days*86400};
  let answer:Awaited<ReturnType<typeof answerFromOriginalPlan>>=null;
  let originalFetchFailed=false;
  try{answer=await (dep.originalReader??answerFromOriginalPlan)(plan,
    {now:new Date(at),websiteDelay:false});}
  catch{
    originalFetchFailed=true;
    // Macro country requests can still retrieve genuine, dated WDI annual
    // observations after a missing/denied news feed. These are NOT news.
    if(input.category!=="macro-fx")
      return {statusCode:503,body:denied(at,"ORIGINAL_PUBLISHER_FETCH_UNAVAILABLE")};
  }
  const stamp=Date.parse(answer?.latest_original_published_at??"");
  const precision=answer?.latest_original_date_precision??"exact";
  const day=answer?.latest_original_published_at??"";
  const dayAvailableAt=precision==="day"?conservativeDayReleaseMs(day):null;
  const precisionValid=precision==="exact"
    ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(day)
    : precision==="day"&&/^\d{4}-\d{2}-\d{2}$/u.test(day)&&
      dayAvailableAt!==null&&dayAvailableAt<=Date.parse(at);
  const valid=answer&&answer.insufficient_evidence===false&&
    answer.source_identity_exposed===false&&answer.durable_live_storage_write===false&&
    answer.signed_gro_generated===false&&precisionValid&&Number.isFinite(stamp)&&stamp<=Date.parse(at)&&
    stamp>=Date.parse(at)-input.lookback_days*86400_000;
  if(!answer||!valid){
    if(input.category==="macro-fx"){
      let reference:CountryMacroReference;
      try{
        reference=await (dep.countryMacroReader??readCountryOfficialMacro)(
          country.iso3,{now:new Date(at)});
      }catch{
        return {statusCode:503,body:{...denied(at,"OFFICIAL_COUNTRY_MACRO_TRANSPORT_UNAVAILABLE"),
          category:input.category,country_iso3:input.country_iso3,
          original_news_fetch_failed:originalFetchFailed}};
      }
      if(reference.category!=="macro-fx"||reference.country_iso3!==country.iso3||
         reference.customer_chargeable!==false||
         reference.actual_current_macro_news_verified!==false||
         reference.source_commercial_rights_verified!==false||
         reference.fetch_time_is_not_publisher_release_time!==true||
         reference.observations.length===0||reference.observations.length>2||
         reference.observations.some(x=>x.clock_semantics!=="reference_year"||
           x.source_rights_scope!=="WDI_SOURCE_2_CC_BY_4_0"||
           x.original_event_time_verified!==false||x.score!==null||
           !/^(?:19|20)\\d{2}$/u.test(x.observation_period)||
           Number(x.observation_period)>new Date(at).getUTCFullYear()))
        return {statusCode:422,body:{...denied(at,"NO_COUNTRY_ANNUAL_REFERENCE_AVAILABLE"),
          category:input.category,country_iso3:input.country_iso3}};
      return {statusCode:200,body:{
        schema:"geomacro.live-structured.v1",
        status:"OFFICIAL_ANNUAL_REFERENCE_FETCHED",category:input.category,
        country_iso3:country.iso3,checked_at:at,source_checked_at:reference.checked_at,
        coverage:"COUNTRY_OFFICIAL_ANNUAL_REFERENCE_ONLY_NOT_CURRENT_NEWS",
        source_mode:"WORLD_BANK_WDI_SOURCE_2",
        source_period_is_not_retrieval_time:true,
        original_publication_time_verified:false,
        original_news_fetch_failed:originalFetchFailed,
        observations:reference.observations,observation_count:reference.observations.length,
        independent_same_event_verified:false,
        source_commercial_rights_verified:false,
        signed_gro_required:false,signature:null,score:null,
        payment_required:false,chargeable:false,settlement_performed:false,
        durable_storage_written:false,raw_upstream_delivered:false,
      }};
    }
    return {statusCode:422,body:{...denied(at,"NO_CURRENT_COUNTRY_TOPIC_ORIGINAL"),
      category:input.category,country_iso3:input.country_iso3,lookback_days:input.lookback_days}};
  }
  // Reuse Ask's own derived wording. Do not serialize its private evidence,
  // upstream titles, article URLs, original text, provider IDs or source hashes.
  return {statusCode:200,body:{schema:"geomacro.live-structured.v1",
    status:"CURRENT_ORIGINAL_OBSERVATION_DERIVED",category:input.category,
    country_iso3:input.country_iso3,lookback_days:input.lookback_days,
    coverage:"COUNTRY_TOPIC_MATCHED_OBSERVATION_NOT_GLOBAL_COVERAGE",
    source_mode:"DIRECT_ORIGINAL_PUBLISHERS",checked_at:at,source_checked_at:at,
    observation_period:answer.latest_original_published_at,
    clock_semantics:precision==="day"?"original_publication_day":"original_publication",
    original_date_precision:precision,original_publication_time_verified:precision==="exact",
    source_period_is_not_retrieval_time:true,
    observations:[{finding:answer.summary,change:answer.what_changed,
      why_it_matters:answer.why_it_matters,score:null}],observation_count:1,
    independent_same_event_verified:false,source_commercial_rights_verified:false,
    signed_gro_required:false,signature:null,score:null,payment_required:false,
    chargeable:false,settlement_performed:false,durable_storage_written:false,
    raw_upstream_delivered:false,
  }};
 }
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
