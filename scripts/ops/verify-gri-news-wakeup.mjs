#!/usr/bin/env node
// News completion is a wakeup only. Execute canonical main, never artifacts
// or code from a completed workflow; signed numerical admission stays separate.
import {readFileSync,appendFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const REPO='blocknine0/geomacro';
const SHA=/^[a-f0-9]{40}$/u;
export const GRI_NEWS_WORKFLOWS=Object.freeze([
 'Auto Ingest News','Five-Minute Original News Fastlane',
 // Both existing D1 newsroom writers must wake exact derived-input signer.
 // These completion events prove only trusted source ancestry, never signed
 // Facts/Rights, numerical GRI eligibility or a commercial licence.
 'Website Derived News Continuity',
 'Website Derived News Cadence Backstop',
 // Genuine publisher HTML/native-clock private intake can wake the already
 // one-time-consented machine derived audit. It NEVER creates a numerical
 // human GRI signature, new rights or a payable offer.
 'Current Original Private Signing Review Intake (No Funds)',
 ...['Africa','Asia','Europe','North America','South America','Oceania']
  .map(c=>`${c} Country Source Sweep (Every 2 Hours)`),
]);
export function verifyGriNewsWakeup({env,event={},checkoutSha,isAncestor=false}={}){
 if(env?.GITHUB_REPOSITORY!==REPO||env.GITHUB_REF!=='refs/heads/main'||
    !SHA.test(checkoutSha??'')||checkoutSha!==env.GITHUB_SHA)
  throw Error('GRI_NEWS_WAKEUP_CANONICAL_MAIN_REQUIRED');
 const kind=env.GITHUB_EVENT_NAME;
 if(!['schedule','workflow_dispatch','push','workflow_run'].includes(kind))
  throw Error('GRI_NEWS_WAKEUP_EVENT_REJECTED');
 if(kind==='workflow_run'){
  const run=event.workflow_run;
  if(!GRI_NEWS_WORKFLOWS.includes(run?.name)||run.conclusion!=='success'||
     run.head_repository?.full_name!==REPO||run.head_branch!=='main'||
     !(['schedule','workflow_dispatch','push'].includes(run.event) ||
       (run.event==='workflow_run' &&
        ['Website Derived News Continuity',
         'Website Derived News Cadence Backstop'].includes(run.name)))||
     !SHA.test(run.head_sha??'')||isAncestor!==true)
   throw Error('GRI_NEWS_WAKEUP_TRUSTED_ANCESTOR_REQUIRED');
 }
 return Object.freeze({schema:'geomacro.gri-news-wakeup.v1',
  allowed:true,news_workflow_ancestry_verified:kind==='workflow_run',
  signed_gri_input_verified:false,published:false,b2_requests:0,d1_writes:0,payments:0});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const env=process.env;
  const event=env.GITHUB_EVENT_NAME==='workflow_run'?
   JSON.parse(readFileSync(env.GITHUB_EVENT_PATH,'utf8')):{};
  const checkoutSha=execFileSync('git',['rev-parse','HEAD'],{
   encoding:'utf8',timeout:15000,stdio:['ignore','pipe','pipe']}).trim();
  let isAncestor=false;
  if(SHA.test(event.workflow_run?.head_sha??'')){
   try{execFileSync('git',['merge-base','--is-ancestor',event.workflow_run.head_sha,checkoutSha],
    {timeout:15000,stdio:'ignore'});isAncestor=true;}catch{}
  }
  const result=verifyGriNewsWakeup({env,event,checkoutSha,isAncestor});
  if(env.GITHUB_ENV)appendFileSync(env.GITHUB_ENV,
   `GRI_SOURCE_WORKFLOW_VERIFIED=${result.news_workflow_ancestry_verified?'1':'0'}\n`+
   `MACHINE_SOURCE_WORKFLOW_VERIFIED=${result.news_workflow_ancestry_verified?'1':'0'}\n`);
  console.log(JSON.stringify(result));
 }catch{
  console.error('GRI_NEWS_WAKEUP_REJECTED_NO_SIGNED_PUBLISHER_ADMISSION');
  process.exitCode=2;
 }
}
