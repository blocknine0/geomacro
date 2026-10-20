#!/usr/bin/env node
// GRI workflow SHA may be older than current main by the time a successful
// publisher finishes. Trust only an ancestor of current verified main;
// never turn this ancestry proof into real B2/D1 signed data acceptance.
import {execFileSync} from "node:child_process";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
const SHA=/^[a-f0-9]{40}$/u;

export function verifyTrustedGriContinuation({
 eventName,checkoutSha,eventSha,parentSha,isAncestor,
}={}){
 if(!SHA.test(String(checkoutSha??"")) || checkoutSha!==eventSha)
  throw Error("GRI_CONTINUATION_CURRENT_MAIN_CHECKOUT_INVALID");
 if(eventName==="workflow_dispatch")return Object.freeze({
  allowed:true,origin:"OWNER_DISPATCH_CURRENT_MAIN",
  parent_workflow_success_verified:false,
  signed_gri_parent_verified:false,b2_requests:0,d1_writes:0,payments:0,
 });
 if(eventName!=="workflow_run" || !SHA.test(String(parentSha??"")) ||
    isAncestor!==true)
  throw Error("GRI_CONTINUATION_TRUSTED_MAIN_ANCESTRY_REQUIRED");
 return Object.freeze({
  allowed:true,origin:"TRUSTED_GRI_PUBLISHER_ANCESTOR_OF_MAIN",
  parent_workflow_success_verified:false,
  signed_gri_parent_verified:false,
  b2_requests:0,d1_writes:0,payments:0,
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const eventName=process.env.GITHUB_EVENT_NAME;
  const eventSha=process.env.GITHUB_SHA;
  const parentSha=process.env.TRUSTED_GRI_PARENT_SHA;
  const checkoutSha=execFileSync("git",["rev-parse","HEAD"],{
   encoding:"utf8",timeout:15000,stdio:["ignore","pipe","pipe"]}).trim();
  let isAncestor=false;
  if(eventName==="workflow_run"&&SHA.test(String(parentSha??""))){
   try{execFileSync("git",["merge-base","--is-ancestor",parentSha,checkoutSha],
    {timeout:15000,stdio:"ignore"});isAncestor=true;}catch{}
  }
  const result=verifyTrustedGriContinuation({eventName,eventSha,checkoutSha,
    parentSha,isAncestor});
  console.log(JSON.stringify(result));
 }catch{
  console.error("::error::GRI_CONTINUATION_PARENT_NOT_TRUSTED_MAIN_ANCESTOR");
  process.exitCode=2;
 }
}
