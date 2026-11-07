#!/usr/bin/env node
/** Authoritative no-funds gate for a workflow_run triggered by D1 deployment.
 * The deployment workflow may report success even when its release-hold job
 * succeeded while the actual deploy job was SKIPPED. Never equate run success
 * with an actual production Worker replacement.
 */
import {readFileSync,appendFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";

const SHA=/^[a-f0-9]{40}$/u;
export function assessActualD1Deploy({event,jobs,mainSha}){
 const run=event?.workflow_run;
 if(event?.action!=="completed"||!run||
   run?.conclusion!=="success"||
   !["push","workflow_dispatch"].includes(run.event)||
   run.head_branch!=="main"||
   run.head_repository?.full_name!=="blocknine0/geomacro"||
   !SHA.test(run.head_sha??"")||
   !SHA.test(mainSha??"")||run.head_sha!==mainSha)
  return Object.freeze({admitted:false,reason:"NO_VERIFIED_EXACT_MAIN_DEPLOY_RUN"});
 if(!Array.isArray(jobs)||jobs.length<1||jobs.length>=100)
  return Object.freeze({admitted:false,reason:"DEPLOY_JOB_CENSUS_UNVERIFIED"});
 const deployments=jobs.filter(x=>x?.name==="bootstrap-deploy-accept");
 if(deployments.length!==1||deployments[0].status!=="completed"||
   deployments[0].conclusion!=="success")
  return Object.freeze({admitted:false,reason:"PRODUCTION_BOOTSTRAP_DEPLOY_SKIPPED_OR_FAILED"});
 return Object.freeze({admitted:true,
  reason:"EXACT_MAIN_BOOTSTRAP_DEPLOY_JOB_SUCCESS"});
}

async function run(){
 const env=process.env;
 if(env.GITHUB_ACTIONS!=="true"||
    env.GITHUB_EVENT_NAME!=="workflow_run"||
    env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    !/^[0-9]+$/u.test(env.DEPLOY_WORKFLOW_RUN_ID??"")||
    (env.GITHUB_TOKEN??"").length<20||
    !env.GITHUB_EVENT_PATH||!env.GITHUB_OUTPUT)
  throw Error("DEPLOY_RECEIPT_GATE_ENV_UNVERIFIED");
 const event=JSON.parse(readFileSync(env.GITHUB_EVENT_PATH,"utf8"));
 const url="https://api.github.com/repos/blocknine0/geomacro";
 const fetchProvider=async endpoint=>{
  const response=await fetch(url+endpoint,{
   redirect:"error",cache:"no-store",
   headers:{Authorization:"Bearer "+env.GITHUB_TOKEN,
    Accept:"application/vnd.github+json",
    "X-GitHub-Api-Version":"2022-11-28"},
   signal:AbortSignal.timeout(12000)
  });
  if(response.status!==200)
   throw Error("DEPLOY_RECEIPT_GITHUB_READ_UNAVAILABLE");
  return response.json();
 };
 let result;
 try{
  const [jobPage,main]=await Promise.all([
   fetchProvider("/actions/runs/"+env.DEPLOY_WORKFLOW_RUN_ID+
    "/jobs?per_page=100"),
   fetchProvider("/commits/main")
  ]);
  result=assessActualD1Deploy({event,jobs:jobPage?.jobs,
    mainSha:main?.sha});
  if(jobPage?.total_count!==jobPage?.jobs?.length)
   result={admitted:false,reason:"DEPLOY_JOB_PAGINATION_UNVERIFIED"};
 }catch{
  result={admitted:false,reason:"DEPLOY_RECEIPT_PROVIDER_READ_FAILED"};
 }
 appendFileSync(env.GITHUB_OUTPUT,
  "actual_deploy="+String(result.admitted===true)+"\n");
 console.log("P0B_DEPLOY_EVENT_GATE="+result.reason);
 // Expected hold: do not mark the overall read-only workflow as failure;
 // dependent production B2 jobs must explicitly test actual_deploy=true.
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 await run();
