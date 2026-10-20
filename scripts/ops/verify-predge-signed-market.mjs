#!/usr/bin/env node
// Independent, read-only Predge settlement-market verifier.
// No paid /estimate, wallet, API key, trade, payment, GRO, or Supabase calls.
// Public sample is checked against a code-pinned publisher Ed25519 key,
// current registry status, payload canonical bytes, market/context agreement,
// whole-envelope signature, and detached raw HTTP-body signature.
import {createHash,createPublicKey,verify as ed25519Verify} from "node:crypto";
import {fileURLToPath} from "node:url";

export const PREDGE_ATTESTATION_PUBLIC_KEY =
 "13fa3d18a369e6c71bf941563ba47822b30182273d5106a0e8fb61c5016352d9";
export const PREDGE_ATTESTATION_KID=PREDGE_ATTESTATION_PUBLIC_KEY.slice(0,16);
export const KEY_URL="https://api.predge.io/.well-known/predge-keys.json";
export const MARKET_URL="https://api.predge.io/v1/settlement-risk/5710779";
const BUDGET=128*1024;
const HEX32=/^[a-f0-9]{64}$/u;
const HEX64=/^[a-f0-9]{128}$/u;
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const fail=(code)=>{throw new Error("PREDGE_MARKET_VERIFY_"+code)};
const obj=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const equals=(a,b)=>canonicalPredge(a)===canonicalPredge(b);

