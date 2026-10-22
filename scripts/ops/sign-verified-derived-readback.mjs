#!/usr/bin/env node
// Protected cloud runtime, DERIVED-ONLY. No human private keys and no B2/D1 writes.
import {readFileSync,writeFileSync,statSync} from "node:fs";
import {createPublicKey,createHash} from "node:crypto";
import {validateDelegation,signMachineReceipt,ENABLE} from
 "../lib/standing-derived-delegation.mjs";
import {sanitizeCloudSigningFailure} from "../lib/standing-delegated-cloud-safe-reasons.mjs";
let phase="ENTRYPOINT";
const fail=()=>{throw Error("DELEGATED_DERIVED_CLOUD_SIGNING_NOT_READY");};
const hex=/^[a-f0-9]{64}$/u;
async function main(env=process.env){
 if(process.argv.length!==3||process.argv[2]!=="--sign-verified-derived"||
  env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
  env.GITHUB_REF!=="refs/heads/main"||
  !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??"")||
  env.GEOMACRO_STANDING_DELEGATION_ENABLED!==ENABLE)fail();
 phase="ENVIRONMENT_GATES";
 for(const k of ["COINBASE_X402_MAINNET_ACK","GEOMACRO_COMMERCIAL_LAUNCH_ACK",
  "COINBASE_API_KEY","SUPABASE_DB_URL","SUPABASE_SERVICE_ROLE_KEY"]){
  if(env[k])fail();
 }
 const base64=env.GEOMACRO_STANDING_DELEGATION_ENVELOPE_B64??"";
 if(base64.length>24000||base64.length<200||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))fail();
 const decoded=Buffer.from(base64,"base64");
 if(decoded.length>16000||decoded.length<150)fail();
 phase="POLICY_ENVELOPE";
 const envelope=JSON.parse(decoded.toString("utf8"));
 let groPin;
 try{
  const key=createPublicKey({key:Buffer.from(env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64??"","base64"),
   format:"der",type:"spki"});
  if(key.asymmetricKeyType!=="ed25519")fail();
  groPin=createHash("sha256").update(key.export({format:"der",type:"spki"})).digest("hex");
 }catch{fail();}
 phase="PRODUCTION_AUTHORITY_PINS";
 const other=[env.GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_SHA256,
  env.GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_SHA256,groPin];
 if(other.some(x=>!hex.test(x??"")))fail();
 const delegation=validateDelegation(envelope,{
  ownerPem:env.GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_PEM,
  ownerPin:env.GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_SHA256,
  reviewerPem:env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM,
  reviewerPin:env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256,
  machinePem:env.GEOMACRO_DELEGATED_MACHINE_PUBLIC_KEY_PEM,
  machinePin:env.GEOMACRO_DELEGATED_MACHINE_PUBLIC_KEY_SHA256,
  otherAuthorityPins:other,
  enabled:env.GEOMACRO_STANDING_DELEGATION_ENABLED,
  revoked:env.GEOMACRO_STANDING_DELEGATION_REVOKED
 });
 const path=env.GEOMACRO_VERIFIED_DERIVED_RECEIPT_PATH;
 const out=env.GEOMACRO_DELEGATED_RECEIPT_OUTPUT_PATH;
 if(typeof path!=="string"||typeof out!=="string"||
    path===out||!path.startsWith("/runner/")&&!path.startsWith("/home/runner/")||
    !out.startsWith("/runner/")&&!out.startsWith("/home/runner/")||
    statSync(path).size>6000)fail();
 phase="VERIFIED_NEWS_INPUT";
 const receipt=JSON.parse(readFileSync(path,"utf8"));
 phase="DEDICATED_MACHINE_SIGNATURE";
 const signed=signMachineReceipt({receipt,delegation,
  machinePrivatePkcs8B64:env.GEOMACRO_DELEGATED_MACHINE_PRIVATE_PKCS8_B64,
  machinePem:env.GEOMACRO_DELEGATED_MACHINE_PUBLIC_KEY_PEM});
 phase="PRIVATE_OUTPUT_WRITE";
 writeFileSync(out,JSON.stringify(signed)+"\n",{flag:"wx",mode:0o600});
 console.log(JSON.stringify({status:"MACHINE_SIGNED_GENUINE_DERIVED_READBACK_RECEIPT",
  profile:signed.payload.profile,
  signed_derived_count:signed.payload.exact_signed_derived_inputs_verified,
  independent_external_review_attested:false,commercial_rights_attested:false,
  scored_gri_claimed:false,b2_puts:0,d1_writes:0,payments:0}));
}
main().catch(error=>{console.error(JSON.stringify(sanitizeCloudSigningFailure(error,phase)));process.exitCode=2;});