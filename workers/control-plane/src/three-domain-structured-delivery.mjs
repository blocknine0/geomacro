/**
 * Canonical D1 → bounded three-category structured DATA delivery.
 * This is a FREE observation/readback contract for people and machines.
 * Do not confuse it with protected, buyer-licensed x402 paid Intelligence.
 *
 * The existing continuity reader independently validates publisher/native
 * dates, 72h D1 derived journal rows, official open-data checkpoints and
 * source-specific required attribution. No extra D1/B2/Supabase read/write.
 */
import {threeDomainEvidenceContinuity} from "./three-domain-evidence-continuity.mjs";

export const THREE_DOMAIN_STRUCTURED_DELIVERY_SCHEMA =
  "geomacro.three-domain-structured-delivery.v1";
const CATEGORIES=Object.freeze([
  {key:"geopolitics",label:"Geopolitics"},
  {key:"macro",label:"Macro / FX"},
  {key:"rare_earth",label:"Critical Minerals"},
]);
const NEWS_MAX=5,BASELINE_MAX=8,MAX_TEXT=1400;
const CLOCK=/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;
const ITEM_ID=/^(?:geopolitics|macro|rare_earth)-[0-9a-f]{8}$/u;
const NEWS_KEYS=new Set(["id","category","topic","development_type",
  "published_at","date_precision","what_changed","why_it_matters"]);
const SAFE_PROSE=/^(?!.*(?:https?:\/\/|www\.|[<>]))[\s\S]*$/iu;
const validText=(value,max=MAX_TEXT)=>typeof value==="string"&&
  value.length>0&&value.length<=max&&SAFE_PROSE.test(value);
const validDate=(value,now,ageMs)=>{
  if(typeof value!=="string"||!CLOCK.test(value))return false;
  const stamp=Date.parse(value);
  return Number.isFinite(stamp)&&stamp<=now&&now-stamp<=ageMs&&
    new Date(stamp).toISOString().slice(0,19)===value.slice(0,19);
};
const resultJson=(payload,status=200)=>Response.json(payload,{status,headers:{
  "Cache-Control":"no-store",
  "Content-Type":"application/json; charset=utf-8",
  "Access-Control-Allow-Origin":"*",
  "X-Content-Type-Options":"nosniff",
  "Referrer-Policy":"no-referrer",
}});
const denied=()=>resultJson({
  ok:false,schema:THREE_DOMAIN_STRUCTURED_DELIVERY_SCHEMA,
  error:"CANONICAL_THREE_DOMAIN_READBACK_UNAVAILABLE",
  chargeable:false,payment_authorized:false,raw_upstream_delivered:false,
},503);

