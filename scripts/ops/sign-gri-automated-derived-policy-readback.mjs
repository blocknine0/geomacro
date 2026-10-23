#!/usr/bin/env node
/**
 * Existing derived-journal verification happens in the SAME protected job
 * before this step. Bind one-time dual-human consent to two dedicated
 * automated machine roles for each ACTUAL exact-original signed audit.
 * No numerical GRI, commercial rights, B2/D1 publication or payments.
 */
import {readFileSync,lstatSync,openSync,closeSync,writeFileSync,constants} from "node:fs";
import {resolve,isAbsolute} from "node:path";
import {fileURLToPath} from "node:url";
import {issueAutomatedPolicyDerivedReview} from "../lib/gri-automated-derived-policy-review.mjs";
const fail=code=>{throw Error("GRI_AUTO_DERIVED_REVIEW_"+code)};
export function signGriDerivedPolicyFromExistingReceipt({
  env=process.env,read=readFileSync,write,now=new Date()
}={}){
 const input=env.GEOMACRO_VERIFIED_DERIVED_RECEIPT_PATH;
 const output=env.GEOMACRO_GRI_AUTO_DERIVED_APPROVAL_PATH;
 const temp=env.RUNNER_TEMP;
 if(!isAbsolute(input??"")||!isAbsolute(output??"")||
    !isAbsolute(temp??"")||!resolve(input).startsWith(resolve(temp)+"/")||
    !resolve(output).startsWith(resolve(temp)+"/")||
    resolve(output)===resolve(input))fail("RUNNER_TEMP_ONLY");
 const st=lstatSync(input);
 if(!st.isFile()||st.isSymbolicLink()||st.size<100||st.size>16384||
    (st.mode&0o077)!==0)fail("VERIFIED_RECEIPT_FILE_REQUIRED");
 let audit;
 try{audit=JSON.parse(read(input,"utf8"))}
 catch{fail("VERIFIED_RECEIPT_SCHEMA_INVALID")}
 const result=issueAutomatedPolicyDerivedReview({audit,env,now});
 if(result.status==="SKIPPED_NO_VERIFIED_CURRENT_ORIGINAL")
  return {schema:"geomacro.gri-auto-policy-signed-run.v1",
    status:result.status,approval_written:false,
    commercial_rights_attested:false,numerical_gri_scored:false,payments:0};
 const contents=JSON.stringify(result)+"\n";
 if(contents.length>18000)fail("SIGNATURE_RECEIPT_OVERSIZE");
 if(typeof write==="function"){write(output,contents)}
 else {
  const fd=openSync(output,constants.O_WRONLY|constants.O_CREAT|
    constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{writeFileSync(fd,contents,"utf8")}finally{closeSync(fd)}
 }
 return {
  schema:"geomacro.gri-auto-policy-signed-run.v1",
  status:"ONE_TIME_CONSENT_MACHINE_POLICY_REVIEW_SIGNED",
  approval_written:true,
  independent_human_batch_review_claimed:false,
  numerical_gri_scored:false,
  commercial_rights_attested:false,
  current_signed_hot_product_published:false,payments:0,
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==3||
     process.argv[2]!=="--sign-current-verified-derived-audit-no-funds")
    fail("EXPLICIT_DERIVED_ONLY_MODE_REQUIRED");
  console.log(JSON.stringify(signGriDerivedPolicyFromExistingReceipt()));
 }catch{
  console.error("GRI_AUTO_DERIVED_POLICY_REVIEW_NOT_AUTHORIZED");
  process.exitCode=2;
 }
}
