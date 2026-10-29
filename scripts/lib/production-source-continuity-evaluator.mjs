/**
 * Interpret one independently served three-domain D1 continuity receipt.
 * This is a SOURCE AVAILABILITY monitor, not a verified/billable event certifier.
 * The response can report a current source check but zero new news legitimately.
 */
export const CONTINUITY_CATEGORIES = Object.freeze(["geopolitics","macro","rare_earth"]);
export const MAX_SOURCE_CHECK_AGE_MS = 3*60*60*1000;
const VALID_STATES=new Set([
 "CURRENT_SOURCE_CHECK_WITH_DATA","CURRENT_SOURCE_CHECK_NO_QUALIFYING_DATA",
 "LAST_KNOWN_OR_NEWS_ONLY_NOT_CURRENT_SOURCE_CHECK","NO_VERIFIED_SOURCE_CONTEXT"
]);
const iso=(date,now)=>{
 if(typeof date!=="string" || !/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u.test(date))return null;
 const at=Date.parse(date);
 return Number.isFinite(at)&&at<=now&&new Date(at).toISOString().slice(0,19)===date.slice(0,19)?at:null;
};
export function evaluateProductionSourceContinuity(response,{now=new Date()}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error("SOURCE_CONTINUITY_CLOCK_INVALID");
 if(!response || typeof response!=="object" || Array.isArray(response) ||
   response.ok!==true || response.schema!=="geomacro.three-domain-evidence-continuity.v1" ||
   response.three_domains_returned!==true || !response.categories ||
   typeof response.categories!=="object" || Array.isArray(response.categories))
   throw Error("SOURCE_CONTINUITY_CONTRACT_INVALID");
 const emitted=Object.keys(response.categories).sort();
 if(JSON.stringify(emitted)!==JSON.stringify([...CONTINUITY_CATEGORIES].sort()))
   throw Error("SOURCE_CONTINUITY_CATEGORIES_INVALID");
 if(iso(response.checked_at,now.getTime())===null||
    now.getTime()-Date.parse(response.checked_at)>10*60*1000)
   throw Error("SOURCE_CONTINUITY_RESPONSE_CLOCK_STALE");
 const categories={},failures=[];
 for(const category of CONTINUITY_CATEGORIES){
   const s=response.categories[category];
   if(!s || s.category!==category || typeof s.source_check_current!=="boolean" ||
     typeof s.data_present!=="boolean" || !VALID_STATES.has(s.service_state)||
     typeof s.native_news_event_count_72h!=="number" ||
     !Number.isSafeInteger(s.native_news_event_count_72h) || s.native_news_event_count_72h<0||
     s.current_news_guaranteed!==false || s.chargeable!==false ||
     s.commercial_rights_verified!==false ||
     s.signed_intelligence_available!==false)throw Error("SOURCE_CONTINUITY_DOMAIN_INVALID");
   const at=iso(s.latest_source_check_at,now.getTime());
   const age=at===null?null:Math.floor((now.getTime()-at)/60000);
   const current=age!==null && age>=0&&(now.getTime()-at)<=MAX_SOURCE_CHECK_AGE_MS &&
     s.source_check_current===true && s.service_state.startsWith("CURRENT_SOURCE_CHECK");
   const pulse=s.original_publisher_pulse;
   if(!pulse || typeof pulse!=="object" || typeof pulse.status!=="string" ||
     pulse.status.length>80)throw Error("SOURCE_CONTINUITY_PULSE_INVALID");
   if(s.source_check_current!==current)throw Error("SOURCE_CONTINUITY_SOURCE_CLOCK_CONTRADICTS");
   const lastPulse=iso(pulse.last_checked_at,now.getTime());
   const publisherCurrent=lastPulse!==null && now.getTime()-lastPulse<=75*60*1000 &&
     pulse.status==="SOURCE_NATIVE_OBSERVED";
   const state=!current?"SOURCE_CHECK_STALE_OR_MISSING":
     !publisherCurrent?"ORIGINAL_PUBLISHER_PULSE_STALE_OR_DEGRADED":
     s.native_news_event_count_72h>0?"SOURCE_AND_ORIGINAL_PUBLISHER_CURRENT_NEWS_UNSCORED":
       "SOURCE_AND_ORIGINAL_PUBLISHER_CURRENT_NO_VERIFIED_NEW_EVENT";
   if(!current)failures.push(category+":SOURCE_CHECK_STALE_OR_MISSING");
   if(!publisherCurrent)failures.push(category+":ORIGINAL_PUBLISHER_PULSE_STALE_OR_DEGRADED");
   categories[category]={
     status:state,source_check_age_minutes:age,
     last_source_check_at:at===null?null:new Date(at).toISOString(),
     original_publisher_pulse_status:pulse.status.slice(0,80),
     original_publisher_last_checked_at:lastPulse===null?null:new Date(lastPulse).toISOString(),
     derived_native_dated_items_72h:s.native_news_event_count_72h,
     official_context_present:s.data_present,
     source_rights_qualified:false,signed_gro_verified:false,
     country_event_coverage_verified:false,
   };
 }
 return {
   schema:"geomacro.production-source-continuity-observation.v1",
   observed_at:now.toISOString(),readback_verified:true,
   categories,all_three_source_checks_current:failures.length===0,
   stale_or_missing_source_categories:failures,
   current_verified_original_events_in_all_195_countries:false,
   all_three_paid_signed_categories_verified:false,
   upstream_sla_guaranteed:false,source_content_logged:false,
   predge_changed:false,paid_delivery_activated:false,
 };
}