export function canonicalPredge(v){
 if(v===null||typeof v==="string"||typeof v==="boolean"||typeof v==="number"){
   if(typeof v==="number"&&!Number.isFinite(v))fail("NONFINITE_NUMBER");
   return JSON.stringify(v);
 }
 if(Array.isArray(v))return "["+v.map(x=>x===undefined?"null":canonicalPredge(x)).join(",")+"]";
 if(!obj(v))fail("UNSUPPORTED_CANONICAL_VALUE");
 return "{"+Object.keys(v).filter(k=>v[k]!==undefined).sort()
   .map(k=>JSON.stringify(k)+":"+canonicalPredge(v[k])).join(",")+"}";
}
function keyFromRawHex(hex){
 if(!HEX32.test(hex??""))fail("INVALID_PUBLIC_KEY");
 const raw=Buffer.from(hex,"hex");
 const prefix=Buffer.from("302a300506032b6570032100","hex");
 return createPublicKey({key:Buffer.concat([prefix,raw]),format:"der",type:"spki"});
}
const signed=(hex,signature,bytes)=>{
 if(!HEX64.test(signature??""))fail("INVALID_SIGNATURE_FORMAT");
 return ed25519Verify(null,bytes,keyFromRawHex(hex),Buffer.from(signature,"hex"));
};
export function trustedPredgeKey(registry,hex,policy={pinnedKeys:[PREDGE_ATTESTATION_PUBLIC_KEY]}){
 if(!obj(registry)||!Array.isArray(registry.keys)||registry.keys.length>20||
    !HEX32.test(hex)||!policy.pinnedKeys.includes(hex))fail("UNTRUSTED_SIGNING_KEY");
 const match=registry.keys.filter(k=>k?.public_key===hex&&k?.kid===hex.slice(0,16));
 if(match.length!==1||match[0].algorithm!=="ed25519"||
    match[0].role!=="attestation"||match[0].active!==true||
    match[0].status!=="active")fail("KEY_NOT_ACTIVE");
 return match[0];
}
const parseHeader=(value)=>{
 const m=/^kid=([0-9a-f]{16});\s*alg=ed25519;\s*sig=([0-9a-f]{128})$/u.exec(value??"");
 if(!m)fail("INVALID_BODY_SIGNATURE_HEADER");
 return {kid:m[1],signature:m[2]};
};
export function verifyPredgeMarket(doc,rawBody,headers,registry,
 policy={pinnedKeys:[PREDGE_ATTESTATION_PUBLIC_KEY]}){
 if(!obj(doc)||!obj(doc.attestation)||!obj(doc.context)||!obj(doc.market)||
    !Buffer.isBuffer(rawBody)||rawBody.length<100||rawBody.length>BUDGET)
   fail("INVALID_RECORD");
 const att=doc.attestation;
 if(att.algorithm!=="ed25519"||att.issuer!=="predge.io"||
    !obj(att.payload)||typeof att.canonical!=="string"||
    !HEX32.test(att.public_key??"")||att.kid!==att.public_key.slice(0,16))
   fail("INVALID_ATTESTATION");
 const key=trustedPredgeKey(registry,att.public_key,policy);
 if(!equals(JSON.parse(att.canonical),att.payload)||
    canonicalPredge(att.payload)!==att.canonical)fail("PAYLOAD_BYTES_MISMATCH");
 const contentHash=sha(Buffer.from(att.canonical,"utf8"));
 if(att.content_hash!==contentHash)fail("CONTENT_HASH_MISMATCH");
 if(!signed(key.public_key,att.signature,Buffer.from(att.canonical,"utf8")))
   fail("PAYLOAD_SIGNATURE_INVALID");
 if(typeof att.envelope_signature!=="string")fail("MISSING_ENVELOPE_SIGNATURE");
 const envelope={...att};
 delete envelope.envelope_signature;
 if(!signed(key.public_key,att.envelope_signature,Buffer.from(canonicalPredge(envelope),"utf8")))
   fail("ENVELOPE_SIGNATURE_INVALID");
 const p=att.payload;
 if(p.payload_version!=="3"||p.market_id!==doc.market.market_id||
    p.condition_id!==doc.market.condition_id||
    !equals(p.market,doc.market)||
    p.context_sha256!==sha(Buffer.from(canonicalPredge(doc.context),"utf8")))
   fail("MARKET_OR_CONTEXT_MISMATCH");
 // Every signed market status/payload identity that is surfaced externally
 // must agree. Unsigned envelope decorations cannot override signed bytes.
 for(const field of ["uma_state","resolved_on_chain","paused",
  "open_dispute","sent_to_uma_vote","current_proposal","adapter",
  "oracle","risk_level","recommendation","data_basis"]){
    if(Object.hasOwn(doc,field)&&Object.hasOwn(p,field)&&!equals(doc[field],p[field]))
      fail("UNSIGNED_FIELD_MISMATCH");
 }
 if(String(doc.dispute_count)!==p.dispute_count||
    !equals(p.block,doc.block)||
    !Array.isArray(doc.disputes)||!equals(p.disputes,doc.disputes))
   fail("DISPUTE_OR_BLOCK_MISMATCH");
 const expectedSha=sha(rawBody);
 if(headers?.get("x-predge-body-sha256")!==expectedSha)
   fail("BODY_DIGEST_MISMATCH");
 const bodyHeader=parseHeader(headers.get("x-predge-body-signature"));
 if(bodyHeader.kid!==key.kid)fail("BODY_KID_MISMATCH");
 const message=Buffer.concat([Buffer.from("predge-body-v1\n","utf8"),rawBody]);
 if(!signed(key.public_key,bodyHeader.signature,message))
   fail("BODY_SIGNATURE_INVALID");
 return Object.freeze({
  ok:true,schema:"geomacro.predge-market-independent-verification.v1",
  issuer:"predge.io",attestation_kid:key.kid,
  market_id:doc.market.market_id,
  payload_version:p.payload_version,
  sha256_canonical_payload:contentHash,
  context_sha256:p.context_sha256,
  sha256_exact_body:expectedSha,
  verified_canonical_signature:true,
  verified_envelope_signature:true,
  verified_detached_body_signature:true,
  active_pinned_public_key:true,
  uma_vote_recorded:doc.sent_to_uma_vote===true,
  research_only:true,
  commercial_redistribution_authorized:false,
  gro_produced:false,risk_gate_execution_authorized:false,
  payments:0,supabase_writes:0
 });
}
async function fetchBounded(url,max=BUDGET){
 const r=await fetch(url,{method:"GET",redirect:"manual",cache:"no-store",
  headers:{accept:"application/json"},
  signal:AbortSignal.timeout(18000)});
 if(r.status!==200)fail("UPSTREAM_HTTP_"+r.status);
 if(r.url!==url||r.status>=300&&r.status<400)fail("UPSTREAM_REDIRECT");
 const reader=r.body?.getReader();if(!reader)fail("BODY_MISSING");
 let size=0;const chunks=[];
 for(;;){
  const part=await reader.read();if(part.done)break;
  size+=part.value.byteLength;
  if(size>max){await reader.cancel();fail("BODY_TOO_LARGE")}
  chunks.push(Buffer.from(part.value));
 }
 const bytes=Buffer.concat(chunks);
 let json;try{json=JSON.parse(bytes.toString("utf8"))}catch{fail("UPSTREAM_JSON_INVALID")}
 return {bytes,json,headers:r.headers};
}
export async function verifyPredgeSampleOnline(){
 const keys=await fetchBounded(KEY_URL,32*1024);
 const record=await fetchBounded(MARKET_URL);
 return verifyPredgeMarket(record.json,record.bytes,record.headers,keys.json);
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 verifyPredgeSampleOnline().then(x=>console.log(JSON.stringify(x))).catch(e=>{
  // No API response, token, market body or external error object in logs.
  const s=String(e?.message??"");
  console.error(/^PREDGE_MARKET_VERIFY_[A-Z0-9_]+$/u.test(s)?s:"PREDGE_MARKET_VERIFY_FETCH_UNAVAILABLE");
  process.exitCode=1;
 });
}
