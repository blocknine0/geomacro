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
import {reserveP1SourceQueueMessages,P1_BUNDLE_SOURCE_IDS_MAX}
 from "./p1-queue-monthly-budget.mjs";
const SOURCE=/^[a-z0-9][a-z0-9_.:-]{2,119}$/u;
const UUID=/^[a-f0-9-]{36}$/iu;
const MAX_DUE=105,SHARDS=10,BATCH=P1_BUNDLE_SOURCE_IDS_MAX;
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
  // Read the due page only after taking the atomic gate. Concurrent
  // dispatchers never run the expensive active-lease join.
  ids=await readDue();
  if(!ids.length)return {status:"P1_BUNDLE_IDLE",selected:0,queued:0};
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
 // V3 is ACTUAL message bundling: 15 source IDs inside ONE queue message.
 // A sendBatch of 15 independent messages is not a 15-source cost reduction.
 // Each V3 payload carries no URL, content, secret or caller input.
 const messages=[];
 for(let i=0;i<ids.length;i+=BATCH){
  const source_ids=ids.slice(i,i+BATCH);
  if(source_ids.some(x=>!Number.isSafeInteger(shardOf(x))||
     shardOf(x)<0||shardOf(x)>=SHARDS))
   return {status:"P1_BUNDLE_SHARD_INVALID",selected:ids.length,queued:0};
  const body={kind:"P1_SOURCE_POLL_V3",source_ids,
   lease_token:token,scheduled_at:clock};
  // Cloudflare bills another 64KB operation for each additional 64KB.
  // Intentionally refuse a message whose encoded body plus metadata could
  // reach that boundary, preserving the 5-op reservation estimate.
  if(new TextEncoder().encode(JSON.stringify(body)).byteLength+512>=64000)
   return {status:"P1_BUNDLE_MESSAGE_TOO_LARGE",selected:ids.length,queued:0};
  messages.push({body});
 }
 // One atomic monthly D1 reservation before ANY Queue send. The reservation
 // assumes one retry and optional DLQ write; ambiguous sends are not refunded.
 const budget=await reserveP1SourceQueueMessages(env.DB,{
  now,messages:messages.length});
 if(!budget.admitted)return {status:budget.reason,selected:ids.length,
  queued:0,failed:0,budget_held:true};
 let queued=0,failed=0;
 // <=7 actual messages for a <=105-source page, no per-source sendBatch.
 // On partial failure retry only after the short D1 lease expires.
 try{
  await env.SOURCE_POLL_QUEUE.sendBatch(messages);
  queued=ids.length;
 }catch{failed=ids.length}
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
  queue_messages_reserved:messages.length,
  queue_operations_reserved:budget.reservation_operations,
  queue_operations_month_total:budget.operations_reserved,
  queue_budget_not_account_wide:true,
  logical_shards:SHARDS,source_per_minute_cap:MAX_DUE,
  actual_source_ids_per_message_max:BATCH,
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
 // Fetch only primary-key bundle rows. Expand the bounded manifest in JS;
 // SQLite json_each previously scanned every member for every delivery.
 const r=await env.DB.prepare(
  "SELECT bundle_id,source_ids_json,leased_at,expires_at "+
  "FROM p1_source_poll_bundles WHERE bundle_id IN ("+
  tokens.map(()=>"?").join(",")+") AND expires_at>?"
 ).bind(...tokens,iso(now)).all();
 if(!Array.isArray(r?.results)||r.results.length>tokens.length)
  throw Error("P1_BUNDLE_CONSUMER_READBACK_INVALID");
 const manifests=new Map();
 for(const row of r.results){
  if(!tokens.includes(row.bundle_id)||manifests.has(row.bundle_id)||
     !Number.isFinite(Date.parse(row.leased_at))||
     !Number.isFinite(Date.parse(row.expires_at))||
     row.expires_at<=iso(now)||
     typeof row.source_ids_json!=="string"||row.source_ids_json.length>14000)
   throw Error("P1_BUNDLE_CONSUMER_LEASE_CONFLICT");
  let ids;
  try{ids=JSON.parse(row.source_ids_json)}catch{
   throw Error("P1_BUNDLE_CONSUMER_READBACK_INVALID");
  }
  if(!Array.isArray(ids)||ids.length<1||ids.length>108||
     ids.some(id=>typeof id!=="string"||!SOURCE.test(id))||
     new Set(ids).size!==ids.length)
   throw Error("P1_BUNDLE_CONSUMER_READBACK_INVALID");
  manifests.set(row.bundle_id,{clock:row.leased_at,ids:new Set(ids)});
 }
 const verified=new Set();
 for(const item of items){
  const manifest=manifests.get(item.token);
  // Both exact schedule and membership are necessary; token alone is not authority.
  if(manifest?.clock===item.scheduled_at&&manifest.ids.has(item.source_id))
   verified.add(item.token+"|"+item.source_id);
 }
 return verified;
}
