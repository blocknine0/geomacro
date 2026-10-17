#!/usr/bin/env node
/** #2170 daily 14-slot private root census. Pulls only GitHub Actions
 * already-observed SHA-only health artifacts; no publisher GET/B2/D1/model.
 * This relies on trust in the repo's GitHub Actions receipts, not on signed
 * original publisher evidence. It can be partially observed and never green
 * unobserved slots. Upload only the sanitized aggregate, not the raw zips.
 */
import {readFileSync,mkdirSync,writeFileSync,mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {auditGovernedRootRotation} from "../lib/governed-root-rotation-census.mjs";

const REPO="blocknine0/geomacro";
const BASE="https://api.github.com/repos/"+REPO;
const WORKFLOW="three-domain-private-source-intake.yml";
const OUTPUT="artifacts/private-intake/source-root-full-rotation-census.json";
const ERR="PRIVATE_ROOT_ROTATION_CENSUS_FAILED";
const LIMIT=40;
async function api(path,token,binary=false){
  const ctrl=AbortSignal.timeout(12000);
  const response=await fetch(BASE+path,{
    method:"GET",redirect:"follow",signal:ctrl,
    headers:{"Authorization":"Bearer "+token,
      "Accept":binary?"application/vnd.github+json":"application/vnd.github+json",
      "X-GitHub-Api-Version":"2022-11-28",
      "User-Agent":"Geomacro-ReadOnly-Root-Census/1.0"},
  });
  if(!response.ok)throw Error(ERR);
  if(binary){
    const bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.byteLength<50||bytes.byteLength>256*1024)throw Error(ERR);
    return bytes;
  }
  const data=JSON.parse(await response.text());
  if(!data||typeof data!=="object")throw Error(ERR);
  return data;
}
export async function collectAndAuditRootRotation({
  catalog,now=new Date(),token,fetchApi=api,
}={}){
  if(!token||typeof token!=="string"||token.length<10)throw Error(ERR);
  const recent=await fetchApi("/actions/workflows/"+WORKFLOW+
    "/runs?branch=main&per_page=70",token);
  if(!Array.isArray(recent.workflow_runs))throw Error(ERR);
  const receipts=[];
  const seenWindows=new Set();
  let considered=0;
  const dir=mkdtempSync(join(tmpdir(),"geomacro-root-census-"));
  try{
    for(const run of recent.workflow_runs){
      if(considered>=LIMIT||seenWindows.size>=14)break;
      if(run?.conclusion!=="success"||run?.head_branch!=="main")continue;
      const timestamp=Date.parse(run?.created_at??"");
      if(!Number.isFinite(timestamp)||now.getTime()-timestamp>48*3600000||
         timestamp>now.getTime()+5*60000)continue;
      considered++;
      const list=await fetchApi("/actions/runs/"+run.id+"/artifacts?per_page=50",token);
      const artifact=list.artifacts?.find(a=>a.name==="discovery-root-health-"+run.id &&
        a.expired===false && a.size_in_bytes<=256*1024);
      if(!artifact)continue;
      const zip=await fetchApi("/actions/artifacts/"+artifact.id+"/zip",token,true);
      const file=join(dir,String(artifact.id)+".zip");
      writeFileSync(file,zip,{mode:0o600});
      const unzip=spawnSync("unzip",["-p",file,"discovery-root-health.json"],{
        timeout:4000,maxBuffer:256*1024,encoding:"utf8",
      });
      if(unzip.status!==0||!unzip.stdout||unzip.stdout.length>256*1024)
        continue;
      let receipt;
      try{receipt=JSON.parse(unzip.stdout)}catch{continue}
      if(!Number.isSafeInteger(receipt?.window_index)||
         seenWindows.has(receipt.window_index))continue;
      // Exact publisher registry hash membership and chronology validated
      // by auditGovernedRootRotation below. Never emit raw artifact rows.
      receipts.push(receipt);
      seenWindows.add(receipt.window_index);
    }
  }finally{rmSync(dir,{recursive:true,force:true})}
  return auditGovernedRootRotation({catalog,receipts,now});
}
async function main(){
  if(process.argv.length!==2||process.env.GITHUB_REPOSITORY!==REPO||
     process.env.GITHUB_EVENT_NAME==="pull_request")throw Error(ERR);
  const catalog=JSON.parse(readFileSync("config/telegram-discovery-roots.json","utf8"));
  const report=await collectAndAuditRootRotation({
    catalog,token:process.env.GITHUB_TOKEN,
  });
  mkdirSync("artifacts/private-intake",{recursive:true});
  writeFileSync(OUTPUT,JSON.stringify(report)+"\n",{mode:0o600});
  // Aggregate only, never URL, source ID, token or raw artifact contents.
  console.log(JSON.stringify({
    schema:report.schema,status:report.status,
    observed_windows:report.observed_windows,
    window_count:report.window_count,
    root_checks_verified:report.root_checks_verified,
    root_checks_missing:report.root_checks_missing,
    http_reachable_roots:report.http_reachable_roots,
    per_domain:report.per_domain,
    all_registered_sources_working:false,
    chargeable:false,
  }));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(()=>{console.error(ERR);process.exitCode=2});
}
