import test from "node:test";
import assert from "node:assert/strict";
import {createHash,generateKeyPairSync,sign} from "node:crypto";
import {canonicalPredge,trustedPredgeKey,verifyPredgeMarket,
 PREDGE_ATTESTATION_PUBLIC_KEY} from "./verify-predge-signed-market.mjs";
const sha=b=>createHash("sha256").update(b).digest("hex");
function fixture(){
 const {privateKey,publicKey}=generateKeyPairSync("ed25519");
 const pub=publicKey.export({format:"der",type:"spki"}).subarray(-32).toString("hex");
 const kid=pub.slice(0,16);
 const signature=b=>sign(null,Buffer.from(b),privateKey).toString("hex");
 const market={market_id:"5710779",condition_id:"0x"+"a".repeat(64),
  question:"Élection and emoji 🗳️?",gamma_end_date:"2026-10-20T00:00:00Z",
  gamma_dates_raw:{}};
 const context={disputes:2,note:"A\nB / 🗳️"};
 const block={number:"777",hash:"0x"+"a".repeat(64),timestamp:"2026-10-20T10:00:00Z"};
 const payload={issuer:"predge.io",version:"predge-attest-v1",payload_version:"3",
  kind:"settlement-risk",market_id:market.market_id,condition_id:market.condition_id,
  market,context_sha256:sha(Buffer.from(canonicalPredge(context))),block,
  disputes:[],dispute_count:"2",uma_state:"resolved",resolved_on_chain:true,
  sent_to_uma_vote:true};
 const canonical=canonicalPredge(payload);
 const att={issuer:"predge.io",version:"predge-attest-v1",algorithm:"ed25519",
  kind:"settlement-risk",data_basis:"onchain",
  public_key:pub,canonical,signature:signature(canonical),payload,
  kid,content_hash:sha(Buffer.from(canonical))};
 att.envelope_signature=signature(canonicalPredge(att));
 const doc={market,context,block,disputes:[],dispute_count:2,
  uma_state:"resolved",resolved_on_chain:true,sent_to_uma_vote:true,
  attestation:att};
 const raw=Buffer.from(JSON.stringify(doc),"utf8");
 const headers=new Headers({
  "x-predge-body-sha256":sha(raw),
  "x-predge-body-signature":"kid="+kid+"; alg=ed25519; sig="+signature(Buffer.concat([Buffer.from("predge-body-v1\n"),raw]))
 });
 const registry={keys:[{kid,public_key:pub,algorithm:"ed25519",role:"attestation",active:true,status:"active"}]};
 return {doc,raw,headers,registry,pub,kid};
}
const accepts=f=>verifyPredgeMarket(f.doc,f.raw,f.headers,f.registry,{pinnedKeys:[f.pub]});
test("canonical bytes use ECMAScript sorted keys, preserve Unicode and never escape slashes",()=>{
 assert.equal(canonicalPredge({z:1,a:"CJK中文/😊",b:[true,null]}),
 '{"a":"CJK中文/😊","b":[true,null],"z":1}');
});
test("synthetic independently signed market succeeds only with all three signatures and context hash",()=>{
 const f=fixture(),v=accepts(f);
 assert.equal(v.ok,true);
 assert.equal(v.verified_canonical_signature,true);
 assert.equal(v.verified_envelope_signature,true);
 assert.equal(v.verified_detached_body_signature,true);
 assert.equal(v.uma_vote_recorded,true);
 assert.equal(v.commercial_redistribution_authorized,false);
 assert.equal(v.risk_gate_execution_authorized,false);
});
test("retired/revoked or unknown third-party signer is rejected before binding a market",()=>{
 const f=fixture();
 for(const status of ["retired","revoked"]){
  f.registry.keys[0].status=status;f.registry.keys[0].active=false;
  assert.throws(()=>accepts(f),/KEY_NOT_ACTIVE/);
 }
 f.registry.keys[0].status="active";f.registry.keys[0].active=true;
 assert.throws(()=>verifyPredgeMarket(f.doc,f.raw,f.headers,f.registry),/UNTRUSTED_SIGNING_KEY/);
 assert.equal(PREDGE_ATTESTATION_PUBLIC_KEY.length,64);
});
test("malicious context, market, signature and envelope swaps fail closed",()=>{
 const f=fixture();
 f.doc.context.note="TAMPERED";
 assert.throws(()=>accepts(f),/MARKET_OR_CONTEXT_MISMATCH/);
 f.doc.context.note="A\nB / 🗳️";
 f.doc.market={...f.doc.market,question:"TAMPERED"};
 assert.throws(()=>accepts(f),/MARKET_OR_CONTEXT_MISMATCH/);
 f.doc.market=f.doc.attestation.payload.market;
 const was=f.doc.attestation.signature;
 f.doc.attestation.signature="0".repeat(128);
 assert.throws(()=>accepts(f),/PAYLOAD_SIGNATURE_INVALID/);
 f.doc.attestation.signature=was;
 f.doc.attestation.envelope_signature="0".repeat(128);
 assert.throws(()=>accepts(f),/ENVELOPE_SIGNATURE_INVALID/);
});
test("exact detached body hash and Ed25519 context prefix required",()=>{
 const f=fixture();
 const b=Buffer.from(JSON.stringify(f.doc)+" ");
 assert.throws(()=>verifyPredgeMarket(f.doc,b,f.headers,f.registry,{pinnedKeys:[f.pub]}),/BODY_DIGEST_MISMATCH/);
 f.headers.set("x-predge-body-sha256","0".repeat(64));
 assert.throws(()=>accepts(f),/BODY_DIGEST_MISMATCH/);
 f.headers.set("x-predge-body-sha256",sha(f.raw));
 f.headers.set("x-predge-body-signature","kid="+f.kid+"; alg=ed25519; sig="+"0".repeat(128));
 assert.throws(()=>accepts(f),/BODY_SIGNATURE_INVALID/);
});
test("unauthenticated or external source cannot silently allow revoked rotation",()=>{
 const f=fixture();
 assert.throws(()=>trustedPredgeKey(f.registry,f.pub),/UNTRUSTED_SIGNING_KEY/);
 f.registry.keys[0].role="cachet-oracle";
 assert.throws(()=>accepts(f),/KEY_NOT_ACTIVE/);
});
