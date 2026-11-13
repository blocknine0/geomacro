import {RISK_GATE_HOT50} from "./risk-gate-hot50-scope.mjs";
// Separate from quote/release snapshots: minute cron cannot advance the
// routine-source clock or erase the last actual successful intake.
const KEY='news_intake_admission_v1';
const schema='geomacro.news-intake-admission.v1';
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function loadNewsIntakePolicy(env){
 const row=await env.DB.prepare('SELECT value_json FROM control_state WHERE key=? LIMIT 1').bind(KEY).first();
 return row?JSON.parse(row.value_json):null;
}
export async function readNewsIntakePolicy(env){return reply({ok:true,schema,policy:await loadNewsIntakePolicy(env)});}
export async function storeNewsIntakePolicy(env,body,now=Date.now()){
 if(!body||body.schema!==schema||![5,10,15,30,60].includes(body.interval_minutes)||![3,5,10,25,50].includes(body.max_new_rows)||!Number.isFinite(Date.parse(body.last_success_at))||Date.parse(body.last_success_at)>now+60000||now-Date.parse(body.last_success_at)>15*60000)
  return reply({ok:false,error:'NEWS_INTAKE_POLICY_INVALID'},400);
 const policy={schema,interval_minutes:body.interval_minutes,max_new_rows:body.max_new_rows,last_success_at:new Date(Math.min(now,Date.parse(body.last_success_at))).toISOString()};
 await env.DB.prepare(`INSERT INTO control_state(key,value_json,version,updated_at) VALUES(?,?,1,?)
 ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,version=control_state.version+1,updated_at=excluded.updated_at
 WHERE excluded.updated_at>=control_state.updated_at`).bind(KEY,JSON.stringify(policy),policy.last_success_at).run();
 return reply({ok:true,schema,policy_saved:true});
}

/**
 * Source-side append-only fact admission. Batch records (up to 25) and issue
 * two D1 statements: one idempotent INSERT, one atomic per-event promotion.
 * NO publisher headline, body, snippet, syndicated copy, or raw HTML is read
 * from the API payload, placed in SQL, or logged here.
 *
 * This is a trusted ingestion hook, not a public or partner endpoint.
 */
