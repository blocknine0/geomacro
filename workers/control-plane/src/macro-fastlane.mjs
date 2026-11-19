import {collectDirectReleaseCandidates,deriveCriticalReleaseSignals} from "../../../scripts/lib/macro-direct-release.mjs";
import {MINERALS_SOURCE_IDS} from "../../../scripts/lib/critical-minerals-registry.mjs";
import {collectMacroFastlane} from '../../../scripts/lib/macro-fastlane-collector.mjs';
import {MACRO_NEWS_SOURCES,normalizeMetalQuote,measuredPriceReaction,macroEventContext} from '../../../scripts/lib/macro-fx-metals.mjs';
import {releaseWindowEvents,criticalSourceIds} from '../../../scripts/lib/macro-release-calendar.mjs';
import {publishDerivedStories} from './website-derived-intelligence.mjs';
import {loadNewsIntakePolicy} from './news-intake-policy.mjs';
export const MACRO_FASTLANE_BODY_MAX_BYTES=64*1024;
const KEY='macro_fx_metals_fastlane_v1';
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Access-Control-Allow-Origin':'*','X-Content-Type-Options':'nosniff'}});
const ids=new Set(MACRO_NEWS_SOURCES.map(x=>x.id));
const states=new Set(['OK','NOT_MODIFIED','COOLDOWN','ACCESS_DENIED','RATE_LIMITED','OVERSIZE','REDIRECT','FEED_SHAPE_INVALID','UNAVAILABLE']);
const validCursorDate=c=>c.last_modified===undefined||c.last_modified===null||
 (typeof c.last_modified==='string'&&c.last_modified.length<=80&&
 /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(c.last_modified)&&Number.isFinite(Date.parse(c.last_modified)));
