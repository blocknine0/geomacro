import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import consumer from "../../workers/derived-discovery-consumer/worker.mjs";
const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),"utf8"));

test("sidecar has no externally reachable Worker route or commercial settings",async()=>{
 const c=read("../../workers/derived-discovery-consumer/wrangler.example.jsonc");
 assert.equal(c.workers_dev,false);
 assert.equal(c.routes,undefined);
 assert.equal(c.triggers,undefined);
 assert.equal(c.name,"geomacro-derived-discovery-consumer");
 assert.equal(c.d1_databases.length,1);
 assert.equal(c.d1_databases[0].binding,"DB");
 assert.equal(c.queues.consumers.length,1);
 assert.equal(c.queues.consumers[0].queue,"geomacro-derived-discovery");
 assert.equal(c.queues.consumers[0].max_batch_size,1);
 assert.equal(c.queues.consumers[0].max_retries,3);
 assert.equal(c.queues.consumers[0].dead_letter_queue,"geomacro-derived-discovery-dlq");
 assert.equal((await consumer.fetch()).status,404);
});
test("canonical main Worker only produces; isolated Worker alone consumes",()=>{
 const c=read("../../workers/control-plane/wrangler.example.jsonc");
 assert.equal(c.queues.producers.filter(x=>x.binding==="DERIVED_DISCOVERY_QUEUE").length,1);
 assert.equal(c.queues.consumers.filter(x=>x.queue==="geomacro-derived-discovery").length,0);
 assert.equal(c.vars.DERIVED_DISCOVERY_QUEUE_ENABLED,"1");
});
test("malformed queue input never receives an ACK from isolated consumer",async()=>{
 let retried=null,ack=false;
 await consumer.queue({queue:"geomacro-derived-discovery",messages:[{
  body:{schema:"INVALID",payload:"unverified"},
  attempts:1,retry:x=>{retried=x},ack:()=>{ack=true}
 }]},{DB:{prepare:()=>{throw Error("DB_MUST_NOT_BE_USED")}}});
 assert.deepEqual(retried,{delaySeconds:15});
 assert.equal(ack,false);
});

test("provider-redacted script identity requires exact protected Wrangler deploy and provider DLQ check",()=>{
 const y=readFileSync(".github/workflows/deploy-derived-discovery-consumer.yml","utf8");
 assert.match(y,/VERIFIED_WRANGLER_DEPLOY_SHA/u);
 assert.match(y,/DISCOVERY_EXACT_MAIN_WRANGLER_DEPLOY_PROOF_REQUIRED/u);
 assert.match(y,/script_name==null/u);
 assert.match(y,/consumers\.length===1/u);
 assert.match(y,/dead_letter_queue==='geomacro-derived-discovery-dlq'/u);
 assert.match(y,/max_retries===3/u);
 assert.match(y,/workers_dev!==false/u);
});
