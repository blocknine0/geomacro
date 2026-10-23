#!/usr/bin/env node
// Protected GitHub-Actions-only legacy GRI rhythm: genuine 3-domain
// SHA-pinned scored input -> canonical v1.2 recompute -> portable proof.
// No Supabase, human identity key, publisher, public snapshot or payment.
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {createB2Client} from "./b2-s3-client.mjs";
import {runLegacyAutoGriResearch} from "../lib/gri-legacy-auto-recompute.mjs";
const deny=()=>{throw Error("GRI_LEGACY_AUTO_NO_FUNDS_REFUSED")};
export async function lookupExistingControlD1(env=process.env,fetchImpl=fetch){
 const account=String(env.CLOUDFLARE_ACCOUNT_ID??"");
 const token=String(env.CLOUDFLARE_API_TOKEN??"");
 if(!/^[a-f0-9]{32}$/iu.test(account)||token.length<20)deny();
 const response=await fetchImpl(
  "https://api.cloudflare.com/client/v4/accounts/"+account+
  "/d1/database?per_page=100",{
   method:"GET",redirect:"error",cache:"no-store",
   headers:{Authorization:"Bearer "+token,Accept:"application/json"},
   signal:AbortSignal.timeout(15000)
  });
 if(!response.ok||response.redirected)deny();
 const payload=await response.json();
 if(payload.success!==true||!Array.isArray(payload.result)||
    payload.result.length>100)deny();
 const matches=payload.result.filter(x=>x.name==="geomacro-control-plane");
 if(matches.length!==1||!/^[a-f0-9-]{36}$/iu.test(matches[0].uuid??""))
  deny();
 return matches[0].uuid;
}
export async function runHostedGriLegacyAuto({
 env=process.env,quotaLookup=lookupExistingControlD1,
 clientFactory=createB2Client,now=new Date()
}={}){
 return runLegacyAutoGriResearch({
  env,now,
  resolveQuotaDatabase:async e=>{
   const id=await quotaLookup(e);
   if(env===process.env)process.env.D1_DATABASE_ID=id;
   return id;
  },
  b2Factory:e=>clientFactory({
   endpointUrl:"https://s3.us-east-005.backblazeb2.com",
   bucket:"geomacro-private-archive",
   accessKey:e.B2_KEY_ID,
   secretKey:e.B2_APPLICATION_KEY,
   readAccessKey:e.B2_ARCHIVE_READ_KEY_ID,
   readSecretKey:e.B2_ARCHIVE_READ_APPLICATION_KEY,
  })
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  if(process.argv.length!==3||process.argv[2]!=="--approved-private-recompute-no-funds")
   deny();
  const result=await runHostedGriLegacyAuto();
  console.log(JSON.stringify(result));
 }catch{
  console.error("GRI_LEGACY_AUTO_RECOMPUTE_FAILED_CLOSED_NO_COMMERCIAL_PUBLISH");
  process.exitCode=2;
 }
}
