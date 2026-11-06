#!/usr/bin/env bun
/** Protected, no-funds consumer. Existing decisions read current signed state
 * directly; this preparation outbox never sits in the query execution path. */
import {createPrivateKey,createPublicKey,sign,verify} from 'node:crypto';
import {createSigningJobDb,claimSigningJob,finishSigningJob,retrySigningJob} from '../lib/gro-auto-signing-jobs.mjs';
import {publishPinnedMachineGroProduction} from './publish-qualified-machine-gro-production';
import {pinnedRiskObjectVerificationKeys} from '../../src/lib/risk-object-public-registry';
export function assertAutomaticSignerReady(env=process.env){
 if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_REPOSITORY!=='blocknine0/geomacro'||env.GITHUB_REF!=='refs/heads/main')
  throw Error('GRO_AUTO_SIGNING_PROTECTED_MAIN_REQUIRED');
 const id=env.RISK_OBJECT_SIGNING_KEY_ID,pub=env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64;
 const trusted=pinnedRiskObjectVerificationKeys();
 const expected=trusted[id??''];
 const expectedPub=typeof expected==='string'?expected:expected?.public_key_spki_b64;
 if(!id||!pub||pub!==expectedPub||typeof expected!=='string'&&expected?.status!=='active')throw Error('GRO_AUTO_SIGNING_TRUST_PIN_MISSING');
 const privateKey=createPrivateKey({key:Buffer.from(env.RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64??'','base64'),format:'der',type:'pkcs8'});
 if(createPublicKey(privateKey).export({format:'der',type:'spki'}).toString('base64')!==pub)
  throw Error('GRO_AUTO_SIGNING_KEY_PAIR_MISMATCH');
 const probe=Buffer.from('GeoMacro protected signing capability check');
 if(!verify(null,probe,createPublicKey(privateKey),sign(null,probe,privateKey)))throw Error('GRO_AUTO_SIGNING_SELF_CHECK_FAILED');
}
export async function runAutomaticGroSigning(){
 assertAutomaticSignerReady();
 const db=createSigningJobDb(),start=Date.now();
 const runId=String(process.env.GITHUB_RUN_ID)+":"+String(process.env.GITHUB_RUN_ATTEMPT??"1");
 const sourceSha=String(process.env.GITHUB_SHA??"");
 if(!/^[0-9]+:[0-9]+$/.test(runId)||!/^[a-f0-9]{40}$/.test(sourceSha))throw Error('GRO_AUTO_SIGNING_RUN_INVALID');
 await db.query("INSERT OR IGNORE INTO gro_auto_signing_cycles(run_id,source_sha,started_at,signer_key_id,signer_pair_verified,state) VALUES(?,?,?,?,1,'RUNNING')",
  [runId,sourceSha,new Date(start).toISOString(),process.env.RISK_OBJECT_SIGNING_KEY_ID]);
 const report={schema:'geomacro.automatic-gro-signing-cycle.v1',signer_pair_verified:true,
  claimed:0,signed:0,failed:0,no_funds:true,payment_performed:false};
 for(let index=0;index<50&&Date.now()-start<20*60000;index++){
  const job=await claimSigningJob(db);
  if(!job)break;
  report.claimed++;
  try{
   const result=await publishPinnedMachineGroProduction(job.b2_key,job.input_sha256);
   await finishSigningJob(db,job,result);report.signed++;
  }catch{await retrySigningJob(db,job);report.failed++;}
 }
 await db.query("UPDATE gro_auto_signing_cycles SET finished_at=?,claimed=?,signed=?,failed=?,state=? WHERE run_id=?",
  [new Date().toISOString(),report.claimed,report.signed,report.failed,report.failed?'PARTIAL':'DONE',runId]);
 console.log(JSON.stringify(report));
 if(report.failed)process.exitCode=1;
 return report;
}
if(import.meta.main)runAutomaticGroSigning().catch(()=>{
 console.error('GRO_AUTOMATIC_SIGNING_CYCLE_UNAVAILABLE');process.exitCode=1;
});
