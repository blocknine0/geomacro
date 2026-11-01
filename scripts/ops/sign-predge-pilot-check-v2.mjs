#!/usr/bin/env node
/**
 * Run only on a protected owner machine/job with trusted production signing
 * material. Outputs a 0600 file, never the token, private key, news payload,
 * or signed envelope to stdout. No fund movement, GRO creation or paid data.
 *
 * Usage: node scripts/ops/sign-predge-pilot-check-v2.mjs /private/sample.json
 */
import {createPrivateKey,createPublicKey,sign as signBytes} from "node:crypto";
import {writeFileSync} from "node:fs";
import {buildUnsignedPilotCheck,signablePilotCheck,toBytes,sha256,
  PINNED_PUBLIC_SPKI,MAX_WIRE_BYTES,verifySignedPilotCheck}
  from "../../workers/control-plane/src/predge-pilot-news-context-v2.mjs";
const BASE="https://geomacro-control-plane.daspallab202391.workers.dev";
async function main(){
  const path=process.argv[2];
  if(process.argv.length!==3||typeof path!=="string"||!path.endsWith(".json"))
    throw Error("SAFE_OUTPUT_PATH_REQUIRED");
  const token=process.env.PREDGE_RESEARCH_NEWS_TOKEN_OVERRIDE;
  const keyString=process.env.RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64;
  if(!/^[a-f0-9]{64}$/.test(token??""))throw Error("PROTECTED_RESEARCH_TOKEN_MISSING");
  if(!keyString)throw Error("PROTECTED_PRODUCTION_SIGNER_MISSING");
  const key=createPrivateKey({key:Buffer.from(keyString,"base64"),format:"der",type:"pkcs8"});
  const derived=createPublicKey(key).export({format:"der",type:"spki"}).toString("base64");
  if(derived!==PINNED_PUBLIC_SPKI)throw Error("SIGNER_NOT_PINNED_ACTIVE_PRODUCTION_KEY");
  const r=await fetch(BASE+"/v1/partner/predge/derived-structural-72h",{
    headers:{authorization:"Bearer "+token,accept:"application/json"},
    redirect:"error",signal:AbortSignal.timeout(20000),cache:"no-store"});
  if(r.status!==200)throw Error("AUTHENTICATED_RESEARCH_FEED_UNAVAILABLE_"+r.status);
  if(Number(r.headers.get("content-length")??0)>4_000_000)throw Error("FEED_OVERSIZE");
  const content=await r.text();
  if(Buffer.byteLength(content,"utf8")>4_000_000)throw Error("FEED_OVERSIZE");
  const feed=JSON.parse(content);
  const now=Date.now();
  const envelope=buildUnsignedPilotCheck(feed,now);
  const bytes=toBytes(signablePilotCheck(envelope));
  envelope.integrity.payload_hash=await sha256(bytes);
  envelope.integrity.signature=signBytes(null,Buffer.from(bytes),key).toString("base64");
  await verifySignedPilotCheck(envelope,{now,registry:JSON.stringify({
    "geomacro-risk-2026-03":{status:"active",public_key_spki_b64:PINNED_PUBLIC_SPKI}
  })});
  const json=JSON.stringify(envelope);
  if(Buffer.byteLength(json,"utf8")>MAX_WIRE_BYTES)throw Error("SIGNED_SAMPLE_OVERSIZE");
  writeFileSync(path,json,{encoding:"utf8",flag:"wx",mode:0o600});
  console.log(JSON.stringify({ok:true,schema:envelope.schema,
    news_context_schema:envelope.risk_gate.news_context.schema,
    payload_hash:envelope.integrity.payload_hash,
    delivered_counts:envelope.risk_gate.news_context.delivered_counts,
    expires_at:envelope.expires_at,execution_authorized:false,
    output_file_written:true,private_content_logged:false}));
}
main().catch(e=>{console.error("PREDGE_PILOT_SIGN_FAILURE_"+String(e.message).replace(/[^A-Z0-9_]/gi,"_").slice(0,100));
  process.exitCode=1;});
