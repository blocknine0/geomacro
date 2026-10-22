#!/usr/bin/env node
// After TWO real signed files and canonical offline GRI/B2-history review:
// one local consent installs only time-limited SHA hints + already-signed
// Pallab approval as a protected GitHub secret. Existing 15-minute job
// validates that signature automatically. No new signature, B2 PUT,
// artificial rights approval, mainnet payment or Supabase write.
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import {verifyPrivatePallabSumanPaths} from
 "./verify-pallab-suman-independent-handoff.mjs";
import {verifyPallabSignedReadyGate} from
 "../lib/pallab-signed-ready-gri-gate.mjs";
const REPO="blocknine0/geomacro";
const sha=v=>createHash("sha256").update(v).digest("hex");
const fail=v=>{throw Error("GRI_SIGNED_AUTO_HANDOFF_"+v);};
export function prepareSafeAutomatedGriHandoff({env,now=new Date()}={}){
 if(!env||!(now instanceof Date)||!Number.isFinite(now.getTime()))
   fail("CLOCK_OR_ENV_INVALID");
 const reviewed=readFileSync(env.GEOMACRO_REVIEWED_GRI_PATH);
 const certificates=readFileSync(env.GEOMACRO_COUNTRY_CERTIFICATES_PATH);
 const approval=readFileSync(env.GEOMACRO_OWNER_SIGNED_APPROVAL_PATH);
 const reviewedSha=sha(reviewed),certSha=sha(certificates);
 if(reviewedSha!==env.GEOMACRO_REVIEWED_GRI_SHA256||
    certSha!==env.GEOMACRO_COUNTRY_CERTIFICATES_SHA256||
    sha(approval)!==env.GEOMACRO_OWNER_SIGNED_APPROVAL_SHA256)
   fail("EXACT_PRIVATE_FILE_PIN_INVALID");
 const envelopeB64=approval.toString("base64");
 const result=verifyPallabSignedReadyGate({
   ownerEnvelopeBase64:envelopeB64,
   ownerPublicKeyPem:env.GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_PEM,
   ownerPublicKeySpkiSha256:env.GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_SHA256,
   sumanReviewerSpkiSha256:env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256,
   factsSpkiSha256:env.GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_SHA256,
   rightsSpkiSha256:env.GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_SHA256,
   reviewedSha256:reviewedSha,certificatesSha256:certSha,now
 });
 if(result.signed_owner_approval_verified!==true)fail("OWNER_SIGNER_NOT_CURRENT");
 // 15-minute cadence uses a 28-minute recent hint. This timestamp denotes
 // current delivery of an ALREADY human-approved immutable signed package,
 // NOT when the reviewer purportedly re-reviewed the original event.
 return Object.freeze({
  reviewedSha,certificatesSha,ownerApprovalBase64:envelopeB64,
  readyAt:now.toISOString()
 });
}
export function installSafeGriReadyPointers(pkg,{
 run=(cmd,args,stdin)=>spawnSync(cmd,args,{
   input:stdin,encoding:"utf8",timeout:15_000,maxBuffer:4000
 })
}={}){
 const HEX=/^[a-f0-9]{64}$/u;
 if(!pkg||!HEX.test(pkg.reviewedSha??"")||
    !HEX.test(pkg.certificatesSha??"")||
    typeof pkg.ownerApprovalBase64!=="string"||
    pkg.ownerApprovalBase64.length<150||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(pkg.readyAt??""))
   fail("SAFE_HINT_CONTRACT_INVALID");
 const checks=[
  ["variable",["set","GRI_READY_REVIEWED_SHA256","--repo",REPO,"--body",pkg.reviewedSha]],
  ["variable",["set","GRI_READY_CERTIFICATES_SHA256","--repo",REPO,"--body",pkg.certificatesSha]],
  ["variable",["set","GRI_READY_APPROVED_AT","--repo",REPO,"--body",pkg.readyAt]],
  // Last, after all non-secret pointers. Partial failure is fail-closed.
  ["secret",["set","GEOMACRO_OWNER_HUMAN_SIGNED_ENVELOPE_B64",
    "--repo",REPO,"--env","production"]]
 ];
 for(const [kind,args] of checks){
  const out=run("gh",[kind,...args],
    kind==="secret"?pkg.ownerApprovalBase64:undefined);
  if(!out||out.error||out.status!==0)
   fail("GITHUB_PROTECTED_HINT_INSTALL_UNVERIFIED");
 }
 return {status:"SIGNED_HUMAN_APPROVAL_AND_POINTERS_INSTALLED",
   scheduled_15_min_verification_now_enabled:true,
   actual_signed_gri_b2_readback_not_claimed:true,
   approval_not_newly_generated:true,
   public_gri_http_200_not_claimed:true,
   mainnet_payments:0};
}
async function main(env=process.env){
 if(process.argv.length!==3||
    process.argv[2]!=="--activate-existing-human-signatures-no-funds"||
    !process.stdin.isTTY||!process.stdout.isTTY||
    env.CI==="true"||env.GITHUB_ACTIONS==="true")
   fail("PRIVATE_INTERACTIVE_HUMAN_OPERATOR_REQUIRED");
 // Must have actual Suman and Pallab, ORIGINAL bytes, rights, historical
 // gzip B2 lineage and signed country cells: existing strict validator.
 const validated=verifyPrivatePallabSumanPaths(env,{now:new Date()});
 if(validated.ready_for_existing_approved_no_funds_staging!==true)
  fail("CANONICAL_SIGNED_INPUT_UNVERIFIED");
 const pkg=prepareSafeAutomatedGriHandoff({env,now:new Date()});
 process.stdout.write(
  "Pallab/Suman exact signatures and canonical private review verified.\n"+
  "This installs a protected signed approval and time-limited SHA hints,\n"+
  "NOT a payment or new signature. B2 signed staging must exist.\n"+
  "Type ENABLE HUMAN-SIGNED AUTOMATION: ");
 const {createInterface}=await import("node:readline/promises");
 const rl=createInterface({input:process.stdin,output:process.stdout});
 let choice;
 try{choice=await rl.question("");}finally{rl.close();}
 if(choice!=="ENABLE HUMAN-SIGNED AUTOMATION")fail("OPERATOR_DECLINED");
 const result=installSafeGriReadyPointers(pkg);
 console.log(JSON.stringify(result));
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 main().catch(()=>{console.error("GRI_SIGNED_AUTO_HANDOFF_FAILED_CLOSED");process.exitCode=2;});
}
