#!/usr/bin/env node
// No credentials, source URL logs, payment headers, B2/D1 direct operations.
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {assessLiveNoFundsReadiness} from '../lib/commercial-live-preflight.mjs';
const BASE='https://geomacro.live';
const LIMIT=512000;
const SHA=/^[a-f0-9]{40}$/;
const QUERY={schema_version:'geomacro.agent-query.v1',
 subjects:[{type:'country',country_iso3:'USA'}],
 topics:['risk_object'],evidence:'required',detail:'compact'};
const ALLOWED=new Set(['/.well-known/geomacro-build.json','/api/health?deep=1',
 '/.well-known/x402.json','/api/x402/risk/availability']);
async function bounded(path,method='GET',body){
 if(!ALLOWED.has(path))throw Error('PREFLIGHT_ENDPOINT_NOT_ALLOWLISTED');
 let response;
 try{
  response=await fetch(BASE+path,{
   method,redirect:'error',cache:'no-store',
   headers:method==='POST'?{'content-type':'application/json',accept:'application/json'}:
    {accept:'application/json'},
   ...(method==='POST'?{body:JSON.stringify(body)}:{}),
   signal:AbortSignal.timeout(12000)
  });
 }catch{return {status:0,body:null};}
 if(Number(response.headers.get('content-length')||'0')>LIMIT)return {status:response.status,body:null};
 let content='';
 try{content=await response.text();}catch{return {status:response.status,body:null};}
 if(content.length>LIMIT)return {status:response.status,body:null};
 try{return {status:response.status,body:JSON.parse(content)};}
 catch{return {status:response.status,body:null};}
}
export async function main({env=process.env}={}){
 const canonicalSha=String(env.EXPECTED_CANONICAL_SHA||'').toLowerCase();
 if(!SHA.test(canonicalSha))throw Error('LIVE_PREFLIGHT_EXPECTED_SHA_REQUIRED');
 const build=await bounded('/.well-known/geomacro-build.json');
 const health=await bounded('/api/health?deep=1');
 const discovery=await bounded('/.well-known/x402.json');
 // A pre-existing explicitly no-charge availability endpoint, not an x402 purchase.
 const availability=await bounded('/api/x402/risk/availability','POST',QUERY);
 const receipt=assessLiveNoFundsReadiness({canonicalSha,build,health,discovery,availability});
 const file=resolve('artifacts/commercial/live-no-funds-go-no-go.json');
 await mkdir(dirname(file),{recursive:true});
 await writeFile(file,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify(receipt));
 if(receipt.status!=='READY_FOR_SEPARATE_OWNER_PAYMENT_ACCEPTANCE_NOT_LAUNCHED')process.exitCode=3;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 main().catch(()=>{console.error('LIVE_COMMERCIAL_NO_FUNDS_PREFLIGHT_FAILED_CLOSED');process.exitCode=3;});
}