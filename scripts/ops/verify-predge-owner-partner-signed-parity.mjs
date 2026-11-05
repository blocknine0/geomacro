#!/usr/bin/env node
/**
 * Predge's ONE real signed /v1/pilot/check delivery acceptance.
 * Production-only protected run. Does not turn on commercial Risk Gate.
 *
 * The owner-only D1 read and the partner-facing read MUST expose the same
 * actual current cryptographically verifiable bytes. A previously signed
 * but expired partner replica is NOT an acceptable deliverable.
 *
 * The partner GET consumes ONE of the existing 100/day pilot check slots;
 * the owner's read does not. No news item, ID, private token or envelope
 * is logged or written to a public workflow artifact.
 */
import {createHmac} from "node:crypto";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {
 verifySignedPilotCheck,MAX_WIRE_BYTES,
} from "../../workers/control-plane/src/predge-pilot-news-context-v2.mjs";

export const PREDGE_PAIRED_SIGNED_ACCEPTANCE_SCHEMA=
 "geomacro.predge-owner-partner-signed-parity.v1";
const BASE="https://geomacro-control-plane.daspallab202391.workers.dev";
const HEX64=/^[a-f0-9]{64}$/;
const CATEGORIES=["geopolitics","macro","rare_earth"];
const fail=reason=>{throw Error("PREDGE_SIGNED_PAIR_"+reason)};
function validateToken(value){
 return typeof value==="string"&&HEX64.test(value);
}
async function readOne(url,token,fetchImpl){
 let response;
 try{
  response=await fetchImpl(url,{
   method:"GET",redirect:"error",cache:"no-store",
   headers:{authorization:"Bearer "+token,accept:"application/json"},
   signal:AbortSignal.timeout(20000),
  });
 }catch{fail("TRANSPORT_UNAVAILABLE")}
 if(response?.status!==200)
  fail("HTTP_"+String(response?.status??"UNKNOWN"));
 const length=Number(response.headers?.get?.("content-length")??0);
 if(!Number.isFinite(length)||length>MAX_WIRE_BYTES)
  fail("RESPONSE_OVERSIZE");
 let raw;
 try{raw=await response.text()}catch{fail("BODY_UNAVAILABLE")}
 if(Buffer.byteLength(raw,"utf8")>MAX_WIRE_BYTES)
  fail("RESPONSE_OVERSIZE");
 try{return JSON.parse(raw)}catch{fail("INVALID_JSON")}
}
function metadata(body){
 return {
  payload_hash:HEX64.test(body?.integrity?.payload_hash??"")?
   body.integrity.payload_hash:null,
  generated_at:typeof body?.generated_at==="string"?body.generated_at:null,
  expires_at:typeof body?.expires_at==="string"?body.expires_at:null,
 };
}
export async function verifyPredgeOwnerPartnerSignedParity({
 base=BASE,ownerToken,researchToken,
 fetchImpl=fetch,now=Date.now(),verify=verifySignedPilotCheck,
}={}){
 if(!/^https:\/\/[a-z0-9.-]+$/i.test(base)||base.includes("@")||
  !validateToken(ownerToken)||!validateToken(researchToken)||
  ownerToken===researchToken)
  fail("OWNER_AND_PARTNER_CREDENTIALS_REQUIRED");
 if(!Number.isSafeInteger(now)||now<0)fail("CLOCK_INVALID");
 const owner=await readOne(
  base+"/v1/internal/predge-pilot-news-context-publish",ownerToken,fetchImpl);
 try{await verify(owner,{now})}
 catch(e){fail(String(e?.message??"").includes("ENVELOPE_EXPIRED")?
  "OWNER_ENVELOPE_EXPIRED":"OWNER_SIGNED_ENVELOPE_UNVERIFIED")}
 const partner=await readOne(base+"/v1/pilot/check",researchToken,fetchImpl);
 try{await verify(partner,{now})}
 catch(e){fail(String(e?.message??"").includes("ENVELOPE_EXPIRED")?
  "PARTNER_ENVELOPE_EXPIRED":"PARTNER_SIGNED_ENVELOPE_UNVERIFIED")}
 const a=metadata(owner),b=metadata(partner);
 if(a.payload_hash!==b.payload_hash||
    a.generated_at!==b.generated_at||a.expires_at!==b.expires_at)
  fail("OWNER_PARTNER_HASH_OR_CLOCK_MISMATCH");
 if(owner.risk_gate?.decision!=="PAUSE"||
    partner.risk_gate?.decision!=="PAUSE"||
    owner.execution_authorized!==false||
    partner.execution_authorized!==false||
    owner.chargeable!==false||partner.chargeable!==false)
  fail("UNSAFE_ADVISORY_BOUNDARY");
 const counts=partner.risk_gate?.news_context?.delivered_counts;
 if(!counts||Object.keys(counts).sort().join(",")!==
  [...CATEGORIES].sort().join(",")||
  CATEGORIES.some(cat=>!Number.isSafeInteger(counts[cat])||
   counts[cat]<0||counts[cat]>50))
  fail("NEWS_CONTEXT_DELIVERY_COUNTS_INVALID");
 if(!partner.risk_gate?.news_context?.items_by_category||
    CATEGORIES.some(cat=>
     partner.risk_gate.news_context.items_by_category[cat]?.length!==counts[cat]))
  fail("NEWS_CONTEXT_COHORT_INVALID");
 return Object.freeze({
  schema:PREDGE_PAIRED_SIGNED_ACCEPTANCE_SCHEMA,
  ok:true,partner_http_status:200,owner_http_status:200,
  same_signed_envelope:true,
  ed25519_verified_for_both:true,
  payload_hash:a.payload_hash,generated_at:a.generated_at,
  expires_at:a.expires_at,delivered_counts:counts,
  item_count:Object.values(counts).reduce((a,b)=>a+b,0),
  partner_check_slots_consumed:1,
  research_only:true,execution_authorized:false,
  chargeable:false,paid_risk_gate_activated:false,
  source_content_logged:false,credentials_logged:false,
  full_envelope_logged:false,paired_external_predge_read_completed:false,
 });
}
function ownerTokenFromRoot(secret){
 if(typeof secret!=="string"||secret.length<20)
  fail("ROOT_AUTH_REQUIRED");
 return createHmac("sha256",secret)
  .update("geomacro-control-plane-v1").digest("hex");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const ownerToken=ownerTokenFromRoot(process.env.ROOT_LEDGER_TOKEN);
  const receipt=await verifyPredgeOwnerPartnerSignedParity({
   ownerToken,researchToken:process.env.PREDGE_RESEARCH_NEWS_TOKEN_OVERRIDE,
  });
  console.log(JSON.stringify(receipt));
 }catch(e){
  const code=String(e?.message??"").replace(/[^A-Z0-9_]/gi,"_").slice(0,125);
  console.error("::error::"+(code.startsWith("PREDGE_SIGNED_PAIR_")?
   code:"PREDGE_SIGNED_PAIR_UNCLASSIFIED"));
  process.exitCode=1;
 }
}
