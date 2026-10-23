#!/usr/bin/env node
// Read GitHub checkpoint metadata only. No issuer, database or signing requests.
import {execFileSync} from 'node:child_process';
import {appendFileSync,mkdtempSync,readFileSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {restoreScheduledCountry} from '../lib/continent-country-resume.mjs';
const repo='blocknine0/geomacro',token=process.env.GH_TOKEN;
if(process.env.GITHUB_REPOSITORY!==repo||process.env.GITHUB_REF!=='refs/heads/main'||
   !['schedule','push'].includes(process.env.GITHUB_EVENT_NAME)||!token||!process.env.GITHUB_OUTPUT)
 throw Error('COUNTRY_CURSOR_PROTECTED_SCHEDULE_OR_CANARY_ONLY');
async function github(path){
 const response=await fetch(`https://api.github.com/repos/${repo}${path}`,{
  redirect:'error',signal:AbortSignal.timeout(20000),headers:{
   Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json',
   'X-GitHub-Api-Version':'2022-11-28'}});
 if(!response.ok)throw Error('COUNTRY_CURSOR_GITHUB_READ_FAILED');
 const text=await response.text();
 if(text.length>2000000)throw Error('COUNTRY_CURSOR_METADATA_OVERSIZE');
 return JSON.parse(text);
}
async function download(runId,name){
 const dir=mkdtempSync(join(tmpdir(),'geomacro-country-cursor-'));
 try{
  execFileSync('gh',['run','download',String(runId),'-R',repo,'-n',name,'-D',dir],
   {stdio:'ignore',timeout:30000});
  const file=join(dir,'live-batch-checkpoint.v1.json');
  if(statSync(file).size>500000)throw Error('COUNTRY_CURSOR_CHECKPOINT_OVERSIZE');
  return JSON.parse(readFileSync(file,'utf8'));
 }finally{rmSync(dir,{recursive:true,force:true});}
}
const previous=await restoreScheduledCountry({continent:process.env.GEOMACRO_CONTINENT,
 registryText:readFileSync('src/lib/canonical-country-registry-195.ts','utf8'),github,download});
appendFileSync(process.env.GITHUB_OUTPUT,`previous_country=${previous||'INITIAL'}\n`);
console.log(JSON.stringify({continent:process.env.GEOMACRO_CONTINENT,
 previous_country:previous||null,mode:previous?'RESUME_AFTER_SUCCESSFUL_SCHEDULE':'FIRST_SCHEDULE',
 upstream_source_requests:0}));
