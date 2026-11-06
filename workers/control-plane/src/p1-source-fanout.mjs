/**
 * P1 source fan-out on the EXISTING private Cloudflare control-plane Worker.
 *
 * Every minute: one D1 indexed due-page read (<=105), one idempotent D1
 * lease write and ten deterministic shards to a separate source-poll Queue.
 * Payloads contain source IDs ONLY, never arbitrary caller-supplied URLs.
 * Queues independently autoscale up to configured max_concurrency=10;
 * One V3 message contains <=15 source IDs; one message per consumer invocation.
 */
import {pollP0aSources} from "./p0a-source-registry.mjs";
import {dispatchP1BundledDueSources,verifiedP1BundledLeasePairs} from "./p1-source-bundled-dispatch.mjs";
const SOURCE=/^[a-z0-9][a-z0-9_.:-]{2,119}$/u,ISO3=/^[A-Z]{3}$/u;
const CATEGORIES=new Set(["GEOPOLITICS","MACRO_FX","CRITICAL_MINERALS"]);
const MAX_DUE=105,SHARDS=10,BATCH=15;
const nowIso=(ms)=>new Date(ms).toISOString();
const response=(body,code=200)=>Response.json(body,{status:code,headers:{
 "Cache-Control":"private, no-store","X-Robots-Tag":"noindex,nofollow"}});
