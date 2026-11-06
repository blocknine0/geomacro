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
