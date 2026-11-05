/**
 * Durable P1 source-poll dispatch: one D1 row per <=108 source IDs instead of
 * a source_registry lease UPDATE for every due source. Atomic singleton gate
 * + materialized active-ID exclusion prevent overlapping dispatchers.
 *
 * Physical D1 rows still accrue for real per-source poll/checkpoint updates.
 * Queues deliver at least once; the existing per-source next_poll_at CAS in
 * pollP0aSources remains mandatory for duplicate consumer safety.
 * Private research only. No article text or arbitrary URL in queue payloads.
 */
const SOURCE=/^[a-z0-9][a-z0-9_.:-]{2,119}$/u;
const UUID=/^[a-f0-9-]{36}$/iu;
const MAX_DUE=108,SHARDS=10,BATCH=15;
const iso=at=>new Date(at).toISOString();
const valid=x=>Number.isSafeInteger(x)&&x>=0;
export const P1_BUNDLED_SOURCE_DUE_SQL=
 "WITH active_leases AS MATERIALIZED ("+
 "SELECT CAST(j.value AS TEXT) AS source_id "+
 "FROM p1_source_poll_bundles b,json_each(b.source_ids_json) j "+
 "WHERE b.expires_at>?) "+
 "SELECT s.source_id FROM source_registry s "+
 "LEFT JOIN active_leases a ON a.source_id=s.source_id "+
 "WHERE s.enabled=1 AND s.next_poll_at<=? AND a.source_id IS NULL "+
 "ORDER BY s.next_poll_at,s.source_id LIMIT ?";

