/**
 * Exact deployment no-funds acceptance: one real authenticated risk decision,
 * decision Ed25519 cryptographic readback, tier matrix and idempotent replay.
 * Emits ONLY stable booleans and symbolic errors; never response body or bearer.
 */
import {readFileSync} from "node:fs";
import {createHash,createPublicKey,verify} from "node:crypto";
const root=String(process.env.DEPLOYMENT_URL??"").replace(/\/+$/,"");
const token=String(process.env.PREDGE_RISK_GATE_TOKEN??"");
if(!/^https:\/\/[a-z0-9.-]+\.workers\.dev$/i.test(root)||
   !/^[a-f0-9]{64}$/.test(token))
  throw Error("PROGRESSIVE_SMOKE_PROTECTED_CONFIG_UNAVAILABLE");
const req=JSON.parse(readFileSync("docs/partners/predge/risk-gate-request.json","utf8"));
req.request_id="progressive-no-funds-"+String(process.env.GITHUB_SHA??"").slice(0,40);
delete req.evaluated_at;
const payload=JSON.stringify(req);
const call=async()=>{
 const response=await fetch(root+"/v1/partner/predge/risk-gate",{
   method:"POST",headers:{"Authorization":"Bearer "+token,
      "Content-Type":"application/json"},body:payload,redirect:"manual",
   signal:AbortSignal.timeout(15000)
 });
 if(response.status!==200)throw Error("PROGRESSIVE_LIVE_HTTP_"+response.status);
 return response.json();
};
const keyResp=await fetch(root+"/v1/public/risk-gate-decision-key",{
  redirect:"manual",signal:AbortSignal.timeout(7000)});
if(keyResp.status!==200)throw Error("PROGRESSIVE_LIVE_KEY_HTTP_"+keyResp.status);
const keyBody=await keyResp.json();
if(keyBody?.ok!==true||keyBody.scheme!=="Ed25519"||
  typeof keyBody.public_key_spki_b64!=="string"||
  keyBody.key_id!==process.env.RISK_GATE_DECISION_ED25519_KEY_ID)
  throw Error("PROGRESSIVE_LIVE_KEY_MISMATCH");
const pub=createPublicKey({key:Buffer.from(keyBody.public_key_spki_b64,"base64"),
  format:"der",type:"spki"});
if(pub.asymmetricKeyType!=="ed25519")throw Error("PROGRESSIVE_LIVE_KEY_TYPE_INVALID");
const canonical=v=>v===null||typeof v!=="object"?JSON.stringify(v):
 Array.isArray(v)?"["+v.map(canonical).join(",")+"]":
 "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canonical(v[k])).join(",")+"}";
function accepted(out){
 if(out.ok!==true||out.execution_authorized!==false||
   out.context?.payment_authorized!==false||
   out.risk_gate?.execution_authorized!==false||
   !Number.isFinite(out.risk_gate?.risk?.score)||
   out.risk_gate.risk.score<0||out.risk_gate.risk.score>100||
   !["BASIC_0_10","STANDARD_0_15","COMPLEX_0_25"].includes(out.tier)||
   out.tier_activation_matrix?.basic?.status!=="ACTIVE"||
   out.decision_signature_scheme!=="Ed25519"||
   out.decision_signature_key_id!==keyBody.key_id)
   throw Error("PROGRESSIVE_LIVE_DECISION_CONTRACT_INVALID");
 const signed=out.decision_signed_payload;
 if(signed?.execution_authorized!==false||signed.tier!==out.tier||
   canonical(signed.risk_gate)!==canonical(out.risk_gate)||
   canonical(signed.tier_activation_matrix)!==canonical(out.tier_activation_matrix))
   throw Error("PROGRESSIVE_LIVE_SIGNATURE_SCOPE_INVALID");
 const bytes=Buffer.from(canonical(signed),"utf8");
 if(createHash("sha256").update(bytes).digest("hex")!==out.decision_payload_sha256||
   !verify(null,bytes,pub,Buffer.from(out.decision_signature_b64,"base64")))
   throw Error("PROGRESSIVE_LIVE_ED25519_INVALID");
 return out;
}
const first=accepted(await call());
const replay=accepted(await call());
if(replay.idempotent_replay!==true||
  first.decision_payload_sha256!==replay.decision_payload_sha256||
  first.decision_signature_b64!==replay.decision_signature_b64)
  throw Error("PROGRESSIVE_LIVE_REPLAY_NOT_IDENTICAL");
console.log(JSON.stringify({schema:"geomacro.progressive-risk-gate-live-acceptance.v1",
 ok:true,no_funds:true,source_sha:String(process.env.GITHUB_SHA??"").slice(0,40),
 tier:first.tier,basic_active:true,
 standard_active:first.tier_activation_matrix.standard.active,
 complex_active:first.tier_activation_matrix.complex.active,
 ed25519_verified:true,idempotency_verified:true,
 score_nonnull:true,execution_authorized:false,
 payment_authorized:false}));
