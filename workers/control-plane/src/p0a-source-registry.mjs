/**
 * P0-A source registry and isolated private normalization intake.
 * All routes are mounted BEHIND the existing control-plane admin bearer.
 * Neither private staged headlines nor source configuration are publicly served.
 */
import {normalizeP0aPayload,P0A_MAX_COMPRESSED_BYTES} from './p0a-source-format.mjs';
import {processFetchedBatch} from '../../../src/workers/ingest-producer.ts';
import {canonicalJson} from '../../../src/lib/canonical-json.ts';

const PARSERS=new Set(['RSS_2','ATOM','RDF','JSON_REST','CSV_STREAM','HTML_BOUNDED']);
const CATEGORIES=new Set(['GEOPOLITICS','MACRO_FX','CRITICAL_MINERALS']);
const RIGHTS=new Set(['COMMERCIAL_APPROVED','RESEARCH_ONLY','PENDING_AUDIT']);
const SOURCE=/^[a-z0-9][a-z0-9_.:-]{2,119}$/u;
const ISO3=/^[A-Z]{3}$/u;
const STATES=new Set(['OBSERVED','UNCHANGED','EMPTY','DENIED','RATE_LIMITED','UNAVAILABLE','MALFORMED','CAPACITY_DEFERRED']);
const MAX_SOURCES_PER_POLL=8,MAX_NEW_ITEMS_PER_SOURCE=20;
const iso=ms=>new Date(ms).toISOString();
const json=(value,status=200)=>Response.json(value,{status,headers:{
 'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex,nofollow'}});