export async function dispatchP1BundledDueSources(env,{
 now=Date.now(),limit=MAX_DUE,shardOf
}={}){
 if(!env?.DB?.prepare||
    typeof env?.SOURCE_POLL_QUEUE?.sendBatch!=="function"||
    typeof shardOf!=="function"||
    !Number.isSafeInteger(limit)||limit<1||limit>MAX_DUE||
    !valid(now))
  return {status:"P1_BUNDLE_BINDING_INVALID",selected:0,queued:0};
 const clock=iso(now);
 const readDue=async()=>{
  const r=await env.DB.prepare(P1_BUNDLED_SOURCE_DUE_SQL)
   .bind(clock,clock,limit).all();
  const rows=r?.results;
  if(!Array.isArray(rows)||rows.length>limit||
     rows.some(x=>!SOURCE.test(x?.source_id??""))||
     new Set(rows.map(x=>x.source_id)).size!==rows.length)
    throw Error("P1_BUNDLE_SOURCE_PAGE_UNVERIFIED");
  return rows.map(x=>x.source_id);
 };
 let pre;
 try{pre=await readDue()}catch{return {status:"P1_BUNDLE_D1_READ_UNAVAILABLE",selected:0,queued:0}}
 if(!pre.length)return {status:"P1_BUNDLE_IDLE",selected:0,queued:0};
 const token=crypto.randomUUID(),gateUntil=iso(now+60000);
 try{
  // Exactly one dispatcher holds the minute gate. A crash simply expires;
  // no permanent lock and no replay of a failed or unverified row.
  const gate=await env.DB.prepare(
   "UPDATE p1_source_poll_dispatch_mutex "+
   "SET lease_id=?,lease_until=? WHERE singleton=1 AND lease_until<=?"
  ).bind(token,gateUntil,clock).run();
  if(gate?.meta?.changes!==1)
   return {status:"P1_BUNDLE_DISPATCH_BUSY",selected:0,queued:0};
 }catch{return {status:"P1_BUNDLE_D1_GATE_UNAVAILABLE",selected:0,queued:0}}
 let ids,expires;
 try{
  // Recheck after the atomic gate. Never trust the earlier unleased page.
  ids=await readDue();
  if(!ids.length)return {status:"P1_BUNDLE_IDLE_AFTER_GATE",selected:0,queued:0};
  expires=iso(now+120000);
  const saved=await env.DB.prepare(
   "INSERT INTO p1_source_poll_bundles "+
   "(bundle_id,source_ids_json,leased_at,expires_at) VALUES (?,?,?,?)"
  ).bind(token,JSON.stringify(ids),clock,expires).run();
  if(saved?.meta?.changes!==1)throw Error("P1_BUNDLE_INSERT_UNCONFIRMED");
  const receipt=await env.DB.prepare(
   "SELECT source_ids_json,leased_at,expires_at FROM "+
   "p1_source_poll_bundles WHERE bundle_id=?"
  ).bind(token).first();
  if(receipt?.source_ids_json!==JSON.stringify(ids)||
     receipt?.leased_at!==clock||receipt?.expires_at!==expires)
   throw Error("P1_BUNDLE_INSERT_READBACK_INVALID");
 }catch{return {status:"P1_BUNDLE_D1_LEASE_UNVERIFIED",selected:0,queued:0}}
 const groups=Array.from({length:SHARDS},()=>[]);
 for(const sourceId of ids){
  const shard=shardOf(sourceId);
  if(!Number.isSafeInteger(shard)||shard<0||shard>=SHARDS)
   return {status:"P1_BUNDLE_SHARD_INVALID",selected:ids.length,queued:0};
  groups[shard].push({body:{kind:"P1_SOURCE_POLL_V2",
   source_id:sourceId,shard,lease_token:token,scheduled_at:clock}});
 }
 const result=await Promise.all(groups.map(async messages=>{
  let queued=0,failed=0;
  for(let i=0;i<messages.length;i+=BATCH){
   const piece=messages.slice(i,i+BATCH);
   try{await env.SOURCE_POLL_QUEUE.sendBatch(piece);queued+=piece.length}
   catch{failed+=piece.length}
  }
  return {queued,failed};
 }));
 const queued=result.reduce((n,x)=>n+x.queued,0);
 const failed=result.reduce((n,x)=>n+x.failed,0);
 // Only expired bundle receipts are removed. Failed sends leave one
 // short lease and automatically become eligible after 2m, not false ACKs.
 if(new Date(now).getUTCMinutes()%10===0){
  try{await env.DB.prepare(
   "DELETE FROM p1_source_poll_bundles WHERE expires_at<?"
  ).bind(iso(now-10*60000)).run()}catch{/* quota never overrides send receipt */}
 }
 return {status:failed?"P1_BUNDLE_QUEUED_PARTIAL":"P1_BUNDLE_QUEUED",
  selected:ids.length,queued,failed,
  base_table_dispatch_lease_rows:1,base_table_mutex_rows:1,
  provider_billed_index_write_overhead_unmeasured:true,
  logical_shards:SHARDS,source_per_minute_cap:MAX_DUE,
  queue_at_least_once:true,private_source_ids_only:true};
}
export async function verifiedP1BundledLeasePairs(env,items,now){
 if(!env?.DB?.prepare||!Array.isArray(items)||items.length<1||
    items.length>15||!valid(now)||items.some(x=>
     !SOURCE.test(x?.source_id??"")||!UUID.test(x?.token??"")||
     typeof x?.scheduled_at!=="string"||
     !Number.isFinite(Date.parse(x.scheduled_at))))
  throw Error("P1_BUNDLE_CONSUMER_INPUT_INVALID");
 const tokens=[...new Set(items.map(x=>x.token))];
 const sourceIds=[...new Set(items.map(x=>x.source_id))];
 const r=await env.DB.prepare(
  "SELECT b.bundle_id,b.leased_at,j.value AS source_id "+
  "FROM p1_source_poll_bundles b,json_each(b.source_ids_json) j "+
  "WHERE b.bundle_id IN (SELECT value FROM json_each(?)) "+
  "AND b.expires_at>? "+
  "AND j.value IN (SELECT value FROM json_each(?))"
 ).bind(JSON.stringify(tokens),iso(now),JSON.stringify(sourceIds)).all();
 if(!Array.isArray(r?.results)||r.results.length>MAX_DUE)
  throw Error("P1_BUNDLE_CONSUMER_READBACK_INVALID");
 const allowed=new Map(items.map(x=>[x.token+"|"+x.source_id,
  x.scheduled_at]));
 const verified=new Set();
 for(const row of r.results){
  const k=row.bundle_id+"|"+row.source_id;
  if(!allowed.has(k)||verified.has(k))
   throw Error("P1_BUNDLE_CONSUMER_LEASE_CONFLICT");
  // A queue token cannot authorize a different schedule clock.
  if(row.leased_at===allowed.get(k))verified.add(k);
 }
 return verified;
}
