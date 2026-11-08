#!/usr/bin/env node
/**
 * Protected, read-only Step3 Shadow recovery diagnostics.
 * Checks only secret format, signer identity, actual Shadow D1 bookmark
 * and private R2 bucket metadata. Never PUTs, GETs object bytes, or mutates
 * D1; cannot independently approve a migration or canary.
 */
import {existsSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {inspectD1RecoveryPrerequisitesReadOnly}
 from "../lib/d1-step3-recovery-checkpoint.mjs";
const SHADOW="c4add153-229d-412a-b1bd-489526b7e02f";
const PROD="db057ca9-9f6e-4957-ac28-144f3b798f9b";
const ACCOUNT="fddd57d28199bad07a768445e7237693";
export async function inspectExactShadowRecovery({env=process.env,fetchImpl=fetch}={}){
 if(env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    env.GITHUB_REF!=="refs/heads/main"||
    !/^[a-f0-9]{40}$/u.test(env.GITHUB_SHA??"")||
    env.CLOUDFLARE_ACCOUNT_ID!==ACCOUNT||
    env.D1_DATABASE_ID!==PROD||
    env.GEOMACRO_D1_SHADOW_DATABASE_ID!==SHADOW||
    !existsSync("config/d1-hotspot-v2-canary.hold"))
  return Object.freeze({
   schema:"geomacro.step3.recovery-prerequisites-readonly.v1",
   status:"HOLD",code:"EXACT_MAIN_AND_SHADOW_PINNING_UNVERIFIED",
   production_d1_queries:0,shadow_d1_sql_queries:0,
   r2_object_reads:0,r2_object_writes:0,payments:0,
   encrypted_checkpoint_verified:false
  });
 return inspectD1RecoveryPrerequisitesReadOnly({env,dbId:SHADOW,fetchImpl});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const r=await inspectExactShadowRecovery();
 const path="artifacts/release/step3-shadow-recovery-readonly.json";
 mkdirSync(resolve(path,".."),{recursive:true,mode:0o700});
 writeFileSync(path,JSON.stringify(r,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify(r));
 if(r.status!=="READONLY_RECOVERY_PREREQUISITES_VERIFIED_NOT_CHECKPOINT")
  process.exitCode=3;
}