const publicHttps=value=>{
 if(typeof value!=='string'||value.length>2048)return false;
 try{
  const u=new URL(value),host=u.hostname.toLowerCase();
  return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash&&
   host.includes('.')&&host!=='localhost'&&!host.endsWith('.local')&&
   !host.endsWith('.internal')&&!host.endsWith('.test')&&!host.endsWith('.invalid')&&
   !/^\d+\.\d+\.\d+\.\d+$/u.test(host)&&!host.startsWith('[');
 }catch{return false}
};
export function validateP0aSourceConfig(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('P0A_SOURCE_CONFIG_INVALID');
 const fields=['source_id','canonical_endpoint','parser_type','intended_category',
  'country_iso3','rights_tier','polling_interval_sec','rate_limit_backoff','fallback_endpoint','last_cursor'];
 if(Object.keys(value).some(k=>!fields.includes(k))||!SOURCE.test(value.source_id??'')||
  !publicHttps(value.canonical_endpoint)||!PARSERS.has(value.parser_type)||
  !CATEGORIES.has(value.intended_category)||
  !(value.country_iso3==='GLOBAL'||ISO3.test(value.country_iso3??''))||
  !RIGHTS.has(value.rights_tier)||!Number.isInteger(value.polling_interval_sec)||
  value.polling_interval_sec<300||value.polling_interval_sec>3600||
  !(value.fallback_endpoint===undefined||value.fallback_endpoint===null||publicHttps(value.fallback_endpoint))||
  !(value.last_cursor===undefined||value.last_cursor===null||
    typeof value.last_cursor==='string'&&value.last_cursor.length<=1024))throw Error('P0A_SOURCE_CONFIG_INVALID');
 const b=value.rate_limit_backoff;
 if(!b||typeof b!=='object'||Array.isArray(b)||
  Object.keys(b).sort().join(',')!=='base_delay_ms,max_retries,respect_retry_after'||
  !Number.isInteger(b.max_retries)||b.max_retries<0||b.max_retries>3||
  !Number.isInteger(b.base_delay_ms)||b.base_delay_ms<100||b.base_delay_ms>10000||
  typeof b.respect_retry_after!=='boolean')throw Error('P0A_SOURCE_BACKOFF_INVALID');
 return Object.freeze({...value,
  fallback_endpoint:value.fallback_endpoint??null,last_cursor:value.last_cursor??null,
  rate_limit_backoff:{...b}});
}
function fromRow(row){
 return validateP0aSourceConfig({
  source_id:row.source_id,canonical_endpoint:row.canonical_endpoint,
  parser_type:row.parser_type,intended_category:row.intended_category,
  country_iso3:row.country_iso3,rights_tier:row.rights_tier,
  polling_interval_sec:row.polling_interval_sec,
  rate_limit_backoff:JSON.parse(row.rate_limit_backoff),
  fallback_endpoint:row.fallback_endpoint,last_cursor:row.last_cursor,
 });
}
export async function listP0aSourceRegistry(env){
 try{
  const response=await env.DB.prepare('SELECT * FROM source_registry ORDER BY source_id LIMIT 1024').all();
  return json({schema:'geomacro.p0a.source-registry.v1',ok:true,
   sources:(response.results??[]).map(row=>({...fromRow(row),
    enabled:row.enabled===1,next_poll_at:row.next_poll_at,last_state:row.last_state,
    last_polled_at:row.last_polled_at,consecutive_failures:row.consecutive_failures}))});
 }catch{return json({ok:false,error:'P0A_SOURCE_REGISTRY_UNAVAILABLE'},503)}
}
export async function upsertP0aSourceRegistry(env,body){
 try{
  if(!body||!Array.isArray(body.sources)||body.sources.length<1||
     body.sources.length>64||Object.keys(body).join(',')!=='sources')
    throw Error('P0A_SOURCE_REGISTRY_BATCH_INVALID');
  const sources=body.sources.map(validateP0aSourceConfig);
  if(new Set(sources.map(x=>x.source_id)).size!==sources.length)
   throw Error('P0A_SOURCE_ID_DUPLICATED');
  const commands=sources.map(s=>env.DB.prepare(
    'INSERT INTO source_registry(source_id,canonical_endpoint,parser_type,intended_category,'+
    'country_iso3,rights_tier,polling_interval_sec,rate_limit_backoff,fallback_endpoint,last_cursor) '+
    'VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_id) DO UPDATE SET '+
    'canonical_endpoint=excluded.canonical_endpoint,parser_type=excluded.parser_type,'+
    'intended_category=excluded.intended_category,country_iso3=excluded.country_iso3,'+
    'rights_tier=excluded.rights_tier,polling_interval_sec=excluded.polling_interval_sec,'+
    'rate_limit_backoff=excluded.rate_limit_backoff,fallback_endpoint=excluded.fallback_endpoint,'+
    // Changing the origin/format invalidates its old conditional-fetch cursor.
    'last_cursor=CASE WHEN source_registry.canonical_endpoint<>excluded.canonical_endpoint OR '+
    'source_registry.parser_type<>excluded.parser_type THEN excluded.last_cursor '+
    'ELSE source_registry.last_cursor END,updated_at=CURRENT_TIMESTAMP')
    .bind(s.source_id,s.canonical_endpoint,s.parser_type,s.intended_category,
     s.country_iso3,s.rights_tier,s.polling_interval_sec,JSON.stringify(s.rate_limit_backoff),
     s.fallback_endpoint,s.last_cursor));
  await env.DB.batch(commands);
  const receipts=await env.DB.prepare('SELECT source_id FROM source_registry WHERE source_id IN ('+
    sources.map(()=>'?').join(',')+')').bind(...sources.map(x=>x.source_id)).all();
  const saved=new Set((receipts.results??[]).map(x=>x.source_id));
  if(sources.some(x=>!saved.has(x.source_id)))throw Error('P0A_SOURCE_CONFIG_READBACK_FAILED');
  return json({ok:true,schema:'geomacro.p0a.registry-upsert.v1',saved:saved.size,
   readback_verified:true,commercial_rights_changed:false});
 }catch(error){
  const invalid=/^P0A_SOURCE_(CONFIG|BACKOFF|REGISTRY_BATCH|ID_DUPLICATED)/u.test(error?.message??'');
  return json({ok:false,error:invalid?error.message:'P0A_SOURCE_REGISTRY_WRITE_FAILED'},invalid?400:503);
 }
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function retryAfter(header,now){
 if(!header)return null;
 const n=Number(header);
 if(Number.isFinite(n)&&n>=0)return Math.min(86400000,Math.ceil(n*1000));
 const date=Date.parse(header);
 return Number.isFinite(date)?Math.max(0,Math.min(86400000,date-now)):null;
}
async function sha(value){
 const bytes=new TextEncoder().encode(value);
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))]
  .map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function responseBytes(response){
 if(Number(response.headers.get('content-length')||0)>P0A_MAX_COMPRESSED_BYTES)
  throw Error('P0A_HTTP_BODY_TOO_LARGE');
 if(!response.body)throw Error('P0A_HTTP_BODY_MISSING');
 const reader=response.body.getReader();let length=0;const chunks=[];
 try{
  while(true){
   const {value,done}=await reader.read();
   if(done)break;
   length+=value.byteLength;
   if(length>P0A_MAX_COMPRESSED_BYTES)throw Error('P0A_HTTP_BODY_TOO_LARGE');
   chunks.push(value);
  }
 }finally{try{await reader.cancel()}catch{}reader.releaseLock()}
 const bytes=new Uint8Array(length);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return bytes;
}
async function fetchEndpoint(url,config,fetchImpl,now){
 let last=null;
 for(let attempt=0;attempt<=config.rate_limit_backoff.max_retries;attempt++){
  let response;
  try{
   const headers={'Accept':'application/rss+xml, application/atom+xml, application/rdf+xml, application/json, text/csv, text/html, application/zip, */*;q=0.2',
    'User-Agent':'GeoMacro/1.0 (+https://geomacro.live; source-normalization)'};
   if(config.last_cursor?.startsWith('etag:'))headers['If-None-Match']=config.last_cursor.slice(5);
   if(config.last_cursor?.startsWith('modified:'))headers['If-Modified-Since']=config.last_cursor.slice(9);
   response=await fetchImpl(url,{method:'GET',redirect:'manual',headers,
    signal:AbortSignal.timeout(10000)});
  }catch(error){
   last={state:'UNAVAILABLE',status:null,delay:null};
   if(attempt<config.rate_limit_backoff.max_retries){
    await sleep(Math.min(10000,config.rate_limit_backoff.base_delay_ms*2**attempt));continue;
   }
   break;
  }
  const status=response.status;
  if(status===304)return {state:'UNCHANGED',status,cursor:config.last_cursor,records:[]};
  if(status===403||status===401)return {state:'DENIED',status,delay:3600000,records:[]};
  if(status===429)return {state:'RATE_LIMITED',status,
   delay:config.rate_limit_backoff.respect_retry_after?
    retryAfter(response.headers.get('retry-after'),now):null,records:[]};
  if(status===200){
   try{
    const bytes=await responseBytes(response);
    const records=await normalizeP0aPayload(config.parser_type,bytes);
    const etag=response.headers.get('etag'),modified=response.headers.get('last-modified');
    const firstId=records.find(x=>typeof x.source_record_id==='string'&&x.source_record_id.length)?.source_record_id;
    const cursor=etag&&etag.length<=1000?'etag:'+etag:
      modified&&modified.length<=1000?'modified:'+modified:
      firstId?'id:'+firstId:config.last_cursor;
    return {state:records.length?'OBSERVED':'EMPTY',status,cursor,records};
   }catch{return {state:'MALFORMED',status,records:[]}}
  }
  last={state:'UNAVAILABLE',status,records:[]};
  if(![408,500,502,503,504].includes(status)||attempt===config.rate_limit_backoff.max_retries)break;
  await sleep(Math.min(10000,config.rate_limit_backoff.base_delay_ms*2**attempt));
 }
 return last??{state:'UNAVAILABLE',status:null,records:[]};
}
export async function fetchP0aSource(config,{fetchImpl=fetch,now=Date.now()}={}){
 const primary=await fetchEndpoint(config.canonical_endpoint,config,fetchImpl,now);
 // Never use a fallback to bypass upstream 401/403/429, a malformed response,
 // or commercial/research restrictions.
 if(primary.state==='UNAVAILABLE'&&config.fallback_endpoint)
  return {...await fetchEndpoint(config.fallback_endpoint,{...config,last_cursor:null},fetchImpl,now),
   used_fallback:true};
 return {...primary,used_fallback:false};
}
async function pollOne(env,row,{fetchImpl,now}){
 const config=fromRow(row);
 const lockedUntil=iso(now+120000);
 const lock=await env.DB.prepare(
  'UPDATE source_registry SET next_poll_at=? WHERE source_id=? AND next_poll_at=? AND enabled=1'
 ).bind(lockedUntil,row.source_id,row.next_poll_at).run();
 if(lock.meta?.changes!==1)return {source_id:row.source_id,state:'NOT_DUE'};
 let result;
 try{result=await fetchP0aSource(config,{fetchImpl,now})}
 catch{result={state:'UNAVAILABLE',status:null,records:[],used_fallback:false}}
 let state=result.state,accepted=0,p0b_failure_codes={};
 // Defer P0-B admission until ALL fetched sources from this poll window are
 // combined. Do not commit source cursor before the shared B2 bundle is durable.
 if(state==='OBSERVED'&&env?.GEOMACRO_P0B_ADMISSION_ACTIVE==='1'){
  try{
   const candidates=await Promise.all(result.records.map(async item=>{
    const raw={...item,intended_category:config.intended_category,
     country_iso3:config.country_iso3,rights_tier:config.rights_tier};
    return {candidateSha256:await sha(canonicalJson(raw)),
     sourceId:config.source_id,raw};
   }));
   return {_p0b_deferred:true,source_id:config.source_id,
    row,config,result,candidates};
  }catch{
   await env.DB.prepare(
    "UPDATE source_registry SET next_poll_at=?,last_state='CAPACITY_DEFERRED' "+
    'WHERE source_id=?').bind(iso(now+60000),config.source_id).run().catch(()=>{});
   return {source_id:config.source_id,state:'CAPACITY_DEFERRED',accepted:0};
  }
 }
 try{
  if(state==='OBSERVED'&&env?.GEOMACRO_P0B_ADMISSION_ACTIVE==='1'){
   // P0-B source-first: every parsed item is B2 encrypted/readback verified,
   // registered in D1 and queued; no 20-item cap or premature cursor advance.
   // An unacknowledged item keeps the source cursor for replay.
   const candidates=await Promise.all(result.records.map(async item=>{
    const raw={...item,intended_category:config.intended_category,
     country_iso3:config.country_iso3,rights_tier:config.rights_tier};
    return {candidateSha256:await sha(canonicalJson(raw)),
     sourceId:config.source_id,raw};
   }));
   const receipt=await processFetchedBatch(candidates,env);
   // Only the existing bearer-authenticated admin poll returns safe
   // enum-style failure codes; no B2 URIs, origins, article text or keys.
   for(const item of receipt.receipts){
    if(item.status==='FAILED_NOT_ACKNOWLEDGED'){
     const code=/^P0B_[A-Z0-9_]{3,80}$/u.test(item.error_code??'')
      ?item.error_code:'P0B_PRODUCER_FAILURE';
     p0b_failure_codes[code]=(p0b_failure_codes[code]??0)+1;
    }
   }
   if(!receipt.all_durable||receipt.examined!==candidates.length)
    state='CAPACITY_DEFERRED';
   accepted=receipt.receipts.filter(x=>[
    'QUEUED','DURABLE_PENDING_REDISPATCH','ALREADY_COMMITTED','DUPLICATE_IN_BATCH'
   ].includes(x.status)).length;
  }else if(state==='OBSERVED'){
   // Never claim full capture if this durable per-source page budget is exceeded.
   const candidates=result.records;
   if(candidates.length>MAX_NEW_ITEMS_PER_SOURCE)state='CAPACITY_DEFERRED';
   const staged=candidates.slice(0,MAX_NEW_ITEMS_PER_SOURCE),statements=[];
   const timestamp=iso(now),hashes=[];
   for(const item of staged){
    const identity=await sha([config.source_id,item.source_record_id??item.original_url??item.title??'',
     item.native_published_at??''].join('\n'));
    hashes.push(identity);
    statements.push(env.DB.prepare(
     'INSERT INTO p0a_normalized_source_items '+
     '(item_id,source_id,intended_category,country_iso3,rights_tier,title,original_url,'+
     'source_record_id,native_published_at,first_seen_at,last_seen_at) '+
     'VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(item_id) DO NOTHING'
    ).bind(identity,config.source_id,config.intended_category,config.country_iso3,
     config.rights_tier,item.title,item.original_url,item.source_record_id,
     item.native_published_at,timestamp,timestamp));
   }
   if(statements.length){
    await env.DB.batch(statements);
    const seen=await env.DB.prepare(
     'SELECT item_id FROM p0a_normalized_source_items WHERE item_id IN ('+
     hashes.map(()=>'?').join(',')+')').bind(...hashes).all();
    if(new Set((seen.results??[]).map(x=>x.item_id)).size!==new Set(hashes).size)
     throw Error('P0A_D1_RECORD_READBACK_FAILED');
   }
   accepted=staged.length;
  }
  const failures=['UNAVAILABLE','DENIED','RATE_LIMITED','MALFORMED','CAPACITY_DEFERRED'].includes(state)?
    row.consecutive_failures+1:0;
  const interval=config.polling_interval_sec*1000;
  const delay=state==='DENIED'?Math.max(3600000,interval):
   state==='RATE_LIMITED'?Math.max(interval,result.delay??interval):
   failures?Math.min(3600000,config.rate_limit_backoff.base_delay_ms*2**Math.min(failures,12)):interval;
  // Only a complete parse may advance the cache cursor. Fallback responses
  // never replace the canonical endpoint's cursor.
  const cursor=(state==='OBSERVED'||state==='EMPTY'||state==='UNCHANGED')&&
    !result.used_fallback?result.cursor??config.last_cursor:config.last_cursor;
  await env.DB.prepare('UPDATE source_registry SET last_cursor=?,last_polled_at=?,'+
   'next_poll_at=?,last_state=?,last_http_status=?,consecutive_failures=? WHERE source_id=?')
    .bind(cursor,iso(now),iso(now+delay),state,result.status??null,failures,config.source_id).run();
  return {source_id:config.source_id,state,accepted,parsed:result.records?.length??0,
    status:result.status??null,used_fallback:result.used_fallback===true,
    p0b_failure_codes};
 }catch{
  await env.DB.prepare('UPDATE source_registry SET next_poll_at=?,last_state=?,'+
   'consecutive_failures=consecutive_failures+1 WHERE source_id=?')
    .bind(iso(now+Math.max(config.polling_interval_sec*1000,60000)),
     'UNAVAILABLE',config.source_id).run().catch(()=>{});
  return {source_id:config.source_id,state:'UNAVAILABLE',accepted:0,
   storage_readback_verified:false};
 }
}
async function finishP0bSource(env,plan,now,admissions){
 const {row,config,result,candidates}=plan;
 const accepted=admissions.filter(a=>[
  'QUEUED','DURABLE_PENDING_REDISPATCH','ALREADY_COMMITTED','DUPLICATE_IN_BATCH'
 ].includes(a?.status)).length;
 const complete=admissions.length===candidates.length&&accepted===candidates.length;
 const state=complete?'OBSERVED':'CAPACITY_DEFERRED',p0b_failure_codes={};
 for(const a of admissions){
  if(a?.status==='FAILED_NOT_ACKNOWLEDGED'||a?.status==='INVALID_CANDIDATE'||
   a?.status==='HELD_FOR_REVIEW'){
   const code=/^P0B_[A-Z0-9_]{3,80}$/u.test(a.error_code??'')?
    a.error_code:'P0B_PRODUCER_FAILURE';
   p0b_failure_codes[code]=(p0b_failure_codes[code]??0)+1;
  }
 }
 const failures=complete?0:row.consecutive_failures+1;
 const interval=config.polling_interval_sec*1000;
 const delay=complete?interval:Math.min(3600000,
  config.rate_limit_backoff.base_delay_ms*2**Math.min(failures,12));
 const cursor=complete&&!result.used_fallback?
  result.cursor??config.last_cursor:config.last_cursor;
 await env.DB.prepare(
  'UPDATE source_registry SET last_cursor=?,last_polled_at=?,'+
  'next_poll_at=?,last_state=?,last_http_status=?,consecutive_failures=? '+
  'WHERE source_id=?'
 ).bind(cursor,iso(now),iso(now+delay),state,
  result.status??null,failures,config.source_id).run();
 return {source_id:config.source_id,state,accepted,
  parsed:result.records.length,status:result.status??null,
  used_fallback:result.used_fallback===true,p0b_failure_codes};
}
export async function pollP0aSources(env,{
 fetchImpl=fetch,now=Date.now(),limit=MAX_SOURCES_PER_POLL,sourceIds=null,producerManager=null
}={}){
 if(!env?.DB||!Number.isSafeInteger(limit)||limit<1||limit>MAX_SOURCES_PER_POLL||
  (sourceIds!==null&&(!Array.isArray(sourceIds)||sourceIds.length<1||
    sourceIds.length>5||sourceIds.some(x=>!SOURCE.test(x))||
    new Set(sourceIds).size!==sourceIds.length)))
  return {ok:false,error:'P0A_POLL_ARGUMENT_INVALID'};
 let rows;
 try{
  const filtered=sourceIds!==null?
   ' AND source_id IN ('+sourceIds.map(()=>'?').join(',')+')':'';
  const q=await env.DB.prepare('SELECT * FROM source_registry '+
   (sourceIds===null?'WHERE enabled=1 AND next_poll_at<=?':'WHERE enabled=1')+filtered+
   ' ORDER BY next_poll_at,source_id LIMIT ?')
   .bind(...(sourceIds===null?[iso(now)]:[]),...(sourceIds??[]),limit).all();
  rows=q.results??[];
 }catch{return {ok:false,error:'P0A_SOURCE_REGISTRY_UNAVAILABLE'}}
 const polled=await Promise.all(rows.map(async row=>{
  try{return await pollOne(env,row,{fetchImpl,now})}
  catch{return {source_id:row.source_id,state:'UNAVAILABLE',accepted:0}}
 }));
 const plans=polled.filter(x=>x._p0b_deferred);
 if(plans.length){
  const all=plans.flatMap(p=>p.candidates);
  let admission;
  try{admission=await processFetchedBatch(all,env,{
   ...(producerManager?{manager:producerManager}:{}),now:()=>new Date(now)})}
  catch{admission=null}
  const mapped=new Map();
  for(const rec of admission?.receipts??[]){
   const key=rec.sha256+'|'+rec.source_id;
   if(!mapped.has(key))mapped.set(key,[]);
   mapped.get(key).push(rec);
  }
  for(const plan of plans){
   const admissions=plan.candidates.map(c=>
    mapped.get(c.candidateSha256+'|'+c.sourceId)?.shift()??
    {status:'FAILED_NOT_ACKNOWLEDGED',error_code:'P0B_PRODUCER_FAILURE'});
   const idx=polled.indexOf(plan);
   try{polled[idx]=await finishP0bSource(env,plan,now,admissions)}
   catch{polled[idx]={source_id:plan.source_id,state:'CAPACITY_DEFERRED',
    accepted:0,storage_readback_verified:false}}
  }
 }
 return {schema:'geomacro.p0a.poll.v1',ok:true,due_selected:rows.length,
  receipts:polled,private_only:true,paid_eligible:false,verified_originals:false,
  rights_promoted:false,public_published:false};
}
export async function handleP0aAdmin(request,env){
 const u=new URL(request.url);
 if(u.search)return json({ok:false,error:'P0A_QUERY_NOT_ALLOWED'},400);
 if(u.pathname==='/v1/internal/p0a/source-registry'){
  if(request.method==='GET')return listP0aSourceRegistry(env);
  if(request.method==='PUT'){
   try{
    const raw=await request.text();
    if(raw.length>250000)return json({ok:false,error:'P0A_PAYLOAD_TOO_LARGE'},413);
    return upsertP0aSourceRegistry(env,JSON.parse(raw));
   }catch{return json({ok:false,error:'P0A_REQUEST_INVALID'},400)}
  }
 }
 if(u.pathname==='/v1/internal/p0a/canary'&&request.method==='POST'){
  try{
   if(env.GEOMACRO_P0B_ADMISSION_ACTIVE!=='1')
    return json({ok:false,error:'P0B_NOT_ACTIVATED'},503);
   const raw=await request.text();
   if(raw.length>2000)return json({ok:false,error:'P0B_CANARY_ARGUMENT_INVALID'},400);
   const body=JSON.parse(raw);
   if(!Array.isArray(body?.source_ids)||body.source_ids.length<3||
    body.source_ids.length>5||Object.keys(body).join(',')!=='source_ids')
    return json({ok:false,error:'P0B_CANARY_ARGUMENT_INVALID'},400);
   return json(await pollP0aSources(env,{
    sourceIds:body.source_ids,limit:body.source_ids.length}));
  }catch{return json({ok:false,error:'P0B_CANARY_ARGUMENT_INVALID'},400)}
 }
 if(u.pathname==='/v1/internal/p0a/poll'&&request.method==='POST')
  return json(await pollP0aSources(env));
 return json({ok:false,error:'P0A_METHOD_NOT_ALLOWED'},405);
}
