import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateKeyPairSync} from 'node:crypto';
import {observedD1Day,main} from '../verify-d1-quota-proof.ts';
import {verifySignedEnvelopeFile,D1_DAILY_READ_CEILING} from '../release-common.ts';

// OFFLINE ONLY. Disposable tokens, static GraphQL responses, fake day and
// signer; cannot certify provider usage or substitute production evidence.
const DAY='2026-11-06';
const ACCOUNT='a'.repeat(32);
const PRIMARY='p'.repeat(40);
const SECONDARY='s'.repeat(40);
const fixture=(rowsRead=100,rowsWritten=10,day=DAY)=>({
 data:{viewer:{accounts:[{d1AnalyticsAdaptiveGroups:[{
  dimensions:{date:day,databaseId:'d'.repeat(32)},
  sum:{rowsRead,rowsWritten},
 }]}]}}
});
const denied={errors:[{message:'not authorized for that account'}]};
const response=body=>({ok:true,status:200,redirected:false,json:async()=>body});
async function withScenario({primary=PRIMARY,secondary=SECONDARY,answer},run){
 const saved={fetch:globalThis.fetch,acct:process.env.CLOUDFLARE_ACCOUNT_ID,
  main:process.env.CLOUDFLARE_BILLING_READ_TOKEN,
  second:process.env.CLOUDFLARE_API_TOKEN,
  signing:process.env.SIGNING_JWK};
 try{
  process.env.CLOUDFLARE_ACCOUNT_ID=ACCOUNT;
  process.env.CLOUDFLARE_BILLING_READ_TOKEN=primary;
  process.env.CLOUDFLARE_API_TOKEN=secondary;
  const calls=[];
  globalThis.fetch=async (url,init)=>{
   assert.equal(url,'https://api.cloudflare.com/client/v4/graphql');
   assert.equal(init.method,'POST');
   const bearer=init.headers.Authorization;
   const body=JSON.parse(init.body);
   assert.equal(body.variables.accountTag,ACCOUNT);
   assert.equal(body.variables.start,body.variables.end);
   calls.push(bearer);
   return response(await answer(bearer,body));
  };
  return await run(calls);
 }finally{
  globalThis.fetch=saved.fetch;
  for(const [k,v] of [['CLOUDFLARE_ACCOUNT_ID',saved.acct],
   ['CLOUDFLARE_BILLING_READ_TOKEN',saved.main],
   ['CLOUDFLARE_API_TOKEN',saved.second],['SIGNING_JWK',saved.signing]]){
   if(v===undefined)delete process.env[k];else process.env[k]=v;
  }
 }
}

test('access denied primary tries existing secondary, requires real complete same-account date result',async()=>{
 await withScenario({answer:bearer=>
   bearer==='Bearer '+PRIMARY?denied:fixture()},async calls=>{
  const proof=await observedD1Day(DAY);
  assert.equal(proof.analytics_credential_source,'EXISTING_ACCOUNT_API_TOKEN');
  assert.equal(proof.rows_read,100);
  assert.equal(proof.rows_written,10);
  assert.deepEqual(calls,['Bearer '+PRIMARY,'Bearer '+SECONDARY]);
  assert.doesNotMatch(JSON.stringify(proof),/p{20}|s{20}/u);
 });
});

test('working primary never sends second protected credential',async()=>{
 await withScenario({answer:()=>fixture()},async calls=>{
  const proof=await observedD1Day(DAY);
  assert.equal(proof.analytics_credential_source,'BILLING_READ_TOKEN');
  assert.deepEqual(calls,['Bearer '+PRIMARY]);
 });
});

test('both denied gives explicit HOLD and never accepts partial or fake quota',async()=>{
 await withScenario({answer:()=>denied},async calls=>{
  await assert.rejects(observedD1Day(DAY),/D1_PROOF_BOTH_EXISTING_CREDENTIALS_DENIED/u);
  assert.deepEqual(calls,['Bearer '+PRIMARY,'Bearer '+SECONDARY]);
 });
});

test('two identical tokens refuse repeated provider request',async()=>{
 await withScenario({secondary:PRIMARY,answer:()=>denied},async calls=>{
  await assert.rejects(observedD1Day(DAY),/D1_PROOF_NO_DISTINCT_EXISTING_CREDENTIAL/u);
  assert.deepEqual(calls,['Bearer '+PRIMARY]);
 });
});

test('secondary provider data must still satisfy strict complete-day receipt contract',async()=>{
 await withScenario({answer:bearer=>bearer==='Bearer '+PRIMARY?denied:
   fixture(100,10,'2026-11-05')},async calls=>{
  await assert.rejects(observedD1Day(DAY),/D1_PROOF_GROUP_INVALID/u);
  assert.equal(calls.length,2);
 });
});

test('real-format above Paid owner daily ceiling produces signed HOLD, not a PASS',async()=>{
 const closed=new Date(Date.now()-2*86400000).toISOString().slice(0,10);
 const overLimit=D1_DAILY_READ_CEILING+1;
 assert.equal(D1_DAILY_READ_CEILING,580_000_000);
 const pair=generateKeyPairSync('ed25519');
 const originalDir=process.cwd();
 const dir=mkdtempSync(join(tmpdir(),'geomacro-d1-auth-fallback-'));
 try{
  await withScenario({answer:bearer=>
   bearer==='Bearer '+PRIMARY?denied:fixture(overLimit,32,closed)},async calls=>{
   process.chdir(dir);
   process.env.SIGNING_JWK=JSON.stringify(pair.privateKey.export({format:'jwk'}));
   await assert.rejects(main([closed]),/D1_PROOF_PAID_OWNER_DAILY_CEILING_BREACH/u);
   const saved=join(dir,'artifacts','release','d1-quota-proof-'+closed+'.json');
   const envelope=JSON.parse(readFileSync(saved,'utf8'));
   assert.equal(envelope.payload.status,'HOLD');
   assert.equal(envelope.payload.rows_read,overLimit);
   assert.equal(envelope.payload.analytics_credential_source,'EXISTING_ACCOUNT_API_TOKEN');
   assert.throws(()=>verifySignedEnvelopeFile(saved),/RELEASE_SIGNED_RECEIPT_UNVERIFIED/u);
   assert.equal(calls.length,2);
  });
 }finally{process.chdir(originalDir);rmSync(dir,{recursive:true,force:true})}
});
