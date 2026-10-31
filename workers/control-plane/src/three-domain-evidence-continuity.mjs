/**
 * Always-addressable, free public three-category CONTINUITY view over the
 * existing Cloudflare D1 derivatives: official-source 30m pulse, 72h
 * first-party derived news, and independently measured open-data contexts.
 *
 * It does not guarantee an upstream event was issued, does not change an
 * original time, and does not confer permission to charge, sign GRI or sell
 * third-party data. An old valid context may be exposed ONLY as explicitly
 * historical last-known evidence. Does not create a new store or poll upstream.
 */
import {readDerivedStoriesBundle} from "./website-derived-intelligence.mjs";
import {projectPublic30mPulse} from "./source-pulse-public.mjs";
import {validOpenDataContext} from "../../../src/lib/category-open-data-contract.ts";

const DOMAIN_SCOPES=Object.freeze([
  {domain:"geopolitics",open:"geopolitics",scope:"geopolitics"},
  {domain:"macro",open:"macro-fx",scope:"macro"},
  {domain:"rare_earth",open:"critical-minerals",scope:"rare_earth"},
]);
const LAST_KNOWN_MAX_AGE=14*86_400_000;
const CURRENT_SOURCE_MAX_AGE=3*3_600_000;
const FIXED_FIELDS=["id","category","topic","development_type",
  "published_at","date_precision","what_changed","why_it_matters"];
