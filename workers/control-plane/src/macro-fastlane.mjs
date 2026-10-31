import {collectDirectReleaseCandidates,deriveCriticalReleaseSignals} from "../../../scripts/lib/macro-direct-release.mjs";
import {MINERALS_SOURCE_IDS} from "../../../scripts/lib/critical-minerals-registry.mjs";
import {collectMacroFastlane} from '../../../scripts/lib/macro-fastlane-collector.mjs';
import {MACRO_NEWS_SOURCES,normalizeMetalQuote,measuredPriceReaction,macroEventContext} from '../../../scripts/lib/macro-fx-metals.mjs';
import {releaseWindowEvents,criticalSourceIds} from '../../../scripts/lib/macro-release-calendar.mjs';
import {publishDerivedStories} from './website-derived-intelligence.mjs';
import {loadNewsIntakePolicy} from './news-intake-policy.mjs';
const KEY='macro_fx_metals_fastlane_v1';
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Access-Control-Allow-Origin':'*','X-Content-Type-Options':'nosniff'}});
const ids=new Set(MACRO_NEWS_SOURCES.map(x=>x.id));
const states=new Set(['OK','NOT_MODIFIED','COOLDOWN','ACCESS_DENIED','RATE_LIMITED','OVERSIZE','REDIRECT','FEED_SHAPE_INVALID','UNAVAILABLE']);
export function validateMacroState(s,now=Date.now()){
 if(!s||s.schema!=='geomacro.macro-fastlane-state.v1'||!Number.isFinite(Date.parse(s.checked_at))||Date.parse(s.checked_at)>now+60000||Date.parse(s.checked_at)<now-15*60000||!Array.isArray(s.events)||s.events.length>128||!Array.isArray(s.quotes)||s.quotes.length>40||!Array.isArray(s.source_checks)||s.source_checks.length>15||typeof s.cursors!=='object'||s.cursors===null||Array.isArray(s.cursors)||Object.keys(s.cursors).some(k=>!ids.has(k))||!Number.isFinite(s.calendar_checked_at)||s.calendar_checked_at>now+60000||!Array.isArray(s.calendar_checks)||s.calendar_checks.length>3||!Array.isArray(s.price_checks)||s.price_checks.length>2)return false;
 if(s.mineral_cursors!==undefined&&(typeof s.mineral_cursors!=="object"||s.mineral_cursors===null||Array.isArray(s.mineral_cursors)||Object.entries(s.mineral_cursors).some(([id,c])=>!MINERALS_SOURCE_IDS.includes(id)||!c||!(c.etag===null||typeof c.etag==="string"&&c.etag.length<=200&&!/[\r\n]/.test(c.etag))||!Number.isFinite(c.retry_after)||c.retry_after>now+16*60000||!Number.isFinite(c.checked_at)||c.checked_at>now+60000)))return false;
 if(s.mineral_checks!==undefined&&(!Array.isArray(s.mineral_checks)||s.mineral_checks.length>13||s.mineral_checks.some(c=>!MINERALS_SOURCE_IDS.includes(c.id)||!states.has(c.state)||!Number.isSafeInteger(c.candidates)||c.candidates<0||c.candidates>150)))return false;
 if(s.mineral_regions!==undefined&&(!Array.isArray(s.mineral_regions)||![0,6].includes(s.mineral_regions.length)||s.mineral_regions.some(r=>!["africa","asia","europe","north_america","south_america","oceania"].includes(r.region)||["primary_healthy","recent_primary_release","fallback_attempted","fallback_healthy"].some(k=>typeof r[k]!=="boolean")||r.publisher_region_is_event_country!==false||typeof r.global_substitute_healthy!=="boolean")))return false;
 if(s.events.some(e=>!['cpi','ppi','nfp','fomc','ecb_rates'].includes(e.kind)||!['bls','fed','ecb'].includes(e.source)||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/.test(e.at)||!Number.isFinite(Date.parse(e.at))))return false;
 if(s.source_checks.some(c=>!ids.has(c.id)||!(states.has(c.state)||/^HTTP_[45]\d\d$/.test(c.state))||!Number.isSafeInteger(c.candidates)||c.candidates<0||c.candidates>75))return false;
 if(s.calendar_checks.some(c=>!['bls','fed','ecb'].includes(c.id)||!['OK','UNAVAILABLE'].includes(c.state)||!Number.isSafeInteger(c.events)||c.events<0||c.events>128))return false;
 if(s.price_checks.some(c=>!['XAU/USD','XAG/USD'].includes(c.instrument)||!['CURRENT_INDICATION','STALE_OR_INVALID','UNAVAILABLE'].includes(c.state)))return false;
 if(Object.values(s.cursors).some(c=>!c||!(c.etag===null||typeof c.etag==='string'&&c.etag.length<=200&&!/[\r\n]/.test(c.etag))||!Number.isFinite(c.retry_after)||c.retry_after>now+16*60000||!Number.isFinite(c.checked_at)||c.checked_at>now+60000))return false;
 if(s.fx_checked_at!==undefined&&(!Number.isSafeInteger(s.fx_checked_at)||s.fx_checked_at<0||s.fx_checked_at>now+60000))return false;
 const fx=s.fx_reference;
 if(fx!==undefined&&fx!==null){
  const day=Date.parse(String(fx.reference_date??"")+"T00:00:00Z");
  if(fx.provider!=="ECB_DAILY_REFERENCE"||fx.base!=="EUR"||fx.intraday_live_verified!==false||fx.transaction_price!==false||
     !/^\\d{4}-\\d{2}-\\d{2}$/.test(fx.reference_date)||
     !Number.isFinite(day)||day>now||now-day>8*86400000||
     new Date(day).toISOString().slice(0,10)!==fx.reference_date||
     !Array.isArray(fx.rates)||fx.rates.length!==3||
     fx.rates.some((q,i)=>q.currency!==["USD","GBP","JPY"][i]||!Number.isFinite(q.per_eur)||q.per_eur<=0||q.per_eur>=1000000))return false;
 }
 if(s.quotes.some(q=>!['XAU/USD','XAG/USD'].includes(q.instrument)||q.currency!=='USD'||q.unit!=='troy_ounce'||q.quote_kind!=='provider_spot_indication'||q.provider_latency_verified!==false||q.exchange_tick_verified!==false||!Number.isFinite(q.value)||q.value<=0||!Number.isFinite(Date.parse(q.observed_at))||Date.parse(q.observed_at)>now||!Number.isFinite(Date.parse(q.received_at))||Date.parse(q.received_at)>now+60000))return false;
 const lease=Date.parse(s.quota_lease_until);return Number.isFinite(lease)&&lease>=now&&lease<=now+13*60000;
}
export async function loadMacroState(env){
 const row=await env.DB.prepare('SELECT value_json FROM control_state WHERE key=? LIMIT 1').bind(KEY).first();
 return row?JSON.parse(row.value_json):{};
}
export async function storeMacroState(env,state,now=Date.now()){
 if(!validateMacroState(state,now))return reply({ok:false,error:'MACRO_STATE_INVALID'},400);
 // Explicit projection: neither private article titles nor URLs enter this row.
 const clean={
  mineral_cursors:Object.fromEntries(Object.entries(state.mineral_cursors??{}).map(([id,c])=>[id,{etag:c.etag,retry_after:c.retry_after,checked_at:c.checked_at}])),
  mineral_checks:(state.mineral_checks??[]).map(({id,state,candidates})=>({id,state,candidates})),
  mineral_regions:(state.mineral_regions??[]).map(({region,primary_healthy,recent_primary_release,fallback_attempted,fallback_healthy,publisher_region_is_event_country,global_substitute_healthy})=>({region,primary_healthy,recent_primary_release,fallback_attempted,fallback_healthy,publisher_region_is_event_country,global_substitute_healthy})),
  schema:state.schema,checked_at:state.checked_at,quota_lease_until:state.quota_lease_until,calendar_checked_at:state.calendar_checked_at,
  fx_checked_at:state.fx_checked_at??0,fx_reference:state.fx_reference??null,
  events:state.events.map(({kind,at,source})=>({kind,at,source})),quotes:state.quotes.map(({instrument,value,currency,unit,observed_at,received_at,quote_kind,provider_latency_verified,exchange_tick_verified})=>({instrument,value,currency,unit,observed_at,received_at,quote_kind,provider_latency_verified,exchange_tick_verified})),
  cursors:Object.fromEntries(Object.entries(state.cursors).map(([id,c])=>[id,{etag:c.etag,retry_after:c.retry_after,checked_at:c.checked_at}])),
  source_checks:state.source_checks.map(({id,state,candidates})=>({id,state,candidates})),price_checks:state.price_checks.map(({instrument,state})=>({instrument,state})),calendar_checks:state.calendar_checks.map(({id,state,events})=>({id,state,events})),
 };
 await env.DB.prepare(`INSERT INTO control_state(key,value_json,version,updated_at) VALUES(?,?,1,?)
 ON CONFLICT(key) DO UPDATE SET
 value_json=CASE WHEN control_state.updated_at>excluded.updated_at
  THEN json_set(control_state.value_json,'$.quota_lease_until',
   MAX(json_extract(control_state.value_json,'$.quota_lease_until'),json_extract(excluded.value_json,'$.quota_lease_until')))
  ELSE json_set(excluded.value_json,'$.quota_lease_until',
   MAX(json_extract(control_state.value_json,'$.quota_lease_until'),json_extract(excluded.value_json,'$.quota_lease_until'))) END,
 version=control_state.version+1,updated_at=MAX(control_state.updated_at,excluded.updated_at)` ).bind(KEY,JSON.stringify(clean),clean.checked_at).run();
 return reply({ok:true,category:'macro',state_saved:true,state_merge_policy:'NEWEST_SNAPSHOT_PLUS_LONGEST_QUOTA_LEASE'});
}
export function publicMacroProjection(state,now=Date.now(),intakePolicy=null){
 const fresh=Number.isFinite(Date.parse(state?.checked_at))&&now-Date.parse(state.checked_at)<=15*60000&&Date.parse(state.checked_at)<=now;
 const quotes=(state?.quotes??[]).filter(q=>now-Date.parse(q.observed_at)<=5*60000&&Date.parse(q.observed_at)<=now);
 const latest=Object.values(Object.fromEntries(quotes.map(q=>[q.instrument,q])));
 return {ok:true,schema:'geomacro.macro-fastlane-public.v1',category:'macro',parent_label:'Macro Economics',lanes:['forex','precious_metals'],checked_at:state?.checked_at??null,
  status:fresh?'RECENT_POLL_OBSERVED':'POLL_FRESHNESS_UNVERIFIED',quota_state:Date.parse(state?.quota_lease_until)>now?'ADMITTED':'HELD',quota_admitted_until:state?.quota_lease_until??null,
  source_intake:intakePolicy?.schema==='geomacro.news-intake-admission.v1'?{interval_minutes:intakePolicy.interval_minutes,max_new_rows:intakePolicy.max_new_rows,last_success_at:intakePolicy.last_success_at,next_due_at:new Date(Date.parse(intakePolicy.last_success_at)+intakePolicy.interval_minutes*60000).toISOString(),mode:intakePolicy.interval_minutes===5?'FIVE_MINUTE_TARGET':'ADAPTIVE_CADENCE',success_clock_is_not_a_new_release:true}:null,
  news_stream:'/v1/public/website-derived-news-immediate',machine_stream:'/v1/public/fastlane-intelligence?domain=macro',
  critical_minerals:{category:"rare_earth",regional_groups:state?.mineral_regions??[],source_health:state?.mineral_checks??[],global_completeness_verified:false},
  source_health:state?.source_checks??[],calendar_health:state?.calendar_checks??[],price_health:state?.price_checks??[],
  scheduled_releases:(state?.events??[]).filter(e=>Date.parse(e.at)>=now-20*60000).slice(0,12),prices:latest,
  forex_price_feed_status:state?.fx_reference?'ECB_DAILY_REFERENCE_ONLY':'NOT_CONFIGURED',
  fx_reference:state?.fx_reference??null,
  price_status:latest.length===2?'CURRENT_PROVIDER_INDICATIONS':'PRICE_EVIDENCE_INCOMPLETE',
  critical_poll_target_seconds:60,github_poll_target_seconds:300,release_window_minutes:22,
  guaranteed_latency:false,real_time_exchange_quotes_verified:false,raw_news_delivered:false};
}
export async function readPublicMacro(env,now=Date.now()){
 try{const state=await loadMacroState(env);let policy=null;try{policy=await loadNewsIntakePolicy(env);}catch{/* Source-clock failure cannot hide otherwise available quotes/news. */}return reply(publicMacroProjection(state,now,policy));}catch{return reply({ok:false,error:'MACRO_READ_UNAVAILABLE',category:'macro'},503);}
}
export async function runMacroReleaseTick(env,{now=Date.now(),fetchImpl=fetch}={}){
 const startClock=Date.now(),quoteClock=()=>now+Date.now()-startClock;
 const state=await loadMacroState(env);
 // Expiring admission is refreshed ONLY by the existing quota-gated GitHub
 // bundle. Cron never renews its own lease or bypasses an exhausted account.
 if(!Number.isFinite(Date.parse(state.quota_lease_until))||Date.parse(state.quota_lease_until)<=now)return {state:'QUOTA_LEASE_HELD',source_requests:0};
 const window=releaseWindowEvents(state.events,now);
 if(!window.length)return {state:'OUTSIDE_RELEASE_WINDOW',source_requests:0};
 // Same minute cannot be retried into unbounded origin/D1 consumption.
 if(Date.parse(state.checked_at)>now-55000)return {state:'ALREADY_POLLED',source_requests:0};
 const sourceIds=criticalSourceIds(window);
 const collected=await collectMacroFastlane({now,quoteClock,fetchImpl,state,sourceIds,release:true,prices:true,calendars:false});
 const direct=await collectDirectReleaseCandidates(window,{now,fetchImpl,existing:collected.candidates});
 const signals=deriveCriticalReleaseSignals([...collected.candidates,...direct.candidates],window,now);
 if(signals.length){const response=await publishDerivedStories(env,{schema:'geomacro.website-derived-news-batch.v1',signals},now);if(!response.ok)throw Error('MACRO_RELEASE_PUBLICATION_FAILED');const prune=await publishDerivedStories(env,{schema:'geomacro.website-derived-news-batch.v1',signals:[]},now);if(!prune.ok)throw Error('MACRO_RELEASE_RETENTION_FAILED');}
 collected.state.quota_lease_until=state.quota_lease_until;
 collected.state.source_checks=[...state.source_checks.filter(c=>!sourceIds.includes(c.id)),...collected.state.source_checks];
 const stored=await storeMacroState(env,collected.state,quoteClock());if(!stored.ok)throw Error('MACRO_RELEASE_STATE_FAILED');
 return {state:'RELEASE_POLLED',category:'macro',source_requests:collected.receipt.upstream_requests+direct.requests,direct_original_checks:direct.checks,derived_rows:signals.length,prices:collected.state.price_checks,latency_verified:false};
}
export function macroPriceEvidence(signal,state){
 const context=macroEventContext(signal);if(!context)return null;
 const at=Date.parse(signal.published_at),quotes=state?.quotes??[];
 const reactions=context.related_instruments.flatMap(instrument=>{
  const selected=quotes.filter(q=>q.instrument===instrument).sort((a,b)=>a.observed_at.localeCompare(b.observed_at));
  const before=selected.filter(q=>Date.parse(q.observed_at)<=at).at(-1),after=selected.find(q=>Date.parse(q.observed_at)>at);
  const reaction=measuredPriceReaction(signal.published_at,before,after);return reaction?[reaction]:[];
 });
 return {...context,price_reaction:reactions.length?reactions:null};
}
