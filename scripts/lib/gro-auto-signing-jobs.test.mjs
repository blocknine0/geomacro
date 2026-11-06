import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {enqueueSigningJob,claimSigningJob,finishSigningJob,retrySigningJob} from './gro-auto-signing-jobs.mjs';
const now=Date.parse('2026-11-06T12:00:00Z'),sha='a'.repeat(64),key='geomacro-evidence/v1/private/machine-gro-qualified/'+sha+'.json';
function setup(){const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../../workers/control-plane/migrations/0129_gro_auto_signing_jobs.sql',import.meta.url),'utf8'));
 return {sqlite,db:{async query(sql,args=[]){return sqlite.prepare(sql).all(...args)}}};}
const input={sha256:sha,key,country_iso3:'USA',expires_at:new Date(now+3600000).toISOString()};
const result={ok:true,country_iso3:'USA',record_sha256:'b'.repeat(64),gro_expires_at:new Date(now+3*3600000).toISOString(),
 b2_archive_readback_verified:true,canonical_d1_hot_readback_verified:true,live_worker_signed_hot_verified:true};
test('durable immutable input deduplicates and only one competing claim wins',async()=>{
 const {db,sqlite}=setup();try{
  await enqueueSigningJob(db,input,now);await enqueueSigningJob(db,input,now);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM gro_auto_signing_jobs').get().n,1);
  const claims=await Promise.all([claimSigningJob(db,{now}),claimSigningJob(db,{now})]);
  assert.equal(claims.filter(Boolean).length,1);
  await finishSigningJob(db,claims.find(Boolean),result,now);
  assert.equal(await claimSigningJob(db,{now:now+60000}),null);
  assert.equal(sqlite.prepare('SELECT state FROM gro_auto_signing_jobs').get().state,'SIGNED');
 }finally{sqlite.close()}
});
test('crash lease recovery fences off the earlier signer completion',async()=>{
 const {db,sqlite}=setup();try{
  await enqueueSigningJob(db,input,now);
  const old=await claimSigningJob(db,{now});
  const fresh=await claimSigningJob(db,{now:now+31*60000});
  assert.ok(fresh);assert.notEqual(old.lease_token,fresh.lease_token);
  await assert.rejects(()=>finishSigningJob(db,old,result,now+31*60000),/LEASE_LOST/);
  await finishSigningJob(db,fresh,result,now+31*60000);
 }finally{sqlite.close()}
});
test('failed readback cannot mark SIGNED, retry has backoff, and expired input is not signed',async()=>{
 const {db,sqlite}=setup();try{
  await enqueueSigningJob(db,input,now);const job=await claimSigningJob(db,{now});
  await assert.rejects(()=>finishSigningJob(db,job,{...result,b2_archive_readback_verified:false},now),/PUBLICATION_UNVERIFIED/);
  await retrySigningJob(db,job,now);
  assert.equal(await claimSigningJob(db,{now:now+1000}),null);
  assert.ok(await claimSigningJob(db,{now:now+60000}));
  // Simulate a failed lease later returning to retry after input expiration.
  const active=sqlite.prepare('SELECT * FROM gro_auto_signing_jobs').get();
  await retrySigningJob(db,active,now+3600001);
  assert.equal(await claimSigningJob(db,{now:now+3600002}),null);
  assert.equal(sqlite.prepare('SELECT state FROM gro_auto_signing_jobs').get().state,'EXPIRED');
 }finally{sqlite.close()}
});
