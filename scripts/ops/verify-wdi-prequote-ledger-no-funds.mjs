#!/usr/bin/env node
/**
 * Production Durable Object acceptance for WDI-only prequote primitives.
 * STRICTLY SYNTHETIC canary: NOT a real WDI rights/signature certification,
 * quote, payment claim, Coinbase verification or settlement.
 * Separate acceptance:prelaunch DO scope. No raw bytes or secrets in logs.
 */
import {createHash, randomUUID} from "node:crypto";
const base=String(process.env.GEOMACRO_COMMERCE_LEDGER_URL??"").trim().replace(/\/$/u,"");
const token=String(process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").trim();
if(!/^https:\/\//u.test(base)||token.length<32)
  throw Error("WDI_VAULT_ACCEPTANCE_CREDENTIALS_REQUIRED");
const digest=v=>createHash("sha256").update(v,"utf8").digest("hex");
async function post(action,body,{authorization=token}={}){
  const res=await fetch(base+"/v1/delivery/"+action,{
    method:"POST",headers:{"content-type":"application/json",
      authorization:"Bearer "+authorization},
    body:JSON.stringify({provider:"acceptance",providerEnvironment:"prelaunch",...body}),
    redirect:"error",signal:AbortSignal.timeout(10000),
  });
  const data=await res.json().catch(()=>null);
  return {status:res.status,data};
}
const healthRes=await fetch(base+"/health",{redirect:"error",signal:AbortSignal.timeout(10000)});
const health=await healthRes.json().catch(()=>null);
if(!healthRes.ok||health?.service!=="geomacro-commerce-ledger"||
   health?.storage!=="durable_objects_sqlite"||
   health?.wdi_prequote_contract_version!=="geomacro.wdi-prequote-worker.v1"||
   health?.wdi_prequote_available!==true ||
   !["delivery","usage_guard","product_audit"]
     .every(s=>health?.capabilities?.includes(s)))
  throw Error("WDI_VAULT_PRODUCTION_DEPLOYMENT_VERSION_UNVERIFIED");
const check=async(action,body)=>{
  const out=await post(action,body);
  if(out.status!==200 || out.data?.ok!==true)
    throw Error("WDI_VAULT_"+action.toUpperCase()+"_HTTP_"+out.status);
  return out.data;
};
const seed=randomUUID();
const originalBytes=JSON.stringify({synthetic_test_only:true,
  schema:"geomacro.wdi-prequote-synthetic-no-funds.v1",nonce:seed});
const rightsAt=new Date(Date.now()-60_000).toISOString();
const obj={
  bindingHash:digest("synthetic-binding:"+seed),
  queryHash:digest("synthetic-query:"+seed),
  rightsHash:digest("synthetic-rights:"+seed),
  receiptHash:digest("synthetic-receipt:"+seed),
  answerHash:digest(originalBytes),
  termsHash:digest("synthetic-price:payee:network:asset:"+seed),
  rightsGeneratedAt:rightsAt,customerBytes:originalBytes,
};
const invalidToken=await post("wdi-prequote-readback",
  {bindingHash:obj.bindingHash},{authorization:"invalid-no-funds-canary"});
if(invalidToken.status!==401)
  throw Error("WDI_VAULT_AUTH_REQUIRED");
const first=await check("wdi-prequote-freeze",obj);
if(first.disposition!=="FROZEN"||first.binding_hash!==obj.bindingHash||
   first.answer_sha256!==obj.answerHash)
  throw Error("WDI_VAULT_FREEZE_ACK_INCONSISTENT");
const verify=async()=>{
  const x=await check("wdi-prequote-readback",{bindingHash:obj.bindingHash});
  for(const [key,value] of Object.entries(obj)){
    if(x[key]!==value)throw Error("WDI_VAULT_READBACK_FIELD_"+key);
  }
  if(x.payment_authorized!==false||x.settlement_attempted!==false||
     digest(x.customerBytes)!==obj.answerHash)
    throw Error("WDI_VAULT_READBACK_INVALID");
  return x;
};
const read1=await verify();
const read2=await verify();
if(read1.customerBytes!==read2.customerBytes)
  throw Error("WDI_VAULT_REPLAY_BYTES_DIFFER");
const replay=await check("wdi-prequote-freeze",obj);
if(replay.disposition!=="EXACT_REPLAY"||
   replay.answer_sha256!==first.answer_sha256)
  throw Error("WDI_VAULT_IMMUTABLE_REPLAY_FAILED");
const changed=await post("wdi-prequote-freeze",{
  ...obj,termsHash:digest("tampered-payee"),
});
if(changed.status===200||changed.data?.ok===true)
  throw Error("WDI_VAULT_PAYMENT_TERMS_MUTATION_ACCEPTED");
const changedBytes=await post("wdi-prequote-freeze",{
  ...obj,customerBytes:originalBytes+"X",
});
if(changedBytes.status===200||changedBytes.data?.ok===true)
  throw Error("WDI_VAULT_CORRUPTED_BYTES_ACCEPTED");
const expired=await post("wdi-prequote-freeze",{
  ...obj,bindingHash:digest("expired:"+seed),
  rightsGeneratedAt:"2020-01-01T00:00:00.000Z",
});
if(expired.status===200||expired.data?.ok===true)
  throw Error("WDI_VAULT_EXPIRED_RIGHTS_ACCEPTED");
console.log(JSON.stringify({
  schema:"geomacro.wdi-vault-production-synthetic-acceptance.v1",
  status:"SYNTHETIC_NO_FUNDS_VAULT_VERIFIED",
  worker_contract_version:health.wdi_prequote_contract_version,
  authenticated:true,original_delivery_usage_audit_capabilities_present:true,
  immutable_freeze:true,two_independent_readbacks:true,exact_replay:true,
  altered_payment_terms_rejected:true,altered_bytes_rejected:true,
  expired_synthetic_receipt_rejected:true,
  genuine_wdi_signature_verified:false,genuine_wdi_rights_read_in_this_job:false,
  quote_authorized:false,payment_authorized:false,settlement_attempted:false,
  production_customer_delivery_proven:false,
}));