const FACT_SHA=/^[a-f0-9]{64}$/;
const FACT_ISO=/^[A-Z]{3}$/;
const FACT_CATEGORIES=new Set(['geopolitics','macro','rare_earth']);
const factEncoder=new TextEncoder();
async function factSha(value){
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',factEncoder.encode(value)))]
  .map(x=>x.toString(16).padStart(2,'0')).join('');
}
function validDerivedFact(fact,now){
 if(!fact||typeof fact!=='object'||Array.isArray(fact)||
   !FACT_ISO.test(fact.country_iso3)||!FACT_CATEGORIES.has(fact.derived_category)||
   !FACT_SHA.test(fact.event_fingerprint)||typeof fact.canonical_source_url!=='string'||
   typeof fact.publisher_domain!=='string'||typeof fact.event_clock!=='string'||
   !['ORIGINAL_PUBLICATION','INDEX_OBSERVED'].includes(fact.clock_basis))return null;
 const time=Date.parse(fact.event_clock);
 if(!Number.isFinite(time)||time>now+60000||time<now-72*3600000)return null;
 let url;try{url=new URL(fact.canonical_source_url)}catch{return null;}
 const domain=url.hostname.toLowerCase().replace(/^www\./,'');
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||
   url.href.length>2048||domain!==fact.publisher_domain||domain.length>253||
   !/^[a-z0-9.-]+$/.test(domain))return null;
 const entities=fact.extracted_entities;
 if(!Array.isArray(entities)||entities.length>16||
   entities.some(e=>typeof e!=='string'||e.length>48||!/^[A-Za-z0-9_:-]+$/.test(e)))
   return null;
 return {
   country_iso3:fact.country_iso3,category:fact.derived_category,
   event_fingerprint:fact.event_fingerprint,publisher_domain:domain,
   canonical_source_url:url.href,event_clock:new Date(time).toISOString(),
   clock_basis:fact.clock_basis,extracted_entities_json:JSON.stringify(entities)
 };
}
export async function admitProgressiveRiskFacts(env,facts,now=Date.now()){
 if(!env?.DB?.prepare||!Array.isArray(facts)||facts.length<1||facts.length>25||
   !Number.isSafeInteger(now))throw Error('PROGRESSIVE_FACT_BATCH_INVALID');
 const normalized=facts.map(f=>validDerivedFact(f,now));
 if(normalized.some(f=>f===null))throw Error('PROGRESSIVE_FACT_INVALID');
 const rows=await Promise.all(normalized.map(async f=>({
   ...f,observation_id:await factSha([
     f.country_iso3,f.category,f.event_fingerprint,f.publisher_domain,
     f.canonical_source_url,f.event_clock
   ].join('|'))
 })));
 const observedAt=new Date(now).toISOString();
 const values=rows.map(()=>'(?,?,?,?,?,?,?,?,?,?)').join(',');
 const binds=rows.flatMap(f=>[f.observation_id,f.country_iso3,f.category,
   f.event_fingerprint,f.publisher_domain,f.canonical_source_url,
   f.event_clock,f.clock_basis,f.extracted_entities_json,observedAt]);
 await env.DB.prepare(`INSERT OR IGNORE INTO progressive_risk_gate_facts
   (observation_id,country_iso3,category,event_fingerprint,publisher_domain,
    canonical_source_url,event_clock,clock_basis,extracted_entities_json,observed_at)
   VALUES ${values}`).bind(...binds).run();
 const groupKeys=[...new Map(rows.map(f=>
   [[f.country_iso3,f.category,f.event_fingerprint].join('|'),
    [f.country_iso3,f.category,f.event_fingerprint]])).values()];
 const keys=groupKeys.map(()=>'(?,?,?)').join(',');
 const cutoff=new Date(now-72*3600000).toISOString();
 // SQLite UPSERT is evaluated in the same statement as its source aggregate.
 // Older facts never reduce a newer publisher count; the gate itself reads
 // base facts rather than depending on materialization or queue drains.
 await env.DB.prepare(`INSERT INTO progressive_risk_gate_cell_state
 (country_iso3,category,event_fingerprint,corroboration_sources_count,status,event_clock,updated_at)
 SELECT f.country_iso3,f.category,f.event_fingerprint,
   COUNT(DISTINCT CASE WHEN f.clock_basis='ORIGINAL_PUBLICATION'
     THEN f.publisher_domain END) AS independent_original_count,
   CASE WHEN COUNT(DISTINCT CASE WHEN f.clock_basis='ORIGINAL_PUBLICATION'
     THEN f.publisher_domain END)>=2 THEN 'CORROBORATED' ELSE 'OBSERVED' END,
   MAX(f.event_clock),?
 FROM progressive_risk_gate_facts f
 WHERE f.event_clock>=? AND f.event_clock<=?
   AND (f.country_iso3,f.category,f.event_fingerprint) IN (VALUES ${keys})
 GROUP BY f.country_iso3,f.category,f.event_fingerprint
 ON CONFLICT(country_iso3,category,event_fingerprint) DO UPDATE SET
 corroboration_sources_count=excluded.corroboration_sources_count,
 status=excluded.status,event_clock=excluded.event_clock,updated_at=excluded.updated_at
 WHERE excluded.updated_at>=progressive_risk_gate_cell_state.updated_at`)
 .bind(observedAt,cutoff,observedAt,...groupKeys.flat()).run();
 return {ok:true,schema:'geomacro.progressive-fact-admission.v1',
   accepted:rows.length,materialized_events:groupKeys.length,
   raw_news_text_stored:false};
}

const HOT50_SET=new Set(RISK_GATE_HOT50);
const OBSERVATION_CATEGORY=Object.freeze({
 geopolitics:"GEOPOLITICS",macro:"MACRO_FX",rare_earth:"CRITICAL_MINERALS",
});
const HOST_ID=/^[a-z0-9.-]{1,253}$/u;
const titleDigest=/^[a-f0-9]{64}$/u;
/**
 * Project D1-readback-acknowledged source metadata into noncommercial
 * progressive observations. INDEX_OBSERVED and SEARCH_TITLE_ONLY are
 * mandatory: this projection cannot satisfy Standard corroboration or
 * original-page review. No title/body/HTML is stored or logged.
 */
