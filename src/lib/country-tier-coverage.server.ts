/**
 * Nonpayable 195-country structural/live tier classification.
 *
 * The four module inputs MUST come from the SAME governed, exact-country
 * structural-country-digest preflight used by the paid engine. Cataloguing
 * a country, seeing an unverified RSS item or reading a source health row
 * cannot promote an S grade. No risk score or paid product is minted.
 */
import {COUNTRIES_195,country195ByIso3} from "./canonical-country-registry-195";
import {buildAgentQueryPlan} from "./agent-query-plan";
import {checkAgentQueryDeliverability,type AgentQueryDeliverability} from "./agent-query-deliverability.server";
import {qualifiedStructuralBaselinePreflight} from "./structural-baseline-eligibility";
import {fetchAllDerivedNews} from "./public-derived-news-client";
import {buildDerivedNewsStructural} from "./derived-news-structural-bridge";
import {observedDerivedNewsForCountry} from "./derived-news-country-coverage-195";

export const COVERAGE_TIER_SCHEMA="geomacro.coverage.v1" as const;
export const COUNTRY_TIER_MODULES=[
 {module:"geopolitical_security",topic:"conflict_geopolitics",domain:"geopolitics"},
 {module:"macro_monetary",topic:"macro_risk",domain:"macro"},
 {module:"external_fx",topic:"fx_external_risk",domain:"macro"},
 {module:"critical_minerals",topic:"critical_minerals",domain:"rare_earth"},
] as const;
type Module=typeof COUNTRY_TIER_MODULES[number]["module"];
export type TierModuleStatus="ELIGIBLE"|"STALE"|"NOT_ELIGIBLE"|"NOT_CONFIGURED"|"RUNTIME_UNAVAILABLE";
type TierModule=Readonly<{
 module:Module;status:TierModuleStatus;observation_period:null;
 as_of:string|null;rights_state:"VERIFIED"|"NOT_VERIFIED"|"UNKNOWN";
 reason_code:string|null;
}>;
export type TierStructuralGrade="S0"|"S1"|"S2"|"S3"|null;
export type TierLiveGrade="L0"|"L1"|"L2"|null;

const emptyModule=(module:Module,status:TierModuleStatus,reason:string|null):TierModule=>({
 module,status,observation_period:null,as_of:null,rights_state:"UNKNOWN",reason_code:reason,
});

/**
 * An accurate S0 requires completed tests of ALL four required modules.
 * An unavailable adapter/provider leaves the full S-grade unclassified,
 * never S0. The lower bound is separately exposed for partial inspections.
 */
export function computeCoverageGrade(modules:readonly TierModule[]){
 if(modules.length!==COUNTRY_TIER_MODULES.length ||
    new Set(modules.map(x=>x.module)).size!==COUNTRY_TIER_MODULES.length ||
    modules.some(x=>!COUNTRY_TIER_MODULES.some(m=>m.module===x.module)))
   throw Error("COUNTRY_TIER_MODULE_SET_INVALID");
 const eligible=modules.filter(x=>x.status==="ELIGIBLE");
 const availableDomains=new Set(eligible.map(x=>COUNTRY_TIER_MODULES.find(m=>m.module===x.module)!.domain));
 const count=eligible.length;
 const observedGrade:Exclude<TierStructuralGrade,null>=
   availableDomains.size===3?"S3":count>=2?"S2":count===1?"S1":"S0";
 const unassessed=modules.some(m=>m.status==="RUNTIME_UNAVAILABLE");
 return {
   structural_grade:unassessed?null:observedGrade,
   structural_grade_status:unassessed?"RUNTIME_UNAVAILABLE":"EVALUATED",
   observed_grade_floor:unassessed?observedGrade:null,
   eligible_modules:count,
   eligible_domains:[...availableDomains].sort(),
   // Unscored, nonpayable signals; full country profile/corridor sale still
   // needs its own exact composition, module and payment acceptance checks.
   unscored:true,execution_authorized:false,
 };
}
/** Extract a bounded public status from one complete governed preflight.
 * Never report an unqualified available_modules entry as eligible.
 */