export function p1Shard(sourceId){
 if(!SOURCE.test(sourceId))throw Error("P1_SOURCE_ID_INVALID");
 let h=2166136261;
 for(let i=0;i<sourceId.length;i++){
  h^=sourceId.charCodeAt(i);h=Math.imul(h,16777619);
 }
 return (h>>>0)%SHARDS;
}
export async function dispatchP1DueSources(env,{now=Date.now(),limit=MAX_DUE}={}){
 if(env?.GEOMACRO_P1_FANOUT_ENABLED!=="1")
  return {status:"P1_FANOUT_DISABLED",selected:0,queued:0};
 if(!env?.DB?.prepare||typeof env.SOURCE_POLL_QUEUE?.sendBatch!=="function"||
    !Number.isSafeInteger(limit)||limit<1||limit>MAX_DUE||
    !Number.isFinite(now))
  return {status:"P1_DISPATCH_BINDING_UNAVAILABLE",selected:0,queued:0};
 // Fail closed before leasing or queueing lower-priority polling work until
 // the reviewed shared account-wide D1 governor is active. Due registry rows
 // remain durable and eligible for the next scheduled dispatch.
 if(env.GEOMACRO_D1_ACCOUNT_WIDE_GOVERNOR_VERIFIED!=="true"||
    env.GEOMACRO_D1_ACCOUNT_WIDE_READ_CAP_VERIFIED!=="true"||
    env.GEOMACRO_D1_DAILY_ROWS_READ_SOFT_MAX!=="120000")
  return {status:"P1_DISPATCH_ACCOUNT_D1_GOVERNOR_HELD",selected:0,queued:0,
   deferred:true,durable_defer_state:"SOURCE_REGISTRY_DUE_ROWS",
   retry_on_next_scheduled_dispatch:true,d1_reads:0,d1_writes:0};
 // Existing 1077-source fanout stays enabled, but one bundled lease row
 // replaces up to 108 physical per-source dispatcher lease writes.
 if(env.GEOMACRO_P1_BUNDLED_LEASES_ENABLED==="1")
  return dispatchP1BundledDueSources(env,{now,limit,shardOf:p1Shard});
 const clock=nowIso(now);
 let rows;
 try{
  const r=await env.DB.prepare(
   "SELECT source_id FROM source_registry "+
   "WHERE enabled=1 AND next_poll_at<=? AND "+
   "(poll_dispatch_lease_until IS NULL OR poll_dispatch_lease_until<=?) "+
   "ORDER BY next_poll_at,source_id LIMIT ?"
  ).bind(clock,clock,limit).all();
  rows=r.results??[];
  if(!Array.isArray(rows)||rows.length>limit||rows.some(x=>!SOURCE.test(x.source_id)))
   throw Error("P1_DISPATCH_SOURCE_PAGE_INVALID");
 }catch{return {status:"P1_DISPATCH_D1_SELECT_FAILED",selected:0,queued:0}}
 if(!rows.length)return {status:"P1_DISPATCH_IDLE",selected:0,queued:0};
 const ids=rows.map(x=>x.source_id),idSet=new Set(ids);
 if(idSet.size!==ids.length)return {status:"P1_DISPATCH_DUPLICATE_IDS",selected:0,queued:0};
 const token=crypto.randomUUID(),leaseUntil=nowIso(now+120000);
 try{
  const claim=await env.DB.prepare(
   "UPDATE source_registry SET poll_dispatch_token=?,poll_dispatch_lease_until=? "+
   "WHERE source_id IN (SELECT value FROM json_each(?)) AND enabled=1 "+
   "AND next_poll_at<=? AND "+
   "(poll_dispatch_lease_until IS NULL OR poll_dispatch_lease_until<=?)"
  ).bind(token,leaseUntil,JSON.stringify(ids),clock,clock).run();
  const leased=await env.DB.prepare(
   "SELECT source_id FROM source_registry WHERE poll_dispatch_token=? "+
   "AND poll_dispatch_lease_until=? ORDER BY source_id LIMIT ?"
  ).bind(token,leaseUntil,MAX_DUE).all();
  const selected=leased.results??[];
  if(!Array.isArray(selected)||selected.length>ids.length||
     selected.some(x=>!idSet.has(x.source_id))||
     selected.length!==(claim?.meta?.changes??selected.length))
   throw Error("P1_DISPATCH_LEASE_READBACK_MISMATCH");
  rows=selected;
 }catch{return {status:"P1_DISPATCH_LEASE_UNVERIFIED",selected:ids.length,queued:0}}
 const groups=Array.from({length:SHARDS},()=>[]);
 for(const row of rows){
  const shard=p1Shard(row.source_id);
  groups[shard].push({body:{kind:"P1_SOURCE_POLL_V1",
   source_id:row.source_id,shard,lease_token:token,scheduled_at:clock}});
 }
 const results=await Promise.all(groups.map(async(messages,shard)=>{
  let queued=0,failed=0;
  // Ten parallel logical shards; each transport sendBatch contains <=15
  // source IDs, matching the configured 15-message Cloudflare consumer.
  for(let i=0;i<messages.length;i+=BATCH){
   const piece=messages.slice(i,i+BATCH);
   try{
    await env.SOURCE_POLL_QUEUE.sendBatch(piece);
    queued+=piece.length;
   }catch{
    const sources=piece.map(x=>x.body.source_id);
    try{await env.DB.prepare(
     "UPDATE source_registry SET poll_dispatch_token=NULL,"+
     "poll_dispatch_lease_until=NULL WHERE poll_dispatch_token=? "+
     "AND source_id IN (SELECT value FROM json_each(?))"
    ).bind(token,JSON.stringify(sources)).run();}
    catch{/* lease expires automatically, no false ACK */}
    failed+=piece.length;
   }
  }
  return {shard,queued,failed};
 }));
 const queued=results.reduce((n,x)=>n+x.queued,0),failed=results.reduce((n,x)=>n+x.failed,0);
 return {status:failed?"P1_DISPATCH_PARTIAL":"P1_DISPATCH_QUEUED",
  selected:rows.length,queued,failed,
  logical_shards:SHARDS,source_per_minute_cap:MAX_DUE,
  no_source_payloads_or_urls_in_queue:true};
}
/**
 * V3 one-message/15-source queue consumer. A single D1 lease page authenticates
 * the entire source-ID set; any unverified D1 response retries the WHOLE
 * message. Already-committed sources become NOT_DUE on replay, so one bundle
 * retry never re-invents a poll receipt or duplicates ingest.
 */
