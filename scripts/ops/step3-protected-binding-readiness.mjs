#!/usr/bin/env node
/**
 * Issue #3739: protected, NO-PROVIDER, NO-FUNDS existence/format diagnostic.
 * Never logs or uploads any secret, even on an invalid input.
 */
import {createPrivateKey,createPublicKey} from "node:crypto";
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
const SHA=/^[a-f0-9]{40}$/u;
const HEX64=/^[a-f0-9]{64}$/iu;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const BUCKET=/^[a-z0-9][a-z0-9-]{2,62}$/u;
const ACCOUNT=/^[a-f0-9]{32}$/iu;
const STAGE1="REAL_SHADOW_BINDINGS_READY_FOR_PROVIDER_PREFLIGHT";
const APPS=[
 "CLOUDFLARE_ACCOUNT_ID","CLOUDFLARE_API_TOKEN",
 "D1_DATABASE_ID","GEOMACRO_D1_SHADOW_DATABASE_ID",
 "GEOMACRO_D1_RECOVERY_AES256_KEY_B64","GEOMACRO_D1_RECOVERY_R2_BUCKET",
 "GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET",
 "GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST",
 "GEOMACRO_STEP3_SHADOW_LEGACY_WORKER_HOST",
 "GEOMACRO_STEP3_EXACT_SHA",
 "GEOMACRO_D1_RECOVERY_R2_PRIVATE_APPROVED",
 "GEOMACRO_STEP3_SHADOW_POINTER_SEED_APPROVED",
 "GEOMACRO_STEP3_SHADOW_REHEARSAL_APPROVED",
 "SIGNING_JWK","GEOMACRO_STEP3_TRUSTED_SIGNER_PUBLIC_JWK",
 "CONTROL_PLANE_TOKEN","PHASE2H_R2_REFERENCE_HMAC_KEY",
 "B2_ARCHIVE_READ_KEY_ID","B2_ARCHIVE_READ_APPLICATION_KEY"
];
const valid=(name,v,env)=>{
 switch(name){
  case "CLOUDFLARE_ACCOUNT_ID":return ACCOUNT.test(v);
  case "D1_DATABASE_ID":
  case "GEOMACRO_D1_SHADOW_DATABASE_ID":return UUID.test(v);
  case "CLOUDFLARE_API_TOKEN":return v.length>=20;
  case "GEOMACRO_D1_RECOVERY_AES256_KEY_B64":
   return /^[A-Za-z0-9+/]{43}=$/u.test(v)&&
    Buffer.from(v,"base64").byteLength===32;
  case "GEOMACRO_D1_RECOVERY_R2_BUCKET":
  case "GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET":return BUCKET.test(v);
  case "GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST":
   return /^geomacro-step3-shadow\.[a-z0-9-]+\.workers\.dev$/u.test(v);
  case "GEOMACRO_STEP3_SHADOW_LEGACY_WORKER_HOST":
   return /^geomacro-step3-shadow-legacy\.[a-z0-9-]+\.workers\.dev$/u.test(v);
  case "GEOMACRO_STEP3_EXACT_SHA":return SHA.test(v)&&v===env.GITHUB_SHA;
  case "GEOMACRO_D1_RECOVERY_R2_PRIVATE_APPROVED":
  case "GEOMACRO_STEP3_SHADOW_POINTER_SEED_APPROVED":
  case "GEOMACRO_STEP3_SHADOW_REHEARSAL_APPROVED":return v==="YES";
  case "CONTROL_PLANE_TOKEN":return v.length>=32;
  case "PHASE2H_R2_REFERENCE_HMAC_KEY":return HEX64.test(v);
  case "B2_ARCHIVE_READ_KEY_ID":return v.length>=12;
  case "B2_ARCHIVE_READ_APPLICATION_KEY":return v.length>=16;
  case "SIGNING_JWK":
   try{return ["ed25519","ec"].includes(createPrivateKey({
    key:JSON.parse(v),format:"jwk"}).asymmetricKeyType)}catch{return false}
  case "GEOMACRO_STEP3_TRUSTED_SIGNER_PUBLIC_JWK":
   try{return ["ed25519","ec"].includes(createPublicKey({
    key:JSON.parse(v),format:"jwk"}).asymmetricKeyType)}catch{return false}
  default:return false;
 }
};
const truth=(flag)=>flag?"PASS":"HOLD";
export function assessStage3Bindings(env){
 const checks=APPS.map(name=>{
  const v=env[name]??"",present=typeof v==="string"&&v.length>0;
  return {name,status:truth(present&&valid(name,v,env)),
   issue:!present?"UNSET":!valid(name,v,env)?"FORMAT_OR_VALUE":"NONE"};
 });
 const extra=[
  ["D1_PRODUCTION_SHADOW_ISOLATED",
   UUID.test(env.D1_DATABASE_ID??"")&&UUID.test(env.GEOMACRO_D1_SHADOW_DATABASE_ID??"")&&
   env.D1_DATABASE_ID.toLowerCase()!==env.GEOMACRO_D1_SHADOW_DATABASE_ID.toLowerCase()],
  ["R2_RECOVERY_AND_SHADOW_ISOLATED",
   BUCKET.test(env.GEOMACRO_D1_RECOVERY_R2_BUCKET??"")&&
   BUCKET.test(env.GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET??"")&&
   env.GEOMACRO_D1_RECOVERY_R2_BUCKET!==env.GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET],
  ["TWO_DISTINCT_SHADOW_WORKERS",
   valid("GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST",
    env.GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST??"",env)&&
   valid("GEOMACRO_STEP3_SHADOW_LEGACY_WORKER_HOST",
    env.GEOMACRO_STEP3_SHADOW_LEGACY_WORKER_HOST??"",env)&&
   env.GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST!==
    env.GEOMACRO_STEP3_SHADOW_LEGACY_WORKER_HOST]
 ];
 let signerMatches=false;
 try{
  const privateKey=createPrivateKey({
   key:JSON.parse(env.SIGNING_JWK),format:"jwk"});
  const trusted=createPublicKey({
   key:JSON.parse(env.GEOMACRO_STEP3_TRUSTED_SIGNER_PUBLIC_JWK),format:"jwk"});
  const privateSpki=createPublicKey(privateKey).export({type:"spki",format:"der"});
  const publicSpki=trusted.export({type:"spki",format:"der"});
  signerMatches=privateSpki.equals(publicSpki);
 }catch{/* fail-closed without any key material in result */}
 extra.push(["PINNED_PUBLIC_SIGNER_MATCHES_PRIVATE",signerMatches]);
 const all=[...checks,...extra.map(([name,ok])=>({
  name,status:truth(ok),issue:ok?"NONE":"IDENTITY_UNVERIFIED"
 }))];
 const missing=all.filter(x=>x.status!=="PASS").map(x=>({
  name:x.name,issue:x.issue
 }));
 return Object.freeze({
  schema:"geomacro.step3.protected-binding-readiness.v1",
  scope:"CONFIGURATION_ONLY_NO_PROVIDER_IO",
  status:missing.length?"HOLD":STAGE1,
  checked:all.length,valid:all.length-missing.length,
  missing,checks:all,
  no_d1_calls:true,no_r2_calls:true,no_b2_calls:true,no_payment_calls:true,
  production_sql_mutated:false,provider_physical_proof:false
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const result=assessStage3Bindings(process.env);
 mkdirSync("artifacts/release",{recursive:true,mode:0o700});
 writeFileSync("artifacts/release/step3-bindings-readiness.json",
  JSON.stringify(result,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify({
  status:result.status,checked:result.checked,valid:result.valid,
  missing:result.missing,
  next:"VERIFY_REAL_CLOUDFLARE_AND_B2_PHYSICAL_PROOFS"
 }));
 if(result.status!==STAGE1)process.exitCode=2;
}