export function classifyCountryModulePreflight(
 module:Module,plan:ReturnType<typeof buildAgentQueryPlan>,
 result:AgentQueryDeliverability,now:number,
):TierModule{
 if(plan.subjects.length!==1||plan.subjects[0].type!=="country"||
    plan.required_modules.length!==1||plan.required_modules[0]!==module||
    result.query_plan_hash!==plan.query_plan_hash||
    result.subjects.length!==1||
    result.subjects[0].subject.type!=="country"||
    result.subjects[0].subject.country_iso3!==plan.subjects[0].country_iso3)
   return emptyModule(module,"RUNTIME_UNAVAILABLE","PREFLIGHT_SUBJECT_OR_HASH_MISMATCH");
 if(qualifiedStructuralBaselinePreflight(plan,result,now)){
   return {...emptyModule(module,"ELIGIBLE",null),
     rights_state:"VERIFIED",as_of:result.subjects[0].latest_evidence_at};
 }
 const rightsBlocked=result.source_contracts.length===0||
   result.code==="COMMERCIAL_SOURCE_NOT_ELIGIBLE"||
   result.ineligible_source_ids.length>0||
   result.source_contracts.some(x=>
     !["COMMERCIAL_OK","DERIVED_ONLY"].includes(x.commercial_usage_status??"")||
     x.attribution_required!==false);
 const rightsState=rightsBlocked?"NOT_VERIFIED":"UNKNOWN";
 const at=result.subjects[0].latest_evidence_at;
 if(result.stale_modules.includes(module)||result.code==="STALE_REQUIRED_DATA")
   return {...emptyModule(module,"STALE","SOURCE_NATIVE_PERIOD_STALE"),as_of:at,
     rights_state:rightsState};
 if(rightsBlocked)
   return {...emptyModule(module,"NOT_ELIGIBLE","COMMERCIAL_RIGHTS_NOT_VERIFIED"),
     rights_state:"NOT_VERIFIED",as_of:at};
 if(result.code==="NOT_AVAILABLE")
   return emptyModule(module,"RUNTIME_UNAVAILABLE","GOVERNED_SOURCE_NOT_AVAILABLE");
 return {...emptyModule(module,"NOT_ELIGIBLE","NO_ADAPTER_OR_NO_VERIFIED_SOURCE"),
   as_of:at,rights_state:rightsState};
}
export function buildCountryTierIndex(now=new Date()){
 if(!Number.isFinite(now.getTime()))throw Error("COUNTRY_TIER_INVALID_CLOCK");
 return {
  schema_version:"geomacro.country-tier-index.v1",
  evaluated_at:now.toISOString(),
  country_count:COUNTRIES_195.length,
  module_count_per_country:4,
  categories:["geopolitics","macro","rare_earth"],
  S_grade_counts:null,L_grade_counts:null,
  tier_count_is_not_computed_without_production_eligibility:true,
  coverage_not_evaluated_is_not_S0:true,
  payment_required_now:false,chargeable:false,execution_authorized:false,
  countries:COUNTRIES_195.map(c=>({
    country_iso3:c.iso3,country_name:c.name,observer_state:c.observer_state,
    structural_grade:null,live_grade:null,
    status:"NOT_EVALUATED",
    evaluation_endpoint:"POST /api/v1/intelligence/availability?view=country-tiers",
    unscored:true,execution_authorized:false,
  })),
 };
}
export async function evaluateCountryTier(
 countryIso3:string,opts:{
   now?:Date;
   check?:(plan:ReturnType<typeof buildAgentQueryPlan>)=>Promise<AgentQueryDeliverability>;
   live?:(iso3:string,now:Date)=>Promise<{journal_accessible:boolean;derived_news_count:number}>;
 }={},
){
 const country=country195ByIso3(countryIso3),now=opts.now??new Date();
 if(!country||!Number.isFinite(now.getTime()))throw Error("COUNTRY_TIER_INVALID_COUNTRY_OR_CLOCK");
 const check=opts.check??checkAgentQueryDeliverability;
 const modules:TierModule[]=[];
 for(const spec of COUNTRY_TIER_MODULES){
   const plan=buildAgentQueryPlan({
     schema_version:"geomacro.agent-query.v1",
     product:{capability:"structural_country_digest",variant:"standard"},
     delivery_tier:"structural_baseline",fulfillment_mode:"published_only",
     subjects:[{type:"country",country_iso3:country.iso3}],
     topics:[spec.topic],detail:"standard",evidence:"required",
   });
   try{
     const outcome=await check(plan);
     modules.push(classifyCountryModulePreflight(spec.module,plan,outcome,now.getTime()));
   }catch{
     modules.push(emptyModule(spec.module,"RUNTIME_UNAVAILABLE","GOVERNED_PREFLIGHT_UNAVAILABLE"));
   }
 }
 let live:{journal_accessible:boolean;derived_news_count:number};
 try{
   live=opts.live?await opts.live(country.iso3,now):await (async()=>{
     const signals=await fetchAllDerivedNews(fetch,now.getTime());
     const derived=buildDerivedNewsStructural(signals,now.getTime());
     return {journal_accessible:true,
       derived_news_count:observedDerivedNewsForCountry(derived,country.iso3).length};
   })();
 }catch{live={journal_accessible:false,derived_news_count:0}}
 const structural=computeCoverageGrade(modules);
 // L2 requires separately verified current signed GRI/certificate/B2 proof.
 // Its absence is not inferred from an unsigned journal.
 const liveGrade:TierLiveGrade=live.journal_accessible
   ? live.derived_news_count>0?"L1":"L0":null;
 return {
   schema_version:COVERAGE_TIER_SCHEMA,
   country_iso3:country.iso3,country_name:country.name,
   evaluated_at:now.toISOString(),...structural,
   live_grade:liveGrade,
   live_grade_status:live.journal_accessible?"DERIVED_JOURNAL_ONLY":"RUNTIME_UNAVAILABLE",
   signed_L2_independent_verification_performed:false,
   current_signed_product_eligible:false,
   observed_derived_news_72h:live.journal_accessible?live.derived_news_count:null,
   modules,
   grade_does_not_override_product_specific_preflight:true,
   corridor_requires_endpoint_and_composition_proofs:true,
   source_native_periods_not_assumed_from_timestamps:true,
   payment_required_now:false,chargeable:false,execution_authorized:false,
   raw_upstream_delivered:false,unscored:true,
 };
}
