import {liveStructuredData} from "./live-structured-on-demand.server";

/**
 * Product-scoped deep health for the new unsigned, on-demand structured lane.
 * The old signed B2/D1 deep health is a different product. No health response
 * may promote this endpoint to signed GRI / Risk Indices or paid delivery.
 */
export const LIVE_STRUCTURED_HEALTH_CATEGORIES =
  ["geopolitics","macro-fx","critical-minerals"] as const;

type Probe=(input:{category:(typeof LIVE_STRUCTURED_HEALTH_CATEGORIES)[number]})=>
  ReturnType<typeof liveStructuredData>;
type Options={probe?:Probe;now?:()=>Date};
const MAX_CLOCK_SKEW_MS=2*60_000;
const VALID_CLOCKS=new Set([
  "event_occurrence","reference_day","reference_month","reference_year",
  "dataset_edition","retrieval_snapshot","award_obligation_day","catalog_added_day",
]);

function validIsoClock(value:unknown,now:number){
 if(typeof value!=="string"||!value.endsWith("Z"))return false;
 const ms=Date.parse(value);
 return Number.isFinite(ms)&&ms<=now+30_000&&now-ms<=MAX_CLOCK_SKEW_MS;
}
export async function probeLiveStructuredDeepHealth(options:Options={}){
 const now=(options.now??(()=>new Date()))();
 const checkedAt=now.toISOString();
 const sourceProbe=options.probe??((input)=>liveStructuredData(input));
 const finished=await Promise.allSettled(
   LIVE_STRUCTURED_HEALTH_CATEGORIES.map(category=>sourceProbe({category})),
 );
 const categories=Object.fromEntries(
   LIVE_STRUCTURED_HEALTH_CATEGORIES.map((category,index)=>{
     const result=finished[index];
     const out=result.status==="fulfilled"?result.value:null;
     // A status 200 alone is not evidence of valid data or freshness.
     const body=out?.body as Record<string,unknown>|undefined;
     const obs=Array.isArray(body?.observations)?body.observations:[];
     const checked=validIsoClock(body?.checked_at,now.getTime())&&
       validIsoClock(body?.source_checked_at,now.getTime());
     const qualifying=obs.length>0&&obs.length<=6&&obs.every(row=>{
       if(!row||typeof row!=="object")return false;
       const x=row as Record<string,unknown>;
       return typeof x.kind==="string"&&typeof x.finding==="string"&&
         x.finding.length>0&&typeof x.attribution==="string"&&x.attribution.length>0&&
         typeof x.observation_period==="string"&&x.observation_period.length>0&&
         VALID_CLOCKS.has(String(x.clock_semantics??""))&&
         typeof x.source_rights_scope==="string"&&x.source_rights_scope.length>0&&
         x.score===null&&typeof x.original_event_time_verified==="boolean"&&
         (x.clock_semantics==="event_occurrence"||x.original_event_time_verified===false);
     });
     const safe=out?.statusCode===200&&body?.schema==="geomacro.live-structured.v1"&&
       body?.status==="LIVE_SOURCE_FETCHED"&&body?.category===category&&
       body?.coverage==="GLOBAL_CONTEXT_NOT_COUNTRY_VERIFIED"&&
       body?.chargeable===false&&body?.payment_required===false&&
       body?.settlement_performed===false&&body?.durable_storage_written===false&&
       body?.signed_gro_required===false&&body?.signature===null&&body?.score===null&&
       body?.source_period_is_not_retrieval_time===true&&checked&&qualifying;
     const eventCount=safe?obs.filter(row=>(row as Record<string,unknown>).clock_semantics==="event_occurrence").length:0;
     return [category,{
       status:safe?"SOURCE_OBSERVATIONS_AVAILABLE":"NO_ELIGIBLE_LIVE_SOURCE_OBSERVATIONS",
       source_fetch_accepted:safe,
       eligible_observations:safe?obs.length:0,
       independently_verified_current_events:eventCount,
       signed_gro_required:false,
       observation_reference_periods_are_not_current_event_clocks:true,
     }];
   }),
 ) as Record<(typeof LIVE_STRUCTURED_HEALTH_CATEGORIES)[number],{
   status:string;source_fetch_accepted:boolean;eligible_observations:number;
   independently_verified_current_events:number;signed_gro_required:false;
   observation_reference_periods_are_not_current_event_clocks:boolean;
 }>;
 const allReady=LIVE_STRUCTURED_HEALTH_CATEGORIES.every(
   category=>categories[category].source_fetch_accepted);
 return {
   statusCode:allReady?200:503,
   body:{
     schema:"geomacro.product-scoped-deep-health.v1",
     ok:allReady,
     product:"live-structured",
     checked_at:checkedAt,
     source_mode:"EPHEMERAL_DIRECT_FETCH_NO_D1_FALLBACK",
     health_semantics:"SOURCE_READ_AND_DERIVED_OUTPUT_NOT_ALL_COUNTRIES_REALTIME_NEWS",
     categories,
     country_coverage_verified:false,
     all_195_countries_fresh_news_verified:false,
     legacy_signed_intelligence_gri_risk_indices:"NOT_EVALUATED_IN_THIS_PROFILE",
     legacy_deep_health_path:"/api/health?deep=1",
     signed_gro_required:false,
     fresh_signed_snapshot_readiness_attested:false,
     x402_payment_authorized:false,
     chargeable:false,
     new_intelligence_durable_storage_required:false,
     source_readiness_verified:allReady,
   },
 };
}
