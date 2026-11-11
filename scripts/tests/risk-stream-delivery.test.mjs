import {test} from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,createHash,sign} from "node:crypto";
import {dispatchRiskStreamOutbox,consumeRiskStreamDelivery}
 from "../../workers/control-plane/src/risk-stream-delivery.mjs";
const digest=v=>createHash("sha256").update(v).digest("hex");
function fixture(){
 const key=generateKeyPairSync("ed25519"),id=digest("originals:1,2");
 const payload={schema:"geomacro.event-stream-gro.v1",
  subject:{type:"COUNTRY",id:"USA"},category:"GEOPOLITICS",
  event_fingerprint:digest("event"),source_originals:[digest("a"),digest("b")],
  generated_at:new Date().toISOString(),expires_at:new Date(Date.now()+3600000).toISOString(),
  customer_delivery_authorized:false,certified_risk_index:false,
  charged:false,execution_authorized:false};
 const canonical=JSON.stringify(payload),hash=digest(canonical);
 const row={gro_id:id,country_iso3:"USA",category:"GEOPOLITICS",
  payload_json:canonical,payload_sha256:hash,
  signature_b64:sign(null,Buffer.from(canonical),key.privateKey).toString("base64"),
  expires_at:payload.expires_at};
 const pointers=[],receipts=new Map(),outbox={gro_id:id,state:"PENDING"};
 const db={prepare(sql){return {
  args:[],bind(...a){this.args=a;return this},
  async all(){
   if(sql.includes("FROM risk_stream_delivery_outbox"))
    return {results:outbox.state==="PENDING"?[{gro_id:id,payload_sha256:hash}]:[]};
   throw Error("UNEXPECTED_SELECT");
  },
  async first(){
   if(sql.includes("FROM risk_stream_signed_gro"))return row;
   throw Error("UNEXPECTED_READ");
  },
  async run(){
   if(sql.startsWith("UPDATE risk_stream_delivery_outbox"))outbox.state="DISPATCHED";
   return {success:true};
  }
 }},async batch(stmts){
  for(const s of stmts)receipts.set(s.args[0],{payload_sha256:s.args[1]});
  return stmts.map(()=>({success:true}));
 }};
 const env={DB:db,RISK_STREAM_ACTIVE:"1",
  RISK_STREAM_GRO_VERIFY_SPKI_B64:
   key.publicKey.export({type:"spki",format:"der"}).toString("base64"),
  RISK_STREAM_DELIVERY_QUEUE:{async sendBatch(batch){
   for(const item of batch)pointers.push(item.body);
  }}
 };
 return {env,pointers,receipts,outbox,row,payload};
}
test("new GRO is handed to durable internal delivery queue without funds, then verified against immutable signed D1",async()=>{
 const f=fixture();
 const queued=await dispatchRiskStreamOutbox(f.env);
 assert.equal(queued.status,"QUEUED_INTERNAL");
 assert.equal(queued.count,1);
 assert.equal(f.outbox.state,"DISPATCHED");
 let ack=0,retry=0;
 const batch={messages:f.pointers.map(body=>({body,ack(){ack++},retry(){retry++}}))};
 const delivered=await consumeRiskStreamDelivery(batch,f.env);
 assert.equal(delivered.status,"DELIVERED_INTERNAL_NO_FUNDS");
 assert.equal(ack,1);assert.equal(retry,0);assert.equal(f.receipts.size,1);
 // Queue redelivery is safe: the receipt is still only one canonical row.
 await consumeRiskStreamDelivery(batch,f.env);
 assert.equal(f.receipts.size,1);
});
test("forged signature cannot be delivered or ACKed; message is retried",async()=>{
 const f=fixture();
 await dispatchRiskStreamOutbox(f.env);
 f.row.signature_b64=f.row.signature_b64.slice(0,-6)+"AAAAAA";
 let ack=0,retry=0;
 const batch={messages:f.pointers.map(body=>({body,ack(){ack++},retry(){retry++}}))};
 await assert.rejects(consumeRiskStreamDelivery(batch,f.env),
  /RISK_STREAM_DELIVERY_SIGNATURE_UNVERIFIED|RISK_STREAM_DELIVERY_SIGNATURE_INVALID/u);
 assert.equal(ack,0);assert.equal(retry,1);assert.equal(f.receipts.size,0);
});
test("missing internal Queue binding never marks signed GRO delivered",async()=>{
 const f=fixture();
 delete f.env.RISK_STREAM_DELIVERY_QUEUE;
 const result=await dispatchRiskStreamOutbox(f.env);
 assert.equal(result.status,"HOLD_BINDING_UNAVAILABLE");
 assert.equal(f.outbox.state,"PENDING");
 assert.equal(f.receipts.size,0);
});
