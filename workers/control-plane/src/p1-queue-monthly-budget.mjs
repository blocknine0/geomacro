/**
 * Conservative D1-backed budget for source-poll Queues messages only.
 * Five operations per source-bundle message reserved before sending:
 * one write, up to two reads (one retry), delete and optional DLQ write.
 * Never releases an unused reservation after an ambiguous provider result.
 *
 * This does not reserve other Queues, cover 64KB+ messages, or prove the
 * Cloudflare account invoice. The 64KB message bound is checked by sender.
 */
export const P1_QUEUE_BUDGET_SCHEMA="geomacro.p1.queue-monthly-reservation.v1";
export const P1_MONTHLY_OPERATIONS_MAX=800000;
export const P1_QUEUE_RESERVED_OPS_PER_MESSAGE=5;
export const P1_BUNDLE_SOURCE_IDS_MAX=15;
const TIME=/^\d{4}-\d{2}$/;
const valid=n=>Number.isSafeInteger(n)&&n>=0;
export async function reserveP1SourceQueueMessages(db,{now=Date.now(),messages}={}){
 if(!db?.prepare||!valid(now)||!Number.isSafeInteger(messages)||
    messages<1||messages>8)
  return {admitted:false,reason:"P1_QUEUE_BUDGET_INPUT_INVALID"};
 const month=new Date(now).toISOString().slice(0,7);
 if(!TIME.test(month))
  return {admitted:false,reason:"P1_QUEUE_BUDGET_MONTH_INVALID"};
 const operations=messages*P1_QUEUE_RESERVED_OPS_PER_MESSAGE;
 const timestamp=new Date(now).toISOString();
 try{
  await db.prepare(
   "INSERT OR IGNORE INTO cloudflare_source_poll_queue_budget "+
   "(month_utc,queue_name,operations_reserved,source_messages_reserved,updated_at) "+
   "VALUES (?,'geomacro-source-poll',0,0,?)"
  ).bind(month,timestamp).run();
  const update=await db.prepare(
   "UPDATE cloudflare_source_poll_queue_budget "+
   "SET operations_reserved=operations_reserved+?,"+
   "source_messages_reserved=source_messages_reserved+?,updated_at=? "+
   "WHERE month_utc=? AND queue_name='geomacro-source-poll' "+
   "AND operations_reserved<=?"
  ).bind(operations,messages,timestamp,month,P1_MONTHLY_OPERATIONS_MAX-operations).run();
  if(update?.meta?.changes!==1)
   return {admitted:false,reason:"P1_QUEUE_MONTHLY_BUDGET_HELD",
    operations_requested:operations};
  const r=await db.prepare(
   "SELECT operations_reserved,source_messages_reserved "+
   "FROM cloudflare_source_poll_queue_budget WHERE month_utc=?"
  ).bind(month).first();
  if(!valid(r?.operations_reserved)||
     r.operations_reserved> P1_MONTHLY_OPERATIONS_MAX ||
     !valid(r.source_messages_reserved)||r.source_messages_reserved<messages)
   return {admitted:false,reason:"P1_QUEUE_MONTHLY_BUDGET_READBACK_UNVERIFIED",
    operations_requested:operations};
  return {admitted:true,reason:"P1_QUEUE_BUDGET_RESERVED",
   month_utc:month,operations_reserved:r.operations_reserved,
   source_messages_reserved:r.source_messages_reserved,
   limit_operations:P1_MONTHLY_OPERATIONS_MAX,
   reservation_operations:operations,provider_account_wide_hard_limit:false};
 }catch{
  return {admitted:false,reason:"P1_QUEUE_BUDGET_D1_UNAVAILABLE"};
 }
}
