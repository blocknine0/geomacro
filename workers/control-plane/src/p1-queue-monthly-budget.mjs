/**
 * Conservative shared D1-backed monthly budget for source polling and P0-B ingestion.
 * One atomic UPSERT+RETURNING reserves five operations per message:
 * one write, up to two reads (one retry), delete and optional DLQ write.
 * Never releases an unused reservation after an ambiguous provider result.
 *
 * This does not reserve unrelated Queues, cover 64KB+ messages, or prove the
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
  // One atomic D1 statement instead of INSERT OR IGNORE + UPDATE + SELECT
  // for each bundle dispatch. Returning values are the same transaction's
  // exact reservation receipt; concurrent source and P0B messages contend on
  // this single UTC-month row without creating a second quota.
  const r=await db.prepare(
   "INSERT INTO cloudflare_source_poll_queue_budget "+
   "(month_utc,queue_name,operations_reserved,source_messages_reserved,updated_at) "+
   "VALUES (?,'geomacro-source-poll',?,?,?) "+
   "ON CONFLICT(month_utc) DO UPDATE SET "+
   "operations_reserved=cloudflare_source_poll_queue_budget.operations_reserved+excluded.operations_reserved,"+
   "source_messages_reserved=cloudflare_source_poll_queue_budget.source_messages_reserved+excluded.source_messages_reserved,"+
   "updated_at=excluded.updated_at "+
   "WHERE cloudflare_source_poll_queue_budget.operations_reserved<=? "+
   "RETURNING operations_reserved,source_messages_reserved"
  ).bind(month,operations,messages,timestamp,
   P1_MONTHLY_OPERATIONS_MAX-operations).first();
  if(!r)return {admitted:false,reason:"P1_QUEUE_MONTHLY_BUDGET_HELD",
    operations_requested:operations};
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

/**
 * P0-B ingestion Queue shares this SAME account reservation row with source
 * polling. The schema's queue_name is a historical ledger identifier; it does
 * not authorize or partition spending for only that physical Queue.
 *
 * One atomic UPSERT + RETURNING replaces a racy SELECT/UPDATE and does not
 * require a new D1 migration. Source-message counters remain source-only.
 * Unknown D1 schema, failure, or cap exhaustion HOLD before a Queue send.
 */
export async function reserveP0BIngestQueueMessage(db,{now=Date.now()}={}){
 if(!db?.prepare||!valid(now))
  return {admitted:false,reason:"P0B_QUEUE_BUDGET_INPUT_INVALID"};
 const timestamp=new Date(now).toISOString();
 const month=timestamp.slice(0,7);
 if(!TIME.test(month))
  return {admitted:false,reason:"P0B_QUEUE_BUDGET_MONTH_INVALID"};
 const operations=P1_QUEUE_RESERVED_OPS_PER_MESSAGE;
 try{
  const row=await db.prepare(
   "INSERT INTO cloudflare_source_poll_queue_budget "+
   "(month_utc,queue_name,operations_reserved,source_messages_reserved,updated_at) "+
   "VALUES (?,'geomacro-source-poll',?,0,?) "+
   "ON CONFLICT(month_utc) DO UPDATE SET "+
   "operations_reserved=cloudflare_source_poll_queue_budget.operations_reserved+?,"+
   "updated_at=excluded.updated_at "+
   "WHERE cloudflare_source_poll_queue_budget.operations_reserved<=? "+
   "RETURNING operations_reserved,source_messages_reserved"
  ).bind(month,operations,timestamp,operations,
   P1_MONTHLY_OPERATIONS_MAX-operations).first();
  if(!row)
   return {admitted:false,reason:"P0B_QUEUE_SHARED_MONTHLY_BUDGET_HELD",
    reservation_operations:operations};
  if(!valid(row.operations_reserved)||row.operations_reserved> P1_MONTHLY_OPERATIONS_MAX||
     !valid(row.source_messages_reserved))
   return {admitted:false,reason:"P0B_QUEUE_BUDGET_READBACK_UNVERIFIED"};
  return {admitted:true,reason:"P0B_QUEUE_BUDGET_RESERVED",month_utc:month,
   operations_reserved:row.operations_reserved,
   source_messages_reserved:row.source_messages_reserved,
   limit_operations:P1_MONTHLY_OPERATIONS_MAX,
   reservation_operations:operations,
   same_account_source_and_ingest_queue_budget:true,
   provider_account_wide_hard_limit:false};
 }catch{
  return {admitted:false,reason:"P0B_QUEUE_BUDGET_D1_UNAVAILABLE"};
 }
}
