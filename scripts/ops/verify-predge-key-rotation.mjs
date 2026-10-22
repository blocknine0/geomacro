#!/usr/bin/env node
// Public, no-funds, fail-closed Predge key-only rotation verifier.
import {fileURLToPath} from "node:url";
import {PREDGE_ATTESTATION_PUBLIC_KEY,KEY_URL,MARKET_URL,
  trustedPredgeKey,verifyPredgeMarket} from "./verify-predge-signed-market.mjs";

const REVOKED="13fa3d18a369e6c71bf941563ba47822b30182273d5106a0e8fb61c5016352d9";
const fail=code=>{throw Error("PREDGE_ROTATION_"+code)};

export function verifyPredgeRotationRegistry(registry){
  if(!/^[a-f0-9]{64}$/.test(PREDGE_ATTESTATION_PUBLIC_KEY)||
      PREDGE_ATTESTATION_PUBLIC_KEY===REVOKED)fail("INVALID_OR_REVOKED_PIN");
  const trusted=trustedPredgeKey(registry,PREDGE_ATTESTATION_PUBLIC_KEY);
  const old=registry.keys.filter(k=>k?.public_key===REVOKED);
  if(old.length>1||old.some(k=>k.active!==false||!["retired","revoked"].includes(k.status)))
    fail("COMPROMISED_KEY_STILL_TRUSTED");
  return Object.freeze({kid:trusted.kid,known_compromised_key_trusted:false});
}

async function publicGet(url,max){
  const r=await fetch(url,{method:"GET",redirect:"manual",cache:"no-store",
    headers:{accept:"application/json"},signal:AbortSignal.timeout(18000)});
  if(r.status!==200||r.url!==url)fail("HTTP_NOT_200");
  const reader=r.body?.getReader();
  if(!reader)fail("MISSING_BODY");
  const chunks=[];let size=0;
  try{
    for(;;){
      const p=await reader.read();if(p.done)break;
      size+=p.value.byteLength;if(size>max)fail("BODY_TOO_LARGE");
      chunks.push(Buffer.from(p.value));
    }
  }finally{reader.releaseLock()}
  const raw=Buffer.concat(chunks);
  let data;
  try{data=JSON.parse(raw.toString("utf8"))}catch{fail("INVALID_JSON")}
  return {data,raw,headers:r.headers};
}

export async function verifyPredgeRotationOnline(){
  const keys=await publicGet(KEY_URL,32768);
  const {kid}=verifyPredgeRotationRegistry(keys.data);
  const market=await publicGet(MARKET_URL,131072);
  if(market.data?.attestation?.public_key!==PREDGE_ATTESTATION_PUBLIC_KEY||
     market.data?.attestation?.kid!==kid)
    fail("NEW_KEY_SIGNED_MARKET_NOT_AVAILABLE");
  const v=verifyPredgeMarket(market.data,market.raw,market.headers,keys.data);
  if(!v.ok||v.attestation_kid!==kid||!v.verified_canonical_signature||
     !v.verified_envelope_signature||!v.verified_detached_body_signature)
    fail("MARKET_SIGNATURE_INCOMPLETE");
  return Object.freeze({
    status:"CURRENT_PIN_AND_ALL_SIGNATURES_VERIFIED",attestation_kid:kid,
    market_id:v.market_id,known_compromised_key_trusted:false,
    verified_canonical_signature:true,verified_envelope_signature:true,
    verified_detached_body_signature:true,research_only:true,
    gro_produced:false,commercial_redistribution_authorized:false,
    execution_authorized:false,payments:0,supabase_writes:0
  });
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  verifyPredgeRotationOnline().then(x=>console.log(JSON.stringify(x))).catch(e=>{
    const reason=String(e?.message??"");
    console.error(/^PREDGE_(?:ROTATION|MARKET_VERIFY)_[A-Z0-9_]+$/.test(reason)?
      reason:"PREDGE_ROTATION_UPSTREAM_UNAVAILABLE");
    process.exitCode=1;
  });
}