export async function consumeP1SourcePollBundleMessage(msg,env,{
 now=Date.now(),fetchImpl=fetch,producerManager=null,poll=pollP0aSources
}={}){
 const item=msg?.body,ids=item?.source_ids;
 if(item?.kind!=="P1_SOURCE_POLL_V3"||
    !Array.isArray(ids)||ids.length<1||ids.length>BATCH||
    ids.some(x=>!SOURCE.test(x))||new Set(ids).size!==ids.length||
    Object.keys(item).sort().join(",")!=="kind,lease_token,scheduled_at,source_ids"||
    !/^[a-f0-9-]{36}$/iu.test(item.lease_token??"")||
    typeof item.scheduled_at!=="string"||
    !Number.isFinite(Date.parse(item.scheduled_at))){
  msg.ack();return {status:"P1_V3_INVALID_MESSAGE",attempted:0};
 }
 const expected=ids.map(source_id=>({
  source_id,token:item.lease_token,scheduled_at:item.scheduled_at,
 }));
 let leases;
 try{leases=await verifiedP1BundledLeasePairs(env,expected,now)}
 catch{
  msg.retry({delaySeconds:30});
  return {status:"P1_V3_D1_LEASE_UNAVAILABLE",attempted:0};
 }
 if(expected.some(x=>!leases.has(x.token+"|"+x.source_id))){
  // Expired/invalid lease is not authorization; the canonical source due
  // state remains scheduled for a new dispatch after bundle expiry.
  msg.ack();
  return {status:"P1_V3_LEASE_EXPIRED",attempted:0};
 }
 let result;
 try{
  result=await poll({DB:env.DB,...env},{now,fetchImpl,
   sourceIds:ids,limit:ids.length,requireDue:true,
   ...(producerManager?{producerManager}:{})});
 }catch{
  msg.retry({delaySeconds:30});
  return {status:"P1_V3_SOURCE_POLL_FAILED",attempted:0};
 }
 if(result?.ok!==true||!Array.isArray(result.receipts)){
  msg.retry({delaySeconds:30});
  return {status:"P1_V3_SOURCE_RECEIPTS_UNVERIFIED",attempted:0};
 }
 const receipts=new Map(result.receipts.map(x=>[x.source_id,x]));
 if(receipts.size!==ids.length||ids.some(id=>{
  const receipt=receipts.get(id);
  return !receipt||receipt.storage_readback_verified===false;
 })){
  msg.retry({delaySeconds:30});
  return {status:"P1_V3_SOURCE_READBACK_UNVERIFIED",attempted:0};
 }
 msg.ack();
 return {status:"P1_V3_POLLED",requested:ids.length,
  attempts:ids.filter(id=>receipts.get(id).state!=="NOT_DUE").length,
  physically_billed_queue_messages:1,source_ids_in_message:ids.length,
  rights_promoted:false};
}
export async function consumeP1SourcePollBatch(batch,env,{
 now=Date.now(),fetchImpl=fetch,producerManager=null,poll=pollP0aSources
}={}){
 if(batch?.queue!=="geomacro-source-poll"||!Array.isArray(batch.messages)||
    batch.messages.length>BATCH||!env?.DB?.prepare)
  throw Error("P1_QUEUE_CONSUMER_BINDING_INVALID");
 // Paid-mode runtime sets max_batch_size:1 so a single invocation processes
 // at most 15 source polls. Legacy V1/V2 messages remain compatible.
 if(batch.messages.length===1&&
    batch.messages[0]?.body?.kind==="P1_SOURCE_POLL_V3")
  return consumeP1SourcePollBundleMessage(batch.messages[0],env,{
    now,fetchImpl,producerManager,poll});
 if(batch.messages.some(msg=>msg?.body?.kind==="P1_SOURCE_POLL_V3")){
  // The deployment must never open a 15-message * 15-source CPU burst.
  // Keep bundles intact, recover via provider retry when batch config lags.
  for(const msg of batch.messages)msg.retry({delaySeconds:30});
  return {status:"P1_V3_CONSUMER_BATCH_SIZE_HELD",attempted:0};
 }
 const expected=[];
 for(const msg of batch.messages){
  const item=msg.body;
  if(!["P1_SOURCE_POLL_V1","P1_SOURCE_POLL_V2"].includes(item?.kind)||
     !SOURCE.test(item?.source_id??"")||
     !/^[a-f0-9-]{36}$/iu.test(item?.lease_token??"")||
     p1Shard(item.source_id)!==item.shard||
     typeof item.scheduled_at!=="string"||
     !Number.isFinite(Date.parse(item.scheduled_at))){
   msg.ack();continue;
  }
  expected.push({msg,source_id:item.source_id,token:item.lease_token,
   scheduled_at:item.scheduled_at,kind:item.kind});
 }
 if(!expected.length)return {status:"P1_CONSUME_EMPTY",attempted:0};
 // The new batch lease needs one bounded indexed D1 read for all <=15 queue
 // IDs, not 15 individual source registry queries. Preserve old V1 leases
 // during the existing 2-minute rolling Worker deployment window.
 const v2=expected.filter(x=>x.kind==="P1_SOURCE_POLL_V2");
 let verified=new Set();
 if(v2.length){
  try{verified=await verifiedP1BundledLeasePairs(env,v2,now)}
  catch{
   for(const x of expected)x.msg.retry({delaySeconds:30});
   return {status:"P1_CONSUME_BUNDLE_LEASE_D1_UNAVAILABLE",attempted:0};
  }
 }
 const current=new Map();
 for(const item of expected){
  let eligible=false;
  if(item.kind==="P1_SOURCE_POLL_V2")
   eligible=verified.has(item.token+"|"+item.source_id);
  else{
   try{
    const r=await env.DB.prepare(
     "SELECT source_id,poll_dispatch_token,poll_dispatch_lease_until "+
     "FROM source_registry WHERE source_id=? AND enabled=1"
    ).bind(item.source_id).first();
    eligible=r?.poll_dispatch_token===item.token&&
      r.poll_dispatch_lease_until>nowIso(now);
   }catch{
    item.msg.retry({delaySeconds:30});continue;
   }
  }
  if(!eligible){item.msg.ack();continue}
  if(current.has(item.source_id)){
   // Queue is at-least-once. Let one validated item retain the actual
   // poll CAS; duplicate messages are retried without false poll receipts.
   item.msg.retry({delaySeconds:30});continue;
  }
  current.set(item.source_id,item);
 }
 const ids=[...current.keys()];
 if(!ids.length)return {status:"P1_CONSUME_LEASE_EXPIRED",attempted:0};
 let result;
 try{
  result=await poll({DB:env.DB,...env},{now,fetchImpl,sourceIds:ids,
   limit:ids.length,requireDue:true,
   ...(producerManager?{producerManager}:{})});
 }catch{
  for(const item of current.values())item.msg.retry({delaySeconds:30});
  return {status:"P1_CONSUME_SOURCE_QUERY_FAILED",attempted:0};
 }
 if(result?.ok!==true||!Array.isArray(result.receipts)){
  for(const item of current.values())item.msg.retry({delaySeconds:30});
  return {status:"P1_CONSUME_POLL_UNVERIFIED",attempted:0};
 }
 const outcomes=new Map(result.receipts.map(x=>[x.source_id,x]));
 let attempts=0,failed=0;
 for(const [id,item] of current){
  const resultForSource=outcomes.get(id);
  if(!resultForSource||
     (resultForSource.state==="NOT_DUE"&&item.kind!=="P1_SOURCE_POLL_V2")||
     resultForSource.storage_readback_verified===false){
   // Never ACK an attempted source whose D1 state/readback is unverified.
   // Cron will reschedule after the short dispatch lease expires.
   item.msg.retry({delaySeconds:30});failed++;continue;
  }
  item.msg.ack();
  if(resultForSource.state!=="NOT_DUE")attempts++;
 }
 return {status:failed?"P1_CONSUME_PARTIAL":"P1_CONSUME_POLLED",
  requested:ids.length,attempts,failed,
  state_counts:result.receipts.reduce((acc,x)=>{
   const k=/^[A-Z_]{2,40}$/u.test(x?.state??"")?x.state:"UNKNOWN";
   acc[k]=(acc[k]??0)+1;return acc;
  },{}),rights_promoted:false};
}
export async function p1SourceCoverageHealth(env,{now=Date.now()}={}){
 if(!env?.DB?.prepare||!Number.isFinite(now))return response({
  ok:false,error:"P1_HEALTH_D1_UNAVAILABLE"},503);
 const hourAgo=nowIso(now-3600000),sixHours=nowIso(now-6*3600000);
 try{
  const [polled,linked,cells,evidence]=await Promise.all([
   env.DB.prepare(
    "SELECT COUNT(*) AS enabled,"+
    "SUM(CASE WHEN last_polled_at>=? THEN 1 ELSE 0 END) AS polled_1h,"+
    "SUM(CASE WHEN last_state='DENIED' THEN 1 ELSE 0 END) AS denied,"+
    "SUM(CASE WHEN last_state='UNAVAILABLE' THEN 1 ELSE 0 END) AS unavailable,"+
    "SUM(CASE WHEN last_state='CAPACITY_DEFERRED' THEN 1 ELSE 0 END) AS capacity_deferred "+
    "FROM source_registry WHERE enabled=1"
   ).bind(hourAgo).first(),
   env.DB.prepare("SELECT country_iso3,primary_category,"+
    "SUM(CASE WHEN rank<=2 THEN 1 ELSE 0 END) AS primary_count,"+
    "SUM(CASE WHEN rank=3 THEN 1 ELSE 0 END) AS secondary_count "+
    "FROM p1_source_to_cell GROUP BY country_iso3,primary_category").all(),
   env.DB.prepare("SELECT country_iso3,primary_category "+
    "FROM p1_country_category_cells ORDER BY country_iso3,primary_category LIMIT 585").all(),
   // Only B2-ACK-backed private original evidence is eligible for the
   // verified-source health flag: raw feed titles alone never count.
   env.DB.prepare("SELECT risk_country_iso3 AS country_iso3,category,"+
    "COUNT(*) AS records,MAX(original_published_at) AS latest "+
    "FROM phase2h_private_raw_news "+
    "WHERE b2_object_sha256 IS NOT NULL AND original_published_at>=? "+
    "AND first_ingested_at>=? AND risk_country_iso3 IS NOT NULL "+
    "GROUP BY risk_country_iso3,category"
   ).bind(sixHours,sixHours).all()
  ]);
  const cm=new Map((linked.results??[]).map(x=>[
   x.country_iso3+"|"+x.primary_category,x]));
  const ev=new Map((evidence.results??[]).map(x=>[
   x.country_iso3+"|"+({geopolitics:"GEOPOLITICS",
    macro:"MACRO_FX",rare_earth:"CRITICAL_MINERALS"}[x.category]??"UNMAPPED"),x]));
  const matrix=(cells.results??[]).map(x=>{
   const key=x.country_iso3+"|"+x.primary_category,link=cm.get(key),proof=ev.get(key);
   const primary=link?.primary_count??0,secondary=link?.secondary_count??0;
   return {country_iso3:x.country_iso3,category:x.primary_category,
    configured_primary_sources:primary,configured_secondary_sources:secondary,
    mapping_complete:primary>=2&&secondary>=1,
    verified_b2_originals_6h:proof?.records??0,
    freshest_verified_original_at:proof?.latest??null,
    fresh_verified_evidence_6h:(proof?.records??0)>0};
  });
  if(matrix.length!==585)return response({ok:false,
   error:"P1_585_CELL_REGISTRY_INCOMPLETE"},503);
  const active=matrix.filter(x=>x.fresh_verified_evidence_6h).length;
  return response({ok:true,schema:"geomacro.p1.source-coverage-585.v1",
   measured_at:nowIso(now),
   registry:{enabled:polled?.enabled??0,polled_at_least_once_last_1h:polled?.polled_1h??0,
    fully_polled_1h:(polled?.enabled??0)>0&&polled.polled_1h===polled.enabled,
    denied:polled?.denied??0,unavailable:polled?.unavailable??0,
    capacity_deferred:polled?.capacity_deferred??0},
   cells_total:585,cells_with_fresh_b2_original_6h:active,
   coverage_percent:Math.round(active/585*10000)/100,
   target_95_percent_met:active>=556,
   missing_mapping_cells:matrix.filter(x=>!x.mapping_complete).length,
   gaps:matrix.filter(x=>!x.fresh_verified_evidence_6h).length,
   matrix,commercial_rights_promoted:false});
 }catch{return response({ok:false,error:"P1_COVERAGE_QUERY_UNVERIFIED"},503)}
}

