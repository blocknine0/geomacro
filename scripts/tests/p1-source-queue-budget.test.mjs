import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {
 reserveP1SourceQueueMessages,P1_MONTHLY_OPERATIONS_MAX,
 P1_QUEUE_RESERVED_OPS_PER_MESSAGE,
} from "../../workers/control-plane/src/p1-queue-monthly-budget.mjs";

const centralBudget=JSON.parse(readFileSync(new URL(
 "../../config/geomacro-cloudflare-five-usd-budget.json",import.meta.url),"utf8"));
const now=Date.parse("2026-11-05T16:00:00.000Z");
function fixture(){
 const db=new DatabaseSync(":memory:");
 db.exec(readFileSync(new URL(
  "../../workers/control-plane/migrations/0128_cloudflare_queue_monthly_source_budget.sql",
  import.meta.url),"utf8"));
 const prepare=(sql,args=[])=>({bind(...v){return prepare(sql,v)},
  async run(){let result=db.prepare(sql).run(...args);
    return {meta:{changes:result.changes}}},
  async first(){return db.prepare(sql).get(...args)??null},
 });
 return {db,DB:{prepare},close(){db.close()}};
}
test("one actual queue message reserves 5 conservative operations atomically",async()=>{
 const f=fixture();
 try{
  const a=await reserveP1SourceQueueMessages(f.DB,{now,messages:7});
  assert.equal(a.admitted,true);
  assert.equal(a.reservation_operations,35);
  assert.equal(a.operations_reserved,35);
  assert.equal(a.source_messages_reserved,7);
  assert.equal(a.limit_operations,P1_MONTHLY_OPERATIONS_MAX);
  const b=await reserveP1SourceQueueMessages(f.DB,{now,messages:2});
  assert.equal(b.operations_reserved,45);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS c FROM cloudflare_source_poll_queue_budget")
   .get().c,1);
 }finally{f.close()}
});
test("queue quota refuses the next send before exceeding monthly central cap",async()=>{
 const f=fixture();
 try{
  const month="2026-11";
  f.db.prepare("INSERT INTO cloudflare_source_poll_queue_budget "+
   "(month_utc,operations_reserved,source_messages_reserved,updated_at) VALUES (?,?,?,?)")
   .run(month,P1_MONTHLY_OPERATIONS_MAX-2,100,"2026-11-05T00:00:00Z");
  const hold=await reserveP1SourceQueueMessages(f.DB,{now,messages:1});
  assert.equal(hold.admitted,false);
  assert.equal(hold.reason,"P1_QUEUE_MONTHLY_BUDGET_HELD");
  assert.equal(f.db.prepare("SELECT operations_reserved n "+
   "FROM cloudflare_source_poll_queue_budget").get().n,
   P1_MONTHLY_OPERATIONS_MAX-2);
 }finally{f.close()}
});
test("unknown D1 budget state, invalid batch or DB errors cannot authorize Queue sends",async()=>{
 const f=fixture();
 try{
  for(const messages of [0,9,-1,1.2]){
   assert.equal((await reserveP1SourceQueueMessages(f.DB,{now,messages})).admitted,false);
  }
  assert.equal((await reserveP1SourceQueueMessages({prepare(){throw Error("NO_DB")}},
   {now,messages:1})).admitted,false);
  assert.equal(P1_QUEUE_RESERVED_OPS_PER_MESSAGE,5);
 }finally{f.close()}
});
test("monthly ledger rolls over without modifying the previous month's reservations",async()=>{
 const f=fixture();
 try{
  await reserveP1SourceQueueMessages(f.DB,{now,messages:1});
  await reserveP1SourceQueueMessages(f.DB,{
   now:Date.parse("2026-12-01T00:00:00Z"),messages:1});
  const rows=f.db.prepare("SELECT month_utc,operations_reserved "+
   "FROM cloudflare_source_poll_queue_budget ORDER BY month_utc").all();
  assert.deepEqual(rows.map(x=>x.month_utc),["2026-11","2026-12"]);
  assert.deepEqual(rows.map(x=>x.operations_reserved),[5,5]);
 }finally{f.close()}
});

test("central $5 budget manifest pins exact source Queue monthly reservation and keeps payments off",()=>{
 assert.equal(centralBudget.schema,"geomacro.cloudflare-five-usd-central-budget.v1");
 assert.equal(centralBudget.monthly_guardrail_targets_not_provider_hard_caps.queues_standard_operations,
  P1_MONTHLY_OPERATIONS_MAX);
 assert.equal(centralBudget.minimum_monthly_plan_usd,5);
 assert.equal(centralBudget.absolute_invoice_cap_guaranteed,false);
 assert.equal(centralBudget.automatic_paid_activation,false);
 assert.equal(centralBudget.automatic_cloudflare_subscription_changes,false);
 assert.equal(centralBudget.commercial_payment_switch_unchanged,true);
});
