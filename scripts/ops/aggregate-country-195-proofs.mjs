#!/usr/bin/env node
// Reuse the existing 90-day GitHub original-proof artifacts; no extra
// publisher requests, B2/D1/Supabase writes, signing or money.
import {execFileSync} from "node:child_process";
import {mkdirSync,readFileSync,writeFileSync,readdirSync,statSync} from "node:fs";
import {join} from "node:path";
import {parseCanonical195Codes,rollupCountry195Proofs}
 from "../lib/country-195-proof-rollup.mjs";

const REPO="blocknine0/geomacro",TOKEN=process.env.GH_TOKEN;
if(process.env.GITHUB_REPOSITORY!==REPO||!TOKEN||TOKEN.length<20)
 throw Error("COUNTRY_195_ROLLUP_GITHUB_READ_SCOPE_REQUIRED");
const API="https://api.github.com/repos/"+REPO;
async function github(path){
 const res=await fetch(API+path,{redirect:"error",headers:{
  Authorization:"Bearer "+TOKEN,Accept:"application/vnd.github+json",
  "X-GitHub-Api-Version":"2022-11-28"},
  signal:AbortSignal.timeout(15000)});
 if(!res.ok||Number(res.headers.get("content-length")||0)>1000000)
  throw Error("COUNTRY_195_GITHUB_METADATA_UNAVAILABLE");
 const raw=await res.text();if(raw.length>1000000)throw Error("COUNTRY_195_GITHUB_METADATA_OVERSIZE");
 return JSON.parse(raw);
}
function locate(dir,depth=0){
 if(depth>4)return null;
 for(const entry of readdirSync(dir,{withFileTypes:true})){
  const path=join(dir,entry.name);
  if(entry.isFile()&&entry.name==="live-batch-checkpoint.v1.json")return path;
  if(entry.isDirectory()){const found=locate(path,depth+1);if(found)return found;}
 }
 return null;
}
const list=await github("/actions/workflows/live-on-demand-source-acceptance.yml/runs?per_page=100&event=schedule&branch=main");
if(!Array.isArray(list.workflow_runs))throw Error("COUNTRY_195_RUN_HISTORY_INVALID");
const now=new Date(),epoch=Date.parse("2026-10-22T00:00:00Z");
const runs=list.workflow_runs.filter(r=>r?.event==="schedule"&&r?.conclusion==="success"&&
 r?.head_branch==="main"&&Number.isSafeInteger(r.id)&&
 Date.parse(r.created_at)>=epoch&&
 Date.parse(r.created_at)>=now.getTime()-90*86400_000).slice(0,70);
const root="artifacts/country-195/private-rollup-tmp";
mkdirSync(root,{recursive:true,mode:0o700});
const reports=[];let missingArtifacts=0,downloadUnavailable=0;
for(const run of runs){
 const a=await github("/actions/runs/"+run.id+"/artifacts?per_page=50");
 const artifact=a.artifacts?.find(x=>x.name==="live-country-195-resume-"+run.id&&
   x.expired===false);
 if(!artifact){missingArtifacts++;continue;}
 const destination=join(root,String(run.id));mkdirSync(destination,{recursive:true,mode:0o700});
 try{
  execFileSync("gh",["run","download",String(run.id),"-R",REPO,
   "-n",artifact.name,"-D",destination],{
    env:{...process.env,GH_TOKEN:TOKEN},stdio:"ignore",timeout:15000,
  });
 }catch{downloadUnavailable++;continue;}
 const file=locate(destination);
 if(!file||statSync(file).size>500000)throw Error("COUNTRY_195_DOWNLOADED_PROOF_MISSING");
 reports.push(JSON.parse(readFileSync(file,"utf8")));
}
const known=parseCanonical195Codes(
 readFileSync("src/lib/canonical-country-registry-195.ts","utf8"));
const audit=rollupCountry195Proofs(reports,known,{now});
const receipt={...audit,scheduled_runs_seen:runs.length,
 missing_artifacts:missingArtifacts,download_unavailable:downloadUnavailable,
 archive_backed_input_only:true,upstream_source_requests:0,
 historical_probe_success_does_not_prove_today_reachability:true};
const out="artifacts/country-195/rolling-proof-summary.v1.json";
writeFileSync(out,JSON.stringify(receipt,null,2)+"\n",{encoding:"utf8",mode:0o600});
console.log(JSON.stringify(receipt));