/** Pure projector; NEVER treats a live source response as commercial rights. */
export function projectThreeDomainStructuredDelivery(continuity,now=Date.now()){
  if(!Number.isFinite(now)||!continuity||continuity.ok!==true||
     continuity.schema!=="geomacro.three-domain-evidence-continuity.v1"||
     continuity.three_domains_returned!==true||
     continuity.chargeable!==false||
     continuity.commercial_rights_verified!==false||
     continuity.raw_upstream_delivered!==false||
     continuity.signed_gro_verified!==false||
     continuity.gri_scored!==false||
     !continuity.categories||typeof continuity.categories!=="object"||
     Array.isArray(continuity.categories)||
     Object.keys(continuity.categories).length!==3||
     !validDate(continuity.checked_at,now,10*60_000))
    throw Error("THREE_DOMAIN_STRUCTURED_SOURCE_CONTRACT_UNVERIFIED");

  const categories={};
  for(const {key,label} of CATEGORIES){
    const row=continuity.categories[key];
    if(!row||row.category!==key||row.chargeable!==false||
       row.commercial_rights_verified!==false||
       row.signed_intelligence_available!==false||
       row.current_news_guaranteed!==false||
       typeof row.source_check_current!=="boolean"||
       typeof row.original_news_window_verified!=="boolean"||
       !Number.isSafeInteger(row.native_news_event_count_72h)||
       row.native_news_event_count_72h<0||
       !Array.isArray(row.source_neutral_news)||row.source_neutral_news.length>NEWS_MAX||
       !Array.isArray(row.official_open_data_findings)||
       row.official_open_data_findings.length>BASELINE_MAX||
       !Array.isArray(row.required_source_credits)||
       row.required_source_credits.length>25||
       row.required_source_credits.some(s=>!validText(s,230)))
      throw Error("THREE_DOMAIN_STRUCTURED_CATEGORY_SOURCE_INVALID");

    const news=[];
    // Never transform an unverified OSINT discovery into a true event. These
    // fields were admitted only by the canonical verified D1 journal reader.
    if(row.original_news_window_verified){
      for(const s of row.source_neutral_news){
        if(!s||Object.keys(s).length!==NEWS_KEYS.size||
           Object.keys(s).some(k=>!NEWS_KEYS.has(k))||
           s.category!==key||!ITEM_ID.test(String(s.id??""))||
           !validText(s.topic,120)||!validText(s.development_type,80)||
           !validText(s.what_changed,650)||!validText(s.why_it_matters,700)||
           s.date_precision!=="exact"&&s.date_precision!=="day")
          throw Error("THREE_DOMAIN_STRUCTURED_NEWS_INVALID");
        const original=s.published_at;
        const isExact=s.date_precision==="exact";
        const period=typeof original==="string"&&/^20\d{2}-\d{2}-\d{2}$/u.test(original)
          ?original:null;
        if(isExact?!validDate(original,now,72*3_600_000):
          period===null||!Number.isFinite(Date.parse(period+"T00:00:00.000Z"))||
            new Date(Date.parse(period+"T00:00:00.000Z")).toISOString().slice(0,10)!==period||
            Date.parse(period+"T00:00:00.000Z")>now||
            now-Date.parse(period+"T00:00:00.000Z")>72*3_600_000)
          throw Error("THREE_DOMAIN_STRUCTURED_ORIGINAL_CLOCK_INVALID");
        news.push({
          record_id:s.id,category:key,record_kind:"native_dated_source_release",
          topic:s.topic,development_type:s.development_type,
          original_published_at:isExact?original:null,
          original_publication_day:isExact?original.slice(0,10):period,
          date_precision:s.date_precision,
          observation_period:null,clock_semantics:isExact?"issuer_native_datetime":"issuer_native_day",
          what_changed:s.what_changed,why_it_matters:s.why_it_matters,
          country_iso3:null, // Never convert publisher geography into event-country
          corroboration_status:"NOT_INDEPENDENTLY_VERIFIED",
          severity:null,market_direction:null,commercially_qualified:false,
        });
      }
    }else if(row.source_neutral_news.length!==0)
      throw Error("THREE_DOMAIN_STRUCTURED_NEWS_WINDOW_UNVERIFIED");

    const references=[];
    for(const finding of row.official_open_data_findings){
      if(!finding||!validText(finding.finding_key,500)||
         !validText(finding.observation_type,300)||
         !validText(finding.observation_period,150)||
         !validText(finding.clock_semantics,120)||
         !validText(finding.geomacro_finds,MAX_TEXT)||
         !validText(finding.why_it_matters,MAX_TEXT)||
         finding.evidence_class!=="official_open_data_unscored"||
         finding.independent_same_event_verification!==false||
         finding.score!==null)
        throw Error("THREE_DOMAIN_STRUCTURED_REFERENCE_INVALID");
      references.push({
        record_id:finding.finding_key,category:key,
        record_kind:"official_statistical_or_reference_context",
        topic:finding.observation_type,observation_period:finding.observation_period,
        clock_semantics:finding.clock_semantics,
        original_published_at:null,
        what_changed:finding.geomacro_finds,why_it_matters:finding.why_it_matters,
        country_iso3:null, // Do not infer 195-country event attribution
        corroboration_status:"NOT_INDEPENDENTLY_VERIFIED",severity:null,
        market_direction:null,commercially_qualified:false,
      });
    }
    // A stale reference may be returned ONLY as an explicitly dated baseline;
    // its last source check does not renew the origin of a past observation.
    const n=news.length+references.length;
    const sourceCheckAt=row.latest_source_check_at;
    if(sourceCheckAt!==null&&!validDate(sourceCheckAt,now,14*86_400_000))
      throw Error("THREE_DOMAIN_STRUCTURED_SOURCE_CLOCK_INVALID");
    categories[key]={
      category:key,label,
      delivery_state:n===0?"NO_OBSERVATION_AVAILABLE":
        row.source_check_current?"OBSERVATIONS_WITH_CURRENT_SOURCE_CHECK":
        "OBSERVATIONS_WITHOUT_CURRENT_SOURCE_CHECK",
      source_check_current:row.source_check_current,
      last_source_check_at:sourceCheckAt,
      publication_window_hours:72,
      native_release_records:news,
      official_reference_records:references,
      native_release_records_count:news.length,
      official_reference_records_count:references.length,
      source_credits_required:row.required_source_credits,
      source_data_present:n>0,
      qualified_paid_records_count:0,
      signed_risk_available:false,
      no_new_release_is_not_a_source_failure:true,
    };
  }
  return {
    ok:true,schema:THREE_DOMAIN_STRUCTURED_DELIVERY_SCHEMA,
    generated_at:continuity.checked_at,
    product:"geomacro_source_derived_three_domain_observations",
    delivery_channel:"PUBLIC_READ_ONLY_STRUCTURED_JSON",
    delivery_state:CATEGORIES.every(d=>categories[d.key].source_data_present)
      ?"THREE_CATEGORIES_WITH_MEASURED_OBSERVATIONS":
      "PARTIAL_OR_EMPTY_SOURCE_OBSERVATIONS",
    categories,
    category_count:3,
    original_news_window_complete:continuity.journal_complete===true,
    data_quality:{
      original_issuer_or_reference_period_required:true,
      issuer_country_does_not_prove_event_country:true,
      open_reference_is_not_current_news:true,
      independent_event_verification:false,
      current_release_in_every_country_guaranteed:false,
      paid_store_delivery_verified:false,
      canonical_source:"CLOUDFLARE_D1_VERIFIED_DERIVED_JOURNAL_AND_OPEN_CONTEXT",
    },
    commercial:{
      chargeable:false,payment_required:false,payment_authorized:false,
      commercially_qualified:false,
      paid_endpoint:"/api/v1/intelligence/query",
      paid_product_preflight_endpoint:"/api/v1/intelligence/products-availability",
      paid_evidence_must_be_separately_verified:true,
    },
    raw_upstream_delivered:false,
    upstream_source_ids_delivered:false,
    required_source_credit_names_may_be_disclosed:true,
    supabase_dependency:false,
    predge_integration_modified:false,
  };
}

