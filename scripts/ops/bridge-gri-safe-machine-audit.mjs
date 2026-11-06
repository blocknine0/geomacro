#!/usr/bin/env node
// Read-only, no-network bridge. Output is a source-neutral signature audit.
import {readFileSync,lstatSync,openSync,writeFileSync,closeSync,constants} from "node:fs";
import {resolve,relative} from "node:path";
import {makeSourceNeutralIssuerAudit,signConsentedSourceNeutralPolicy} from "../lib/gri-safe-machine-policy-bridge.mjs";
const fail=()=>{throw Error("GRI_SAFE_AUDIT_BOUNDARY_INVALID");};
function checked(path,read=false){
 const base=resolve(process.env.RUNNER_TEMP??"");
 const file=resolve(path);
 if(!base.includes("/_temp")||relative(base,file).startsWith("..")||file===base)fail();
 if(read){
  const stat=lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<100||stat.size>16384||
    (stat.mode&0o077)!==0)fail();
 }
 return file;
}
function load(path){return JSON.parse(readFileSync(checked(path,true),"utf8"));}
function save(path,value){
 const bytes=JSON.stringify(value)+"\n";
 if(bytes.length>16384)fail();
 const fd=openSync(checked(path),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 try{writeFileSync(fd,bytes,"utf8");}finally{closeSync(fd);}
}
export function main(mode=process.argv[2],env=process.env){
 const base=resolve(env.RUNNER_TEMP??"");
 if(mode==="--emit-neutral"){
  const report=load(base+"/owner-only-verification.json");
  save(base+"/gri-issuer-neutral.json",makeSourceNeutralIssuerAudit({report,env}));
  return "ISSUER_SOURCE_NEUTRAL_SIGNED";
 }
 if(mode==="--machine-sign-neutral"){
  // This job must contain only public issuer verification identity and
  // independently scoped, previously consented machine signing identities.
  const receipt=load(base+"/gri-neutral-artifact/gri-issuer-neutral.json");
  const signed=signConsentedSourceNeutralPolicy({audit:receipt,env});
  save(base+"/gri-machine-neutral-policy.json",signed);
  return signed.status;
 }
 fail();
}
if(process.argv[1]?.endsWith("bridge-gri-safe-machine-audit.mjs")){
 try{console.log(JSON.stringify({status:main(),numeric_gri_published:false,payments:0}));}
 catch{console.error("GRI_SAFE_MACHINE_AUDIT_NOT_ACCEPTED");process.exitCode=2;}
}
