#!/usr/bin/env node
/** Parallel READ-ONLY / NO-FUNDS acceptance. Mutations are separate jobs. */
import {spawn} from 'node:child_process';
import {persist,holdError,need} from './release-common.ts';
const CHECKS=[
 ['d1_schema','scripts/apply-d1-migrations.ts',['--verify']],
 ['d1_utc_24h','scripts/verify-d1-quota-proof.ts',[]],
 ['b2_physical_parity','scripts/certify-b2-parity.ts',[]],
 ['hot50_signed_facts','src/risk/hot50Attestation.ts',[]],
 ['worker_zero_canary','scripts/canary-promoter.ts',[]],
] as const;
function execute(name:string,file:string,args:readonly string[]){
 return new Promise(resolve=>{
  const child=spawn(process.execPath,['--experimental-strip-types',file,...args],{
   cwd:process.cwd(),stdio:['ignore','pipe','pipe'],env:process.env});
  let out='',err='';
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',(x:string)=>{out=(out+x).slice(-3000)});
  child.stderr.on('data',(x:string)=>{err=(err+x).slice(-3000)});
  child.on('error',()=>resolve({name,status:'HOLD',code:'RELEASE_CHILD_FAILED'}));
  child.on('close',code=>{
   // Only return verified structured output, not provider error bodies.
   let status='HOLD',reason='RELEASE_CHECK_NOT_PASSED';
   try{const last=out.trim().split('\n').at(-1);const v=JSON.parse(last??'{}');
    if(code===0&&v.status==='PASS')status='PASS';
   }catch{}
   if(status==='HOLD')try{const last=err.trim().split('\n').at(-1);const v=JSON.parse(last??'{}');
    if(/^[A-Z][A-Z0-9_]{6,100}$/.test(v.code??''))reason=v.code;
   }catch{}
   resolve({name,status,reason,exit_code:code});
  });
 });
}
async function main(){
 need(process.argv.length===2,'RELEASE_PARALLEL_AUDIT_ARGUMENT_INVALID');
 const checked=await Promise.all(CHECKS.map(([name,file,args])=>execute(name,file,args)));
 const pass=checked.every((x:any)=>x.status==='PASS');
 const output={schema:'geomacro.release.parallel-readonly.v1',status:pass?'PASS':'HOLD',
  no_funds:true,mutation_operations:0,checked_at:new Date().toISOString(),checks:checked,
  blocked_production_dependencies_must_not_be_inferred_pass:true};
 persist('artifacts/release/parallel-remediation-report.json',output);
 console.log(JSON.stringify({status:output.status,checks:checked,report:'artifacts/release/parallel-remediation-report.json'}));
 if(!pass)process.exitCode=2;
}
main().catch(e=>{console.error(JSON.stringify({status:'HOLD',code:holdError(e)}));process.exitCode=2});