#!/usr/bin/env node
/** Offline aggregate of independently collected hourly artifact receipts. */
import {readdirSync,readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve,join} from "node:path";
import {pathToFileURL} from "node:url";
import {evaluateD1LaunchWindow} from "../lib/d1-launch-window.mjs";
export function evaluateD1ReceiptDirectory(directory){
 const names=readdirSync(directory).filter(n=>/^[0-9a-zA-Z_-]+\.json$/.test(n));
 if(names.length>200)throw Error("D1_LAUNCH_TOO_MANY_RECEIPTS");
 const receipts=names.map(name=>{
  const raw=readFileSync(join(directory,name),"utf8");
  if(raw.length>20000)throw Error("D1_LAUNCH_RECEIPT_OVERSIZE");
  return JSON.parse(raw);
 });
 return evaluateD1LaunchWindow(receipts);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  if(process.argv.length!==3)throw Error("D1_LAUNCH_RECEIPTS_DIRECTORY_REQUIRED");
  const result=evaluateD1ReceiptDirectory(process.argv[2]);
  mkdirSync("artifacts/d1-launch-72h",{recursive:true});
  writeFileSync("artifacts/d1-launch-72h/acceptance.json",
   JSON.stringify(result,null,2)+"\n",{mode:0o600});
  console.log(JSON.stringify(result));
  // PENDING does not masquerade as an Actions failure or healthy operation.
  if(result.status!=="ACCEPTED")console.log("::warning::D1_LAUNCH_72H_ACCEPTANCE_PENDING");
 }catch{
  console.error("D1_LAUNCH_72H_EVIDENCE_UNVERIFIED");process.exitCode=2;
 }
}