const validHttpState=value=>states.has(value)||/^HTTP_[45]\d\d$/.test(value);
const invalidCursorField=(cursor,now,maxRetryAhead)=>{
 if(!cursor)return 'cursor';
 if(!(cursor.etag===null||typeof cursor.etag==='string'&&cursor.etag.length<=200&&!/[\r\n]/.test(cursor.etag)))return 'etag';
 if(!Number.isFinite(cursor.retry_after)||cursor.retry_after>now+maxRetryAhead)return 'retry_after';
 if(!Number.isFinite(cursor.checked_at)||cursor.checked_at>now+60000)return 'checked_at';
 if(!validCursorDate(cursor))return 'last_modified';
 return null;
};
/** Return the precise first invalid field without echoing submitted source data. */
export function macroStateInvalidField(s,now=Date.now()){
 if(!s||s.schema!=='geomacro.macro-fastlane-state.v1')return 'schema';
 const checked=Date.parse(s.checked_at);
 if(!Number.isFinite(checked)||checked>now+60000||checked<now-15*60000)return 'checked_at';
 if(!Array.isArray(s.events)||s.events.length>128)return 'events';
 if(!Array.isArray(s.quotes)||s.quotes.length>40)return 'quotes';
 if(!Array.isArray(s.source_checks)||s.source_checks.length>MACRO_NEWS_SOURCES.length)return 'source_checks';
 if(typeof s.cursors!=='object'||s.cursors===null||Array.isArray(s.cursors))return 'cursors';
 if(Object.keys(s.cursors).some(k=>!ids.has(k)))return 'cursors';
 if(!Number.isFinite(s.calendar_checked_at)||s.calendar_checked_at>now+60000)return 'calendar_checked_at';
 if(!Array.isArray(s.calendar_checks)||s.calendar_checks.length>3)return 'calendar_checks';
 if(!Array.isArray(s.price_checks)||s.price_checks.length>2)return 'price_checks';
 if(s.mineral_cursors!==undefined){
  if(typeof s.mineral_cursors!=='object'||s.mineral_cursors===null||Array.isArray(s.mineral_cursors))return 'mineral_cursors';
  for(const [id,c] of Object.entries(s.mineral_cursors)){
   if(!MINERALS_SOURCE_IDS.includes(id))return `mineral_cursors.${id}`;
   const field=invalidCursorField(c,now,61*60000);if(field)return `mineral_cursors.${id}.${field}`;
  }
 }
 if(s.mineral_checks!==undefined){
  if(!Array.isArray(s.mineral_checks)||s.mineral_checks.length>MINERALS_SOURCE_IDS.length)return 'mineral_checks';
  for(let i=0;i<s.mineral_checks.length;i++){
   const c=s.mineral_checks[i];
   if(!c||typeof c!=='object'||!MINERALS_SOURCE_IDS.includes(c.id))return `mineral_checks[${i}].id`;
   if(!validHttpState(c?.state))return `mineral_checks[${i}].state`;
   if(!Number.isSafeInteger(c.candidates)||c.candidates<0||c.candidates>150)return `mineral_checks[${i}].candidates`;
  }
 }
 if(s.mineral_regions!==undefined){
  if(!Array.isArray(s.mineral_regions)||![0,6].includes(s.mineral_regions.length))return 'mineral_regions';
  for(let i=0;i<s.mineral_regions.length;i++){
   const r=s.mineral_regions[i];
   if(!r||typeof r!=='object'||!['africa','asia','europe','north_america','south_america','oceania'].includes(r.region))return `mineral_regions[${i}].region`;
   for(const k of ['primary_healthy','recent_primary_release','fallback_attempted','fallback_healthy'])if(typeof r[k]!=='boolean')return `mineral_regions[${i}].${k}`;
   if(r.publisher_region_is_event_country!==false)return `mineral_regions[${i}].publisher_region_is_event_country`;
   if(typeof r.global_substitute_healthy!=='boolean')return `mineral_regions[${i}].global_substitute_healthy`;
  }
 }
 for(let i=0;i<s.events.length;i++){
  const e=s.events[i];
  if(!e||typeof e!=='object'||!['cpi','ppi','nfp','fomc','ecb_rates'].includes(e.kind))return `events[${i}].kind`;
  if(!['bls','fed','ecb'].includes(e.source))return `events[${i}].source`;
  if(typeof e.at!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.000Z$/.test(e.at)||!Number.isFinite(Date.parse(e.at)))return `events[${i}].at`;
 }
 for(let i=0;i<s.source_checks.length;i++){
  const c=s.source_checks[i];
  if(!c||typeof c!=='object'||!ids.has(c.id))return `source_checks[${i}].id`;
  if(!validHttpState(c.state))return `source_checks[${i}].state`;
  if(!Number.isSafeInteger(c.candidates)||c.candidates<0||c.candidates>75)return `source_checks[${i}].candidates`;
 }
 for(let i=0;i<s.calendar_checks.length;i++){
  const c=s.calendar_checks[i];
  if(!c||typeof c!=='object'||!['bls','fed','ecb'].includes(c.id))return `calendar_checks[${i}].id`;
  if(!['OK','UNAVAILABLE'].includes(c?.state))return `calendar_checks[${i}].state`;
  if(!Number.isSafeInteger(c.events)||c.events<0||c.events>128)return `calendar_checks[${i}].events`;
 }
 for(let i=0;i<s.price_checks.length;i++){
  const c=s.price_checks[i];
  if(!c||typeof c!=='object'||!['XAU/USD','XAG/USD'].includes(c.instrument))return `price_checks[${i}].instrument`;
  if(!['CURRENT_INDICATION','STALE_OR_INVALID','UNAVAILABLE'].includes(c?.state))return `price_checks[${i}].state`;
 }
 for(const [id,c] of Object.entries(s.cursors)){
  if(!ids.has(id))return `cursors.${id}`;
  const field=invalidCursorField(c,now,16*60000);if(field)return `cursors.${id}.${field}`;
 }
 if(s.fx_checked_at!==undefined&&(!Number.isSafeInteger(s.fx_checked_at)||s.fx_checked_at<0||s.fx_checked_at>now+60000))return 'fx_checked_at';
 const fx=s.fx_reference;
 if(fx!==undefined&&fx!==null){
  if(typeof fx!=='object'||Array.isArray(fx))return 'fx_reference';
  const day=Date.parse(String(fx.reference_date??'')+'T00:00:00Z');
  if(fx.provider!=='ECB_DAILY_REFERENCE'||fx.base!=='EUR'||fx.intraday_live_verified!==false||fx.transaction_price!==false||
   !/^\d{4}-\d{2}-\d{2}$/.test(fx.reference_date)||!Number.isFinite(day)||day>now||now-day>8*86400000||
   new Date(day).toISOString().slice(0,10)!==fx.reference_date||!Array.isArray(fx.rates)||fx.rates.length!==3||
   fx.rates.some((q,i)=>q.currency!==['USD','GBP','JPY'][i]||!Number.isFinite(q.per_eur)||q.per_eur<=0||q.per_eur>=1000000))return 'fx_reference';
 }
 for(let i=0;i<s.quotes.length;i++){
  const q=s.quotes[i];
  if(!q||typeof q!=='object'||!['XAU/USD','XAG/USD'].includes(q.instrument))return `quotes[${i}].instrument`;
  if(q.currency!=='USD')return `quotes[${i}].currency`;
  if(q.unit!=='troy_ounce')return `quotes[${i}].unit`;
  if(q.quote_kind!=='provider_spot_indication')return `quotes[${i}].quote_kind`;
  if(q.provider_latency_verified!==false)return `quotes[${i}].provider_latency_verified`;
  if(q.exchange_tick_verified!==false)return `quotes[${i}].exchange_tick_verified`;
  if(!Number.isFinite(q.value)||q.value<=0)return `quotes[${i}].value`;
  if(!Number.isFinite(Date.parse(q.observed_at))||Date.parse(q.observed_at)>now)return `quotes[${i}].observed_at`;
  if(!Number.isFinite(Date.parse(q.received_at))||Date.parse(q.received_at)>now+60000)return `quotes[${i}].received_at`;
 }
 const lease=Date.parse(s.quota_lease_until);
 if(!Number.isFinite(lease)||lease<now||lease>now+13*60000)return 'quota_lease_until';
 return null;
}
export function validateMacroState(s,now=Date.now()){return macroStateInvalidField(s,now)===null;}
export async function loadMacroState(env){
 const row=await env.DB.prepare('SELECT value_json FROM control_state WHERE key=? LIMIT 1').bind(KEY).first();
 return row?JSON.parse(row.value_json):{};
}
export async function storeMacroState(env,state,now=Date.now()){
 const invalidField=macroStateInvalidField(state,now);
 if(invalidField)return reply({ok:false,error:'MACRO_STATE_INVALID',field:invalidField},400);
 // Explicit projection: neither private article titles nor URLs enter this row.
 const clean={
  mineral_cursors:Object.fromEntries(Object.entries(state.mineral_cursors??{}).map(([id,c])=>[id,{etag:c.etag,last_modified:c.last_modified??null,retry_after:c.retry_after,checked_at:c.checked_at}])),
  mineral_checks:(state.mineral_checks??[]).map(({id,state,candidates})=>({id,state,candidates})),
  mineral_regions:(state.mineral_regions??[]).map(({region,primary_healthy,recent_primary_release,fallback_attempted,fallback_healthy,publisher_region_is_event_country,global_substitute_healthy})=>({region,primary_healthy,recent_primary_release,fallback_attempted,fallback_healthy,publisher_region_is_event_country,global_substitute_healthy})),
  schema:state.schema,checked_at:state.checked_at,quota_lease_until:state.quota_lease_until,calendar_checked_at:state.calendar_checked_at,
  fx_checked_at:state.fx_checked_at??0,fx_reference:state.fx_reference??null,
  events:state.events.map(({kind,at,source})=>({kind,at,source})),quotes:state.quotes.map(({instrument,value,currency,unit,observed_at,received_at,quote_kind,provider_latency_verified,exchange_tick_verified})=>({instrument,value,currency,unit,observed_at,received_at,quote_kind,provider_latency_verified,exchange_tick_verified})),
  cursors:Object.fromEntries(Object.entries(state.cursors).map(([id,c])=>[id,{etag:c.etag,last_modified:c.last_modified??null,retry_after:c.retry_after,checked_at:c.checked_at}])),
  source_checks:state.source_checks.map(({id,state,candidates})=>({id,state,candidates})),price_checks:state.price_checks.map(({instrument,state})=>({instrument,state})),calendar_checks:state.calendar_checks.map(({id,state,events})=>({id,state,events})),
 };
 // The private producer is quota-admitted before this call. Keep a single
 // bounded D1 write; do not retry inside the Worker where provider admission
 // and idempotency cannot be independently inspected.
 const packed=JSON.stringify(clean);
 if(new TextEncoder().encode(packed).byteLength>MACRO_FASTLANE_BODY_MAX_BYTES)
  return reply({ok:false,error:'MACRO_STATE_PAYLOAD_TOO_LARGE'},413);
 try{
  const write=await env.DB.prepare(`INSERT INTO control_state(key,value_json,version,updated_at) VALUES(?,?,1,?)
 ON CONFLICT(key) DO UPDATE SET
 value_json=CASE WHEN control_state.updated_at>excluded.updated_at
  THEN json_set(control_state.value_json,'$.quota_lease_until',
   MAX(json_extract(control_state.value_json,'$.quota_lease_until'),json_extract(excluded.value_json,'$.quota_lease_until')))
  ELSE json_set(excluded.value_json,'$.quota_lease_until',
   MAX(json_extract(control_state.value_json,'$.quota_lease_until'),json_extract(excluded.value_json,'$.quota_lease_until'))) END,
 version=control_state.version+1,updated_at=MAX(control_state.updated_at,excluded.updated_at)` ).bind(KEY,packed,clean.checked_at).run();
  if(write?.success!==true)return reply({ok:false,error:'MACRO_STATE_D1_WRITE_UNVERIFIED'},503);
 }catch{
  return reply({ok:false,error:'MACRO_STATE_D1_WRITE_UNAVAILABLE'},503);
 }
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