/** One existing bounded canonical D1 reader; no additional upstream request. */
export async function deliverThreeDomainStructuredOutput(env,now=Date.now(),
  reader=threeDomainEvidenceContinuity){
  if(!env?.DB||!Number.isFinite(now))return denied();
  let response;
  try{
    response=await reader(env,now);
    if(response.status!==200)return denied();
    const original=await response.json();
    return resultJson(projectThreeDomainStructuredDelivery(original,now));
  }catch{return denied();}
}


// One in-isolate, per-D1 binding recovery flight for public structured reads.
// This does not cache news, bypass source verification or alter partner routes.
const canonicalRecoveryFlights=new WeakMap();
const waitForCanonicalRecovery=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function boundedCanonicalRecovery(env,readCanonical,now){
 const db=env?.DB;
 if(!db||typeof db!=="object")return denied();
 let state=canonicalRecoveryFlights.get(db);
 if(!state){state={pending:null,cooldownUntil:0};canonicalRecoveryFlights.set(db,state);}
 // Coalesce an actual 503 burst BEFORE checking the failure circuit; clients
 // observing the same source failure share a single bounded origin recovery.
 if(state.pending)return (await state.pending).clone();
 if(state.cooldownUntil>Date.now())return denied();
 const work=(async()=>{
  try{
   await waitForCanonicalRecovery(750);
   let result=await readCanonical();
   // Only a second actual 503 permits one final paced read. No retries for
   // 400/401/429, malformed 200, unrelated sources or protected endpoints.
   if(result?.status===503){
    await waitForCanonicalRecovery(1000);
    result=await readCanonical();
   }
   if(result?.status!==200){
    if(!result||result.status===503)state.cooldownUntil=Date.now()+5000;
    return result??denied();
   }
   // Revalidate before sharing recovery across concurrent public requests.
   // Existing downstream delivery repeats this strict fail-closed projection.
   projectThreeDomainStructuredDelivery(await result.clone().json(),now);
   state.cooldownUntil=0;
   return result;
  }catch{
   state.cooldownUntil=Date.now()+5000;
   return denied();
  }
 })();
 state.pending=work;
 try{return (await work).clone();}
 finally{if(state.pending===work)state.pending=null;}
}

/**
 * The structured endpoint originally reused the continuity endpoint's
 * POP-cache key to avoid additional D1 scans. A cache hit can be HTTP 200
 * yet fail the stricter structured-delivery contract; blindly projecting
 * it then returns 503 even if a fresh canonical D1 read would pass.
 *
 * Validate a clone of the cached source BEFORE handing it to the projector.
 * Only when that cached HTTP 200 is incompatible, bypass cache ONCE and
 * validate a fresh canonical D1 readback via the regular fail-closed path.
 * Only source HTTP 503 is also retried once, and ONLY after an actual 503. Never promote
 * cached unsupported data to commercial evidence. Normal healthy reads still use
 * the existing shared cache and spend no new provider reads.
 */
export async function deliverThreeDomainStructuredWithCacheRecovery(
 env,now=Date.now(),readCached,readCanonical){
 if(typeof readCached!=="function"||typeof readCanonical!=="function")
  return denied();
 return deliverThreeDomainStructuredOutput(env,now,async()=>{
  const cached=await readCached();
  // A first anonymous canonical read can return a transient 503 although
  // an immediately following uncached canonical read is healthy (confirmed
  // by real protected-run HTTP 503/200 pairs). Retry exactly ONE no-cache
  // read on 503, but NEVER relabel a second 503 as available or chargeable.
  // No retry on 429, 401, 400 or other status; no concurrent source fetch.
  if(cached?.status===503)return boundedCanonicalRecovery(env,readCanonical,now);
  if(cached?.status!==200)return cached;
  try{
   const body=await cached.clone().json();
   projectThreeDomainStructuredDelivery(body,now);
   return cached;
  }catch{
   // One canonical no-cache source read, then the regular strict projector.
   // No hidden retries or source mutation; if D1 is down, return 503.
   return boundedCanonicalRecovery(env,readCanonical,now);
  }
 });
}
