/**
 * P0-B durable Queue dispatch. Keep idempotent B2+D1 receipts before sending;
 * never send a physical INGEST_QUEUE message without the same monthly
 * reservation ledger consumed by SOURCE_POLL_QUEUE.
 *
 * Ambiguous send failures retain the reservation; normal outbox/redrive
 * still owns retry and MUST NOT acknowledge unverified evidence.
 */
import {reserveP0BIngestQueueMessage}
 from "../../workers/control-plane/src/p1-queue-monthly-budget.mjs";

export async function sendBudgetedP0BMessage(
 env:{DB:any;INGEST_QUEUE:{send:(v:unknown)=>Promise<void>}},
 message:unknown,{now=Date.now()}={}
):Promise<void>{
 if(!env?.DB?.prepare||!env?.INGEST_QUEUE?.send)
  throw Error("P0B_QUEUE_BUDGET_CONFIG_INVALID");
 const ticket=await reserveP0BIngestQueueMessage(env.DB,{now});
 if(ticket.admitted!==true||ticket.reservation_operations!==5||
    ticket.same_account_source_and_ingest_queue_budget!==true)
  throw Error("P0B_QUEUE_SHARED_BUDGET_HELD");
 await env.INGEST_QUEUE.send(message);
}
