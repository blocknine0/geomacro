import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {CommerceLedger} from "../../workers/commerce-ledger/src/index.mjs";

const sha = value => createHash("sha256").update(value,"utf8").digest("hex");
const generatedAt = new Date(Date.now()-3600_000).toISOString();
const customerBytes = '{"signed":"synthetic-ed25519-receipt-only","license":"CC BY 4.0"}';
const input = {
  bindingHash:sha("binding:answer:terms:rights"),queryHash:sha("query"),
  rightsHash:sha("rights"),receiptHash:sha("real-receipt-placeholder"),
  answerHash:sha(customerBytes),termsHash:sha("price:payee:network:asset"),
  rightsGeneratedAt:generatedAt,customerBytes,
};
function ledger(){
  const map=new Map();
  const storage={
    get:async key=>structuredClone(map.get(key)),
    transaction:async cb=>cb({
      get:async key=>structuredClone(map.get(key)),
      put:async(key,value)=>map.set(key,structuredClone(value)),
    }),
  };
  return new CommerceLedger({storage},{});
}
async function post(s,action,payload){
  const resp=await s.fetch(new Request("https://ledger.internal/"+action,{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify(payload),
  }));
  return {status:resp.status,body:await resp.json()};
}
test("real Durable Object source freezes UTF-8 bytes immutably and reads identical replay",async()=>{
  const s=ledger();
  const first=await post(s,"wdi-prequote-freeze",input);
  assert.equal(first.status,200);
  assert.deepEqual(first.body.disposition,"FROZEN");
  const read1=await post(s,"wdi-prequote-readback",{bindingHash:input.bindingHash});
  const read2=await post(s,"wdi-prequote-readback",{bindingHash:input.bindingHash});
  assert.equal(read1.status,200);
  assert.equal(read1.body.customerBytes,customerBytes);
  assert.deepEqual(read2.body,read1.body);
  assert.equal(sha(read1.body.customerBytes),input.answerHash);
  assert.equal(read1.body.payment_authorized,false);
  assert.equal(read1.body.settlement_attempted,false);
  const replay=await post(s,"wdi-prequote-freeze",input);
  assert.equal(replay.body.disposition,"EXACT_REPLAY");
  const switched=await post(s,"wdi-prequote-freeze",{
    ...input,termsHash:sha("different-payee"),
  });
  assert.equal(switched.status,409);
  assert.equal(switched.body.ok,false);
  const modified=await post(s,"wdi-prequote-freeze",{
    ...input,customerBytes:customerBytes+"tampered",
  });
  assert.equal(modified.status,409);
});
test("prequote rejects wrong digest, invalid rights clock and missing records",async()=>{
  const s=ledger();
  const none=await post(s,"wdi-prequote-readback",{bindingHash:input.bindingHash});
  assert.equal(none.status,409);
  assert.equal((await post(s,"wdi-prequote-freeze",{
    ...input,answerHash:sha("tamper"),
  })).status,409);
  assert.equal((await post(s,"wdi-prequote-freeze",{
    ...input,rightsGeneratedAt:"2020-01-01T00:00:00.000Z",
  })).status,409);
  assert.equal((await post(s,"wdi-prequote-freeze",{
    ...input,rightsGeneratedAt:"not-a-timestamp",
  })).status,409);
});


test("synthetic-only legacy x402 claim/prepare/deliver/replay preserves frozen bytes",async()=>{
  // This test does NOT invoke Coinbase, settle real funds, or write production.
  const s=ledger();
  const frozen=await post(s,"wdi-prequote-freeze",input);
  assert.equal(frozen.status,200);
  const quote=await post(s,"wdi-prequote-readback",{bindingHash:input.bindingHash});
  assert.equal(quote.status,200);
  const paymentFingerprint=sha("synthetic-no-funds-payment");
  const requestFingerprint=sha(JSON.stringify({
    quote_ref:input.bindingHash,query:input.queryHash,terms:input.termsHash,
  }));
  const claim={
    provider:"coinbase_x402",providerEnvironment:"mainnet",
    paymentFingerprint,requestFingerprint,productId:"geomacro_wdi_china_cpi_v1",
    network:"eip155:8453",asset:"0x"+"1".repeat(40),
    amountAtomic:"50000",recipientHash:sha("synthetic-payee"),
  };
  const first=await post(s,"claim",claim);
  assert.equal(first.body.disposition,"CLAIMED");
  const claimToken=first.body.claim_token;
  const payload={frozen_quote_reference:input.bindingHash,
    customer_bytes:quote.body.customerBytes};
  assert.equal((await post(s,"prepare",{
    paymentFingerprint,claimToken,responsePayload:payload,
    responseSha256:sha(JSON.stringify(payload)),
  })).body.ok,true);
  assert.equal((await post(s,"claim",claim)).body.disposition,"IN_PROGRESS");
  // In-memory synthetic ledger finalization, NOT a real settlement.
  assert.equal((await post(s,"complete",{
    paymentFingerprint,claimToken,
    settlementReference:"synthetic-no-funds-local-only",
    settlementNetwork:"test-only",
  })).body.ok,true);
  const replay=await post(s,"claim",claim);
  assert.equal(replay.body.disposition,"REPLAY");
  assert.deepEqual(replay.body.response_payload,payload);
  assert.equal(replay.body.response_payload.customer_bytes,customerBytes);
  assert.equal((await post(s,"claim",{
    ...claim,amountAtomic:"60000",
  })).body.disposition,"CONFLICT");
  assert.equal((await post(s,"claim",{
    ...claim,recipientHash:sha("changed-payee"),
  })).body.disposition,"CONFLICT");
  assert.equal((await post(s,"claim",{
    ...claim,requestFingerprint:sha("modified-query"),
  })).body.disposition,"CONFLICT");
});
