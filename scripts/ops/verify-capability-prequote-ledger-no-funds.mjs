#!/usr/bin/env node
/**
 * Authenticated production Durable Object capability-operations probe.
 * SYNTHETIC NO-FUNDS ONLY. Proves storage/API behavior, NOT rights, signatures,
 * payable availability, provider verification, deployment Git SHA or customer delivery.
 * No settlement, payment claim, usage reservation or signing material is used.
 */
import {createHash,randomUUID} from "node:crypto";

const origin=String(process.env.GEOMACRO_COMMERCE_LEDGER_URL??"").trim().replace(/\/$/u,"");
const token=String(process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").trim();
if(!/^https:\/\//u.test(origin)||token.length<32)
  throw Error("CAPABILITY_NO_FUNDS_WORKER_CONFIG_REQUIRED");
const digest=text=>createHash("sha256").update(text,"utf8").digest("hex");
const addr="0x"+"a".repeat(40);
const asset="0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
async function post(action,payload,{authorization=token}={}){
  const res=await fetch(origin+"/v1/delivery/"+action,{
    method:"POST",
    headers:{"content-type":"application/json",authorization:"Bearer "+authorization},
    body:JSON.stringify({provider:"coinbase_x402",providerEnvironment:"mainnet",...payload}),
    signal:AbortSignal.timeout(10000),redirect:"error",
  });
  return {status:res.status,body:await res.json().catch(()=>null)};
}
function requireOk(response,code){
  if(response.status!==200||response.body?.ok!==true)
    throw Error("CAPABILITY_NO_FUNDS_"+code+"_FAILED");
  return response.body;
}
const healthResponse=await fetch(origin+"/health",{
  signal:AbortSignal.timeout(10000),redirect:"error",
});
const health=await healthResponse.json().catch(()=>null);
if(!healthResponse.ok||health?.service!=="geomacro-commerce-ledger"||
   health?.storage!=="durable_objects_sqlite"||
   health?.capability_prequote_contract_version!=="geomacro.capability-prequote-worker.v1"||
   health?.capability_prequote_available!==true)
  throw Error("CAPABILITY_NO_FUNDS_DEPLOYED_WORKER_VERSION_UNVERIFIED");

const nonce=randomUUID();
const bytes=JSON.stringify({schema:"geomacro.capability-prequote-synthetic-no-funds.v1",nonce});
const issuedMs=Math.floor(Date.now()/300000)*300000;
const issued_at=new Date(issuedMs).toISOString();
const expires_at=new Date(issuedMs+300000).toISOString();
const requestFingerprint=digest("synthetic-request:"+nonce);
const answerHash=digest(bytes);
const terms=[
  "geomacro.capability-usdc.v2","gri_read","verified_cached","5000",
  requestFingerprint,"eip155:8453",asset,addr,"coinbase_x402",
  issued_at,expires_at,"VERIFIED_DELIVERABLE",answerHash,
];
const quote={
  version:"geomacro.capability-usdc.v2",
  capability:"gri_read",variant:"verified_cached",
  amount_usdc:"0.005",amount_atomic:"5000",currency:"USDC",
  output_contract:"GEOMACRO_DERIVED_STRUCTURED_ONLY",
  included_signed_object_charge:"NOT_APPLICABLE",
  quote_id:digest(JSON.stringify(terms)),
  issued_at,expires_at,quote_window_seconds:300,
  request_fingerprint_sha256:requestFingerprint,
  network:"eip155:8453",asset_contract:asset,recipient:addr,
  availability:"VERIFIED_DELIVERABLE",payment_rail:"coinbase_x402",
  prepared_answer_sha256:answerHash,execution_authorized:false,
};
const payload={quote,customerBytes:bytes};
const unauthorized=await post("capability-prequote-readback",
  {quoteId:quote.quote_id},{authorization:"not-the-worker-secret"});
if(unauthorized.status!==401)throw Error("CAPABILITY_NO_FUNDS_AUTH_BYPASS");

const first=requireOk(await post("capability-prequote-freeze",payload),"FREEZE");
if(first.disposition!=="FROZEN"||first.quote_id!==quote.quote_id||
   first.prepared_answer_sha256!==answerHash)
  throw Error("CAPABILITY_NO_FUNDS_FREEZE_RESULT_INVALID");

async function readback(){
  const read=requireOk(await post("capability-prequote-readback",
    {quoteId:quote.quote_id}),"READBACK");
  if(read.quote?.quote_id!==quote.quote_id||
     read.quote?.prepared_answer_sha256!==answerHash||
     read.quote?.amount_atomic!==quote.amount_atomic||
     read.customerBytes!==bytes || digest(read.customerBytes)!==answerHash||
     read.payment_authorized!==false||read.settlement_attempted!==false)
    throw Error("CAPABILITY_NO_FUNDS_BYTE_OR_SCOPE_READBACK_MISMATCH");
  return read.customerBytes;
}
const one=await readback();
const two=await readback();
if(one!==two)throw Error("CAPABILITY_NO_FUNDS_INDEPENDENT_READBACK_CONFLICT");

const replay=requireOk(await post("capability-prequote-freeze",payload),"REPLAY");
if(replay.disposition!=="EXACT_REPLAY")
  throw Error("CAPABILITY_NO_FUNDS_IDEMPOTENT_FREEZE_MISSING");
const altered=await post("capability-prequote-freeze",{
  ...payload,quote:{...quote,recipient:"0x"+"b".repeat(40)},
});
if(altered.status===200||altered.body?.ok===true)
  throw Error("CAPABILITY_NO_FUNDS_IMMUTABLE_TERMS_CONFLICT_ACCEPTED");
const tampered=await post("capability-prequote-freeze",{
  ...payload,customerBytes:bytes+"tampered",
});
if(tampered.status===200||tampered.body?.ok===true)
  throw Error("CAPABILITY_NO_FUNDS_CORRUPTED_BYTES_ACCEPTED");
const expired=await post("capability-prequote-freeze",{
  ...payload,quote:{...quote,quote_id:digest("expired:"+nonce),
    issued_at:"2020-01-01T00:00:00.000Z",expires_at:"2020-01-01T00:05:00.000Z"},
});
if(expired.status===200||expired.body?.ok===true)
  throw Error("CAPABILITY_NO_FUNDS_EXPIRED_QUOTE_ACCEPTED");
const wrongRail=await post("capability-prequote-freeze",{
  ...payload,quote:{...quote,payment_rail:"circle_gateway_x402"},
});
if(wrongRail.status===200||wrongRail.body?.ok===true)
  throw Error("CAPABILITY_NO_FUNDS_WRONG_RAIL_ACCEPTED");

// Verify Circle's independent provider/environment Durable Object namespace.
// Identical amount and source-free synthetic payload, but independently
// server-priced Circle rail terms and a different immutable quote identifier.
const circleQuote={
  ...quote,payment_rail:"circle_gateway_x402",
  quote_id:digest(JSON.stringify(terms.map((v,i)=>i===8?"circle_gateway_x402":v))),
};
const circlePayload={
  provider:"circle_gateway_x402",providerEnvironment:"production",
  quote:circleQuote,customerBytes:bytes,
};
const circleFreeze=requireOk(
  await post("capability-prequote-freeze",circlePayload),"CIRCLE_FREEZE");
if(circleFreeze.disposition!=="FROZEN"||
   circleFreeze.quote_id!==circleQuote.quote_id)
  throw Error("CAPABILITY_NO_FUNDS_CIRCLE_QUOTE_FREEZE_MISSING");
for(let i=0;i<2;i++){
  const result=requireOk(await post("capability-prequote-readback",{
    provider:"circle_gateway_x402",providerEnvironment:"production",
    quoteId:circleQuote.quote_id,
  }),"CIRCLE_READBACK");
  if(result.customerBytes!==bytes ||
     digest(result.customerBytes)!==answerHash||
     result.quote?.payment_rail!=="circle_gateway_x402"||
     result.quote?.quote_id!==circleQuote.quote_id||
     result.settlement_attempted!==false)
    throw Error("CAPABILITY_NO_FUNDS_CIRCLE_IMMUTABLE_READBACK_INVALID");
}
const circleWrongScope=await post("capability-prequote-readback",{
  provider:"coinbase_x402",providerEnvironment:"mainnet",
  quoteId:circleQuote.quote_id,
});
if(circleWrongScope.status===200&&circleWrongScope.body?.ok===true)
  throw Error("CAPABILITY_NO_FUNDS_CROSS_RAIL_PREQUOTE_VISIBLE");

// Circle Arc/Polygon native USDC prepared-quote admission is a synthetic
// NO-FUNDS storage proof only. No provider verification/settlement is invoked.
const extraCircleRails=[
  {network:"eip155:5042",asset:"0x3600000000000000000000000000000000000000"},
  {network:"eip155:137",asset:"0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"},
];
for(const rail of extraCircleRails){
  const immutableTerms=terms.map((value,index)=>
    index===5?rail.network:index===6?rail.asset:
    index===8?"circle_gateway_x402":value);
  const scopedQuote={
    ...quote,network:rail.network,asset_contract:rail.asset,
    payment_rail:"circle_gateway_x402",
    quote_id:digest(JSON.stringify(immutableTerms)),
  };
  const scopedPayload={
    provider:"circle_gateway_x402",providerEnvironment:"production",
    quote:scopedQuote,customerBytes:bytes,
  };
  const freeze=requireOk(await post("capability-prequote-freeze",scopedPayload),
    "CIRCLE_NATIVE_RAIL_FREEZE");
  if(freeze.disposition!=="FROZEN"||freeze.quote_id!==scopedQuote.quote_id)
    throw Error("CAPABILITY_CIRCLE_NATIVE_RAIL_FREEZE_INVALID");
  const replayResult=requireOk(await post("capability-prequote-freeze",scopedPayload),
    "CIRCLE_NATIVE_RAIL_REPLAY");
  if(replayResult.disposition!=="EXACT_REPLAY")
    throw Error("CAPABILITY_CIRCLE_NATIVE_RAIL_NOT_IDEMPOTENT");
  for(let attempt=0;attempt<2;attempt++){
    const result=requireOk(await post("capability-prequote-readback",{
      provider:"circle_gateway_x402",providerEnvironment:"production",
      quoteId:scopedQuote.quote_id,
    }),"CIRCLE_NATIVE_RAIL_READBACK");
    if(result.customerBytes!==bytes||digest(result.customerBytes)!==answerHash||
       result.quote?.network!==rail.network||
       result.quote?.asset_contract!==rail.asset||
       result.quote?.amount_atomic!==quote.amount_atomic||
       result.quote?.quote_id!==scopedQuote.quote_id||
       result.payment_authorized!==false||
       result.settlement_attempted!==false)
      throw Error("CAPABILITY_CIRCLE_NATIVE_RAIL_SCOPE_OR_BYTES_INVALID");
  }
  const crossed=await post("capability-prequote-readback",{
    provider:"coinbase_x402",providerEnvironment:"mainnet",
    quoteId:scopedQuote.quote_id,
  });
  if(crossed.status===200&&crossed.body?.ok===true)
    throw Error("CAPABILITY_CROSS_PROVIDER_NATIVE_RAIL_REPLAY");
  const wrongAsset=await post("capability-prequote-freeze",{
    ...scopedPayload,
    quote:{...scopedQuote,asset_contract:asset},
  });
  if(wrongAsset.status===200||wrongAsset.body?.ok===true)
    throw Error("CAPABILITY_CIRCLE_WRONG_NATIVE_ASSET_ACCEPTED");
  const wrongNetwork=await post("capability-prequote-freeze",{
    ...scopedPayload,
    quote:{...scopedQuote,network:"eip155:8453"},
  });
  if(wrongNetwork.status===200||wrongNetwork.body?.ok===true)
    throw Error("CAPABILITY_CIRCLE_WRONG_CHAIN_ACCEPTED");
}

console.log(JSON.stringify({
  schema:"geomacro.capability-prequote-synthetic-production-acceptance.v1",
  status:"SYNTHETIC_NO_FUNDS_CAPABILITY_DO_VERIFIED",
  version:health.capability_prequote_contract_version,
  authenticated:true,two_independent_readbacks:true,
  both_coinbase_circle_production_namespaces:true,cross_rail_scope_isolated:true,
  circle_native_base_arc_polygon_synthetic_prequotes_verified:true,
  all_three_merchant_settlements_verified:false,
  immutable_freeze:true,exact_replay:true,
  corrupt_bytes_rejected:true,terms_conflict_rejected:true,
  expired_quote_rejected:true,wrong_rail_rejected:true,
  genuine_source_rights_verified:false,registered_signature_verified:false,
  provider_payment_verified:false,provider_settlement_attempted:false,
  payable_customer_delivery_verified:false,
}));