const json=(value,status=200)=>Response.json(value,{status,headers:{
  "Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
  "Referrer-Policy":"no-referrer","Access-Control-Allow-Origin":"*",
}});
function realClock(at,now){
  if(typeof at!=="string"||!/^(?:20\d{2})-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u.test(at))return null;
  const ms=Date.parse(at);
  return Number.isFinite(ms)&&ms<=now&&new Date(ms).toISOString().slice(0,19)===at.slice(0,19)?ms:null;
}
function emptyDomain(d){
  return {
    category:d.domain,service_state:"NO_VERIFIED_SOURCE_CONTEXT",
    data_present:false,source_check_current:false,
    latest_source_check_at:null,
    data_clock_semantics:"NO_NATIVE_CURRENT_DATA_VERIFIED",
    open_data_reference_status:"UNAVAILABLE",
    source_families_readable:0,source_families_attempted:0,
    official_open_data_findings:[],
    required_source_credits:[],
    native_news_event_count_72h:0,
    latest_native_news_published_at:null,
    source_neutral_news:[],
    private_osint_source_check:{status:"NOT_VERIFIED",last_checked_at:null,
      healthy_distinct_feeds:0,zero_new_native_items_observed:false},
    original_news_window_verified:false,
    current_news_guaranteed:false,
    commercial_rights_verified:false,signed_intelligence_available:false,
    chargeable:false,
  };
}
function openDataFromCheckpoint(row,d,now){
  if(!row||typeof row.metadata_json!=="string"||row.metadata_json.length>55_000)return null;
  let payload;
  try{payload=JSON.parse(row.metadata_json)}catch{return null}
  const value=payload?.context;
  const checked=realClock(value?.checked_at,now);
  if(checked===null||now-checked>LAST_KNOWN_MAX_AGE||
    // Validate the complete original schema at its own clock, never
    // misrepresent a historical D1 readback as a new source check.
    !validOpenDataContext(value,d.open,checked))return null;
  return {value,checked,current:now-checked<=CURRENT_SOURCE_MAX_AGE};
}
async function readJournal(env,now){
  const signals=[];
  try{
    // One canonical bounded scan replaces three overlapping OFFSET scans.
    // Keep this independent of public materialization/cache and all signatures.
    const response=await readDerivedStoriesBundle(env,now,false);
    if(response.status!==200)throw Error("JOURNAL_UNAVAILABLE");
    const bundle=await response.json();
    if(bundle.ok!==true||bundle.complete!==true||bundle.item_cap!==600||
      bundle.schema!=="geomacro.website-derived-news-bundle.v1"||
      !Array.isArray(bundle.signals)||bundle.signals.length>600)
      throw Error("JOURNAL_CONTRACT_INVALID");
    // Retain source-neutral fields only; the canonical reader checks native
    // clocks and the 72h window before any category projection.
    for(const row of bundle.signals){
      if(row.sources_credited?.length!==0)continue;
      if(!FIXED_FIELDS.every(k=>Object.hasOwn(row,k)))continue;
      signals.push(Object.fromEntries(FIXED_FIELDS.map(k=>[k,row[k]])));
    }
  }catch{return {complete:false,signals:[]}}
  const seen=new Set();
  return {complete:true,signals:signals.filter(s=>{
    if(seen.has(s.id))return false;seen.add(s.id);return true;
  })};
}
// The source-only micro-intake independently checks public feed transport.
// Persisted three-category checkpoints are verified against the real D1
// attempt/success clocks. This does not renew any dated article, original
// publisher-pair pulse, open-data reference period, or paid evidence.
function osintHeartbeatFromCheckpoint(row,d,now){
 if(!row||typeof row.metadata_json!=="string"||
    row.metadata_json.length>4000)return null;
 let payload;
 try{payload=JSON.parse(row.metadata_json)}catch{return null}
 const checked=realClock(payload?.checked_at,now);
 if(checked===null||checked!==realClock(row.last_attempt_at,now)||
    now-checked>LAST_KNOWN_MAX_AGE||
    payload.schema!=="geomacro.private-osint-source-heartbeat.v1"||
    payload.category!==d.domain||
    payload.new_events_verified!==false||
    payload.commercial_rights_verified!==false||
    payload.signed_intelligence_available!==false||
    payload.chargeable!==false||
    !Number.isSafeInteger(payload.healthy_distinct_feed_endpoints)||
    payload.healthy_distinct_feed_endpoints<0||
    payload.healthy_distinct_feed_endpoints>512||
    !Number.isSafeInteger(payload.native_dated_items_in_collector_batch)||
    payload.native_dated_items_in_collector_batch<0||
    payload.native_dated_items_in_collector_batch>768)return null;
 const healthy=row.status==="OBSERVED"&&payload.healthy===true&&
    payload.healthy_distinct_feed_endpoints>0&&
    row.last_success_at===payload.checked_at;
 const degraded=row.status==="DEGRADED"&&payload.healthy===false&&
    payload.healthy_distinct_feed_endpoints===0&&row.last_success_at===null;
 if(!healthy&&!degraded)return null;
 return {checked,healthy,current:healthy&&now-checked<=CURRENT_SOURCE_MAX_AGE,
   healthyDistinctFeeds:payload.healthy_distinct_feed_endpoints,
   zeroNativeItemsObserved:healthy&&payload.native_dated_items_in_collector_batch===0};
}
async function readOsintHeartbeats(env,now){
 try{
  const r=await env.DB.prepare(
    "SELECT scope,status,last_attempt_at,last_success_at,metadata_json FROM pipeline_checkpoint WHERE pipeline=? AND scope IN ('geopolitics','macro','rare_earth') LIMIT 4"
  ).bind("private_osint_source_15m_heartbeat").all();
  return DOMAIN_SCOPES.map(d=>osintHeartbeatFromCheckpoint(
    (r.results??[]).find(x=>x.scope===d.domain),d,now));
 }catch{return DOMAIN_SCOPES.map(()=>null)}
}
async function readPulse(env,now){
  try{
    const r=await env.DB.prepare(
      "SELECT scope,status,last_attempt_at,metadata_json FROM pipeline_checkpoint WHERE pipeline=? AND scope IN ('geopolitics','macro','rare_earth') LIMIT 4"
    ).bind("official_source_pulse_30m").all();
    return projectPublic30mPulse(r.results??[],new Date(now));
  }catch{
    return projectPublic30mPulse([],new Date(now));
  }
}
export async function threeDomainEvidenceContinuity(env,now=Date.now()){
  if(!env?.DB||!Number.isFinite(now))
    return json({ok:false,error:"CONTINUITY_D1_UNAVAILABLE",chargeable:false},503);
  // A category's checkpoint being inaccessible must never hide another
  // category's already verified data. All reads are bounded and independent.
  const [journal,pulse,contexts,osintHeartbeats]=await Promise.all([
    readJournal(env,now),readPulse(env,now),
    Promise.all(DOMAIN_SCOPES.map(async d=>{
      try{
        const row=await env.DB.prepare(
          "SELECT metadata_json FROM pipeline_checkpoint WHERE pipeline=? AND scope=? LIMIT 1"
        ).bind("supabase_free_source_runtime",d.scope).first();
        return openDataFromCheckpoint(row,d,now);
      }catch{return null}
    })),
    readOsintHeartbeats(env,now),
  ]);
  // If the journal, historical contexts AND pulse readback all fail, don't
  // disguise a D1 outage as a healthy empty data day.
  const anyPulseVerified=DOMAIN_SCOPES.some(d=>
    pulse.categories[d.domain]?.status==="SOURCE_NATIVE_OBSERVED");
  if(!journal.complete&&!contexts.some(Boolean)&&!anyPulseVerified&&
     !osintHeartbeats.some(x=>x?.healthy===true))
    return json({ok:false,error:"CONTINUITY_ALL_READBACKS_UNAVAILABLE",
      chargeable:false,three_domains_returned:false},503);
  const categories={};
  for(let i=0;i<DOMAIN_SCOPES.length;i++){
    const d=DOMAIN_SCOPES[i],result=emptyDomain(d),snapshot=contexts[i],
      heartbeat=osintHeartbeats[i];
    const matching=journal.complete?journal.signals.filter(s=>s.category===d.domain):[];
    result.original_news_window_verified=journal.complete;
    result.native_news_event_count_72h=matching.length;
    result.latest_native_news_published_at=matching[0]?.published_at??null;
    result.source_neutral_news=matching.slice(0,5);
    if(snapshot){
      const {value,checked,current}=snapshot;
      result.source_check_current=current;
      result.latest_source_check_at=new Date(checked).toISOString();
      result.open_data_reference_status=current?
        value.status==="DERIVED_CONTEXT_AVAILABLE"?
          "VERIFIED_SOURCE_CHECK_WITH_CONTEXT":"VERIFIED_SOURCE_CHECK_NO_NEW_CONTEXT":
        "LAST_KNOWN_HISTORICAL_NOT_REALTIME";
      result.source_families_readable=value.source_families_readable;
      result.source_families_attempted=value.source_families_attempted;
      result.official_open_data_findings=value.findings;
      // Free observational route includes only mandatory dataset credits,
      // never confidential original publishers, article URLs or raw payloads.
      result.required_source_credits=value.licensed_source_credits;
      result.data_clock_semantics=current?
        "SOURCE_CHECK_CLOCK_DISTINCT_FROM_REFERENCE_PERIOD":
        "HISTORICAL_REFERENCE_ONLY_SOURCE_CHECK_STALE";
    }
    if(heartbeat){
      result.private_osint_source_check={
        status:heartbeat.healthy?"HEALTHY_FEED_OBSERVED":"SOURCE_TRANSPORT_DEGRADED",
        last_checked_at:new Date(heartbeat.checked).toISOString(),
        healthy_distinct_feeds:heartbeat.healthyDistinctFeeds,
        zero_new_native_items_observed:heartbeat.zeroNativeItemsObserved,
      };
      // The latest independently healthy transport check may be newer than
      // a stale official context. Never relabel that historical context as
      // freshly retrieved open data or a publisher-pair corroboration.
      if(heartbeat.current){
        const previous=realClock(result.latest_source_check_at,now);
        if(previous===null||heartbeat.checked>previous)
          result.latest_source_check_at=new Date(heartbeat.checked).toISOString();
        result.source_check_current=true;
        result.data_clock_semantics="SOURCE_CHECK_CLOCK_DISTINCT_FROM_REFERENCE_PERIOD";
      }
    }
    const pulseRow=pulse.categories[d.domain];
    result.original_publisher_pulse={
      status:pulseRow.status,
      last_checked_at:pulseRow.last_checked_at,
      publisher_pair_sample_complete:pulseRow.publisher_pair_sample_complete,
      no_new_original_topic_item_observed:pulseRow.no_new_original_topic_item_observed,
    };
    result.data_present=result.official_open_data_findings.length>0||
      result.native_news_event_count_72h>0;
    result.service_state=result.source_check_current
      ?result.data_present?"CURRENT_SOURCE_CHECK_WITH_DATA":"CURRENT_SOURCE_CHECK_NO_QUALIFYING_DATA"
      :result.data_present?"LAST_KNOWN_OR_NEWS_ONLY_NOT_CURRENT_SOURCE_CHECK":
       "NO_VERIFIED_SOURCE_CONTEXT";
    categories[d.domain]=result;
  }
  const all=DOMAIN_SCOPES.every(d=>categories[d.domain].data_present);
  const checked=DOMAIN_SCOPES.every(d=>categories[d.domain].source_check_current);
  return json({
    ok:true,schema:"geomacro.three-domain-evidence-continuity.v1",
    checked_at:new Date(now).toISOString(),
    categories,three_domains_returned:true,
    all_categories_have_observation:all,
    all_categories_source_check_current:checked,
    journal_complete:journal.complete,
    source_pulse_poll_target_minutes:30,
    source_monitoring_schedule_guaranteed:false,
    data_is_original_release_news_only:false,
    upstream_new_event_guaranteed:false,
    original_native_publication_times_preserved:true,
    country_specific_commercial_evidence_verified:false,
    x402_payment_required:false,chargeable:false,commercial_rights_verified:false,
    signed_gro_verified:false,gri_scored:false,
    raw_upstream_delivered:false,supabase_dependency:false,
  });
}
