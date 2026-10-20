#!/usr/bin/env node
/**
 * Production health is a READ-ONLY downstream acceptance step, not a signer,
 * risk scorer, B2 publisher or financial authorization.
 *
 * A successful signed publisher can finish after another commit advances main.
 * Accept only a trusted signed-publisher SHA that really belongs to the
 * checked-out canonical main's ancestry; never accept fork/other-branch
 * callbacks or an unrelated object whose SHA only looks valid.
 */
import {execFileSync} from "node:child_process";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
const SHA=/^[a-f0-9]{40}$/u;
const PUBLISHERS=new Set([
  "GRI v1.2 Supabase-Free Current Promotion",
  "Supabase-Free Reviewed Intelligence Publication",
  "Machine Dual-Authority Intelligence Publication",
  "Risk Indices from Verified D1 Global Risk (No Funds)",
]);
export function verifyWebsitePublicationFollowup({
  repository,eventName,eventSha,checkoutSha,
  parentSha,parentRepository,parentBranch,parentWorkflow,
  parentEvent,parentConclusion,isAncestor,
}={}){
  const fail=()=>{throw Error("WEBSITE_HEALTH_TRUSTED_PUBLISHER_ANCESTRY_REQUIRED")};
  if(repository!=="blocknine0/geomacro"||
     !SHA.test(String(eventSha??""))||
     !SHA.test(String(checkoutSha??""))||
     checkoutSha!==eventSha)fail();
  if(eventName!=="workflow_run"){
    if(!new Set(["push","workflow_dispatch","schedule"]).has(eventName))fail();
    return Object.freeze({schema:"geomacro.website-health-publication-continuity.v1",
      allowed:true,source:"CURRENT_MAIN_DIRECT_HEALTH",
      parent_workflow_verified:false,public_signed_product_verified:false,
      public_deep_health_http_200_verified:false,
      b2_requests:0,d1_writes:0,payments:0});
  }
  if(parentRepository!=="blocknine0/geomacro"||
     parentBranch!=="main"||parentConclusion!=="success"||
     !PUBLISHERS.has(parentWorkflow)||
     !SHA.test(String(parentSha??""))||
     (parentWorkflow==="Risk Indices from Verified D1 Global Risk (No Funds)"
       ? parentEvent!=="workflow_run"
       : !new Set(["workflow_dispatch","repository_dispatch"]).has(parentEvent))||
     isAncestor!==true)fail();
  return Object.freeze({schema:"geomacro.website-health-publication-continuity.v1",
    allowed:true,source:"TRUSTED_SUCCESSFUL_PUBLISHER_ANCESTOR_OF_CURRENT_MAIN",
    parent_workflow_verified:true,public_signed_product_verified:false,
    public_deep_health_http_200_verified:false,
    b2_requests:0,d1_writes:0,payments:0});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const e=process.env;
    const checkoutSha=execFileSync("git",["rev-parse","HEAD"],
      {encoding:"utf8",timeout:15_000,stdio:["ignore","pipe","pipe"]}).trim();
    const parentSha=e.TRUSTED_PUBLISHER_PARENT_SHA;
    let isAncestor=false;
    if(e.GITHUB_EVENT_NAME==="workflow_run"&&SHA.test(String(parentSha??""))){
      try{
        execFileSync("git",["merge-base","--is-ancestor",parentSha,checkoutSha],
          {timeout:15_000,stdio:"ignore"});
        isAncestor=true;
      }catch{}
    }
    const result=verifyWebsitePublicationFollowup({
      repository:e.GITHUB_REPOSITORY,
      eventName:e.GITHUB_EVENT_NAME,eventSha:e.GITHUB_SHA,checkoutSha,
      parentSha,parentRepository:e.TRUSTED_PUBLISHER_PARENT_REPOSITORY,
      parentBranch:e.TRUSTED_PUBLISHER_PARENT_BRANCH,
      parentWorkflow:e.TRUSTED_PUBLISHER_PARENT_WORKFLOW,
      parentEvent:e.TRUSTED_PUBLISHER_PARENT_EVENT,
      parentConclusion:e.TRUSTED_PUBLISHER_PARENT_CONCLUSION,
      isAncestor,
    });
    console.log(JSON.stringify(result));
  }catch{
    console.error("::error::WEBSITE_HEALTH_TRUSTED_PUBLISHER_ANCESTRY_REQUIRED");
    process.exitCode=2;
  }
}