export async function projectUnverifiedProgressiveObservations(env,observations,now=Date.now()){
 if(!env?.DB?.prepare||!Array.isArray(observations)||observations.length<1||
    observations.length>25||!Number.isSafeInteger(now))
  throw Error("PROGRESSIVE_OBSERVATION_BATCH_INVALID");
 const facts=[];
 const obsRows=[];
 for(const item of observations){
  if(!item||typeof item!=="object"||Array.isArray(item)||
    item.rights_verified!==false||item.commercial_eligible!==false||
    item.clock_basis!=="INDEX_OBSERVED"||item.fact_basis!=="SEARCH_TITLE_ONLY"||
    item.original_page_fetched!==false||
    !HOT50_SET.has(item.country_iso3)||
    !Object.hasOwn(OBSERVATION_CATEGORY,item.derived_category)||
    !FACT_SHA.test(item.event_fingerprint??"")||
    !titleDigest.test(item.title_sha256??"")||
    typeof item.source_id!=="string"||!HOST_ID.test(item.source_id)||
    typeof item.publisher_domain!=="string"||!HOST_ID.test(item.publisher_domain)||
    typeof item.canonical_source_url!=="string"||
    typeof item.event_clock!=="string"||
    !Array.isArray(item.extracted_entities)||item.extracted_entities.length>16||
    item.extracted_entities.some(e=>typeof e!=="string"||e.length>48||!/^[A-Za-z0-9_:-]+$/u.test(e)))
   throw Error("PROGRESSIVE_OBSERVATION_INVALID");
  const fact={
   country_iso3:item.country_iso3,derived_category:item.derived_category,
   event_fingerprint:item.event_fingerprint,publisher_domain:item.publisher_domain,
   canonical_source_url:item.canonical_source_url,event_clock:item.event_clock,
   clock_basis:"INDEX_OBSERVED",extracted_entities:item.extracted_entities,
  };
  const normalized=validDerivedFact(fact,now);
  if(!normalized)throw Error("PROGRESSIVE_OBSERVATION_INVALID");
  const eventId=item.event_fingerprint;
  const observationId=await factSha([
   item.country_iso3,item.derived_category,eventId,normalized.publisher_domain
  ].join("|"));
  obsRows.push({
   observation_id:observationId,event_id:eventId,entity_type:"COUNTRY",
   entity_id:item.country_iso3,category:OBSERVATION_CATEGORY[item.derived_category],
   event_at:normalized.event_clock,source_id:item.source_id,
   source_host:normalized.publisher_domain,title_sha256:item.title_sha256,
   fact_basis:"SEARCH_TITLE_ONLY",original_page_fetched:0,
   status:"OBSERVED",independent_source_count:1,
  });
  facts.push(fact);
 }
 const factReceipt=await admitProgressiveRiskFacts(env,facts,now);
 const observedAt=new Date(now).toISOString();
 const values=obsRows.map(()=>"(?,?,?,?,?,?,?,?,?,NULL,0,?,?,?,?)").join(",");
 const binds=obsRows.flatMap(x=>[
  x.observation_id,x.event_id,x.entity_type,x.entity_id,x.category,
  x.event_at,x.source_id,x.source_host,x.title_sha256,
  x.fact_basis,x.original_page_fetched,x.status,x.independent_source_count,
  observedAt,
 ]);
 await env.DB.prepare(`INSERT OR IGNORE INTO unverified_observations
  (observation_id,event_id,entity_type,entity_id,category,event_at,source_id,
   source_host,title_sha256,impact_factor,fact_basis,original_page_fetched,
   status,independent_source_count,discovered_at)
  VALUES ${values}`).bind(...binds).run();
 return {
  ok:true,schema:"geomacro.progressive-observation-projection.v1",
  accepted:factReceipt.accepted,unverified_observations:obsRows.length,
  rights_verified:false,commercial_eligible:false,
  original_page_reviewed:false,standard_corroboration_admitted:false,
  raw_news_text_stored:false,
 };
}
