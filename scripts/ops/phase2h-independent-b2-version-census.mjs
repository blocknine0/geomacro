#!/usr/bin/env node
/** Independent read-only provider census of EVERY version in the Phase2H B2 prefix.
 * Not an archive writer and not a historical deletion claim from an empty list.
 * Each native request consumes a shared atomic D1 B2 quota ticket first.
 */
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {assertPhase2hB2ManualRetention,PHASE2H_B2_PREFIX} from "./phase2h-verify-b2-72h-lifecycle.mjs";

const DAY=86_400_000;
const MAX_PAGES=4;
const FAIL=code=>{throw Error("PHASE2H_B2_VERSION_"+code)};
const PREFIX=PHASE2H_B2_PREFIX;
const nameRe=/^geomacro-evidence\/v1\/private\/phase2h-raw-news\/20\d{2}\/\d{2}\/\d{2}\/[a-f0-9]{64}\.json\.gz$/u;
export const RECEIPT_SCHEMA="geomacro.phase2h.independent-b2-versions.v1";
// Keep provider failures actionable without ever returning raw HTTP bodies,
// account identifiers, keys, buckets, source titles or stack traces.
export function safeB2RetentionError(error){
 const code=String(error?.message??"");
 return /^(?:PHASE2H_B2_VERSION_[A-Z0-9_]+|PHASE2H_B2_72H_[A-Z0-9_]+|B2_GLOBAL_DAILY_QUOTA_EXHAUSTED|B2_ACCOUNT_GLOBAL_QUOTA_[A-Z0-9_]+)$/u.test(code)?
  code:"PHASE2H_B2_VERSION_INDEPENDENT_PROVIDER_PROOF_UNAVAILABLE";
}

export function checkB2VersionsPage(page,now=new Date()){
 if(!Number.isFinite(now.getTime())||!Array.isArray(page?.files)||page.files.length>1000)
  FAIL("PROVIDER_PAGE_INVALID");
 const cursorName=page.nextFileName??null,cursorId=page.nextFileId??null;
 if((cursorName===null)!==(cursorId===null)||cursorName!==null&&
   (typeof cursorName!=="string"||typeof cursorId!=="string"||!cursorName.startsWith(PREFIX)))
  FAIL("PAGINATION_INVALID");
 let uploads=0,hides=0,overdue=0;
 for(const file of page.files){
  if(!nameRe.test(file?.fileName??"")||!["upload","hide"].includes(file?.action)||
     typeof file.fileId!=="string"||file.fileId.length<10)
   FAIL("UNRECOGNIZED_PREFIX_VERSION");
  const ts=Number(file.uploadTimestamp);
  if(!Number.isSafeInteger(ts)||ts<0||ts>now.getTime()+60_000)
   FAIL("VERSION_CLOCK_INVALID");
  if(file.action==="upload"){
   uploads++;
   if(ts<=now.getTime()-3*DAY)overdue++;
  }else hides++;
 }
 return {uploads,hides,overdue,nextFileName:cursorName,nextFileId:cursorId};
}
export async function verifyPhase2hB2VersionInventory({fetchImpl=fetch}={}){
 void fetchImpl;
 // B2 file-version enumeration is disabled. A future retention receipt must
 // use D1-indexed version IDs; the provider is never asked to list versions.
 FAIL("D1_FILE_INDEX_REQUIRED_NO_B2_LIST_API");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const receipt=await verifyPhase2hB2VersionInventory();
  mkdirSync("artifacts/phase2h",{recursive:true,mode:0o700});
  writeFileSync("artifacts/phase2h/independent-b2-versions.json",
   JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
  console.log(JSON.stringify(receipt));
  // Older versions are expected under manual retention; not a violation.
 }catch(e){
  console.error(safeB2RetentionError(e));
  process.exitCode=2;
 }
}