/** Admin-approved explicit mapping; never duplicate a GLOBAL feed into 195
 * countries by inference. A future report can mark missing source ranks.
 */
export async function p1UpsertSourceCellMap(env,body){
 if(!Array.isArray(body?.links)||body.links.length<1||
   body.links.length>50||Object.keys(body).join(",")!=="links")
  return response({ok:false,error:"P1_CELL_MAPPING_INVALID"},400);
 const keys=new Set(),stmts=[];
 for(const x of body.links){
  if(!x||Object.keys(x).sort().join(",")!=="category,country_iso3,rank,source_id"||
    !SOURCE.test(x.source_id??"")||!ISO3.test(x.country_iso3??"")||
    !CATEGORIES.has(x.category)||![1,2,3].includes(x.rank))
   return response({ok:false,error:"P1_CELL_MAPPING_INVALID"},400);
  const key=x.source_id+"|"+x.country_iso3+"|"+x.category;
  if(keys.has(key))return response({ok:false,error:"P1_CELL_MAPPING_DUPLICATE"},400);
  keys.add(key);
  // Protect against invented entity coverage or category leakage. A
  // GLOBAL source must be configured through a separate verified
  // country/topic feed registry, never automatically in this endpoint.
  const src=await env.DB.prepare("SELECT country_iso3,intended_category "+
   "FROM source_registry WHERE source_id=? AND enabled=1"
  ).bind(x.source_id).first();
  if(src?.country_iso3!==x.country_iso3||
     src?.intended_category!==x.category)
   return response({ok:false,error:"P1_SOURCE_CELL_NATIVE_SCOPE_MISMATCH"},400);
  stmts.push(env.DB.prepare(
   "INSERT INTO p1_source_to_cell(source_id,country_iso3,primary_category,rank) "+
   "VALUES (?,?,?,?) ON CONFLICT(source_id,country_iso3,primary_category) "+
   "DO UPDATE SET rank=excluded.rank"
  ).bind(x.source_id,x.country_iso3,x.category,x.rank));
 }
 try{
  await env.DB.batch(stmts);
  const found=await env.DB.prepare(
   "SELECT COUNT(*) AS count FROM p1_source_to_cell WHERE "+
   "source_id IN (SELECT value FROM json_each(?))"
  ).bind(JSON.stringify(body.links.map(x=>x.source_id))).first();
  if((found?.count??0)<keys.size)throw Error("P1_CELL_MAPPING_READBACK_INCOMPLETE");
  return response({ok:true,registered:keys.size,readback_verified:true,
   rights_promoted:false,global_coverage_invented:false});
 }catch{return response({ok:false,error:"P1_CELL_MAPPING_D1_UNAVAILABLE"},503)}
}
