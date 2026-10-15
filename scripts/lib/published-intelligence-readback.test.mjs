import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyPublishedIntelligenceReadback} from './published-intelligence-readback.mjs';

const now=Date.parse('2026-10-15T12:00:00.000Z');
const bytes=JSON.stringify({schema:'geomacro.public-intelligence-live.v1',generated_at:'2026-10-15T11:30:00.000Z',rows:[]});
const digest=createHash('sha256').update(bytes).digest('hex');
const receipt={ok:true,full_b2_readback_verified:true,exact_gzip_restore_verified:true,
 d1_hot_snapshot_published:true,supabase_reads:0,supabase_writes:0,
 external_payment_executed:false,b2_sha256:'a'.repeat(64),payload_sha256:digest,
 source_as_of:'2026-10-15T11:00:00.000Z'};
const live={ok:true,product:'intelligence',proof_schema:'geomacro.public-intelligence-live-proof.v1',
 b2_sha256:receipt.b2_sha256,payload_sha256:digest,
 full_b2_readback_verified:true,exact_gzip_restore_verified:true,current_b2_snapshot_promoted:true,
 source_as_of:receipt.source_as_of,expires_at:'2026-10-15T13:00:00.000Z',payload_json:bytes};
const options={now:()=>now};

test('publication is accepted only after exact unauthenticated public D1 readback',async()=>{
 let requests=0;
 const result=await verifyPublishedIntelligenceReadback(receipt,{...options,
  fetchImpl:async(url,opts)=>{
   requests++;
   assert.equal(url,'https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/hot-snapshot/intelligence');
   assert.equal(opts.redirect,'error');
   assert.equal(opts.headers.Authorization,undefined);
   assert.equal(opts.headers['Cache-Control'],'no-cache');
   return Response.json(live);
  },
 });
 assert.equal(requests,1);
 assert.equal(result.d1_public_readback_verified,true);
 assert.equal(result.external_payment_executed,false);
 assert.equal(JSON.stringify(result).includes('payload_json'),false);
});

test('invalid publisher receipt makes zero public requests',async()=>{
 for(const change of [{ok:false},{full_b2_readback_verified:false},
  {exact_gzip_restore_verified:false},{d1_hot_snapshot_published:false},
  {supabase_reads:1},{supabase_writes:1},{external_payment_executed:true},
  {payload_sha256:'bad'},{source_as_of:null}]){
  await assert.rejects(verifyPublishedIntelligenceReadback({...receipt,...change},
   {...options,fetchImpl:()=>{throw Error('MUST_NOT_FETCH')}}),/READBACK_UNVERIFIED/);
 }
});

test('HTTP failure, wrong payload/proof/hash, expiration and future/stale source fail closed',async()=>{
 const changes=[{ok:false},{product:'global-risk'},{proof_schema:'other'},
  {b2_sha256:'b'.repeat(64)},{payload_sha256:'c'.repeat(64)},
  {payload_json:bytes+' '},{full_b2_readback_verified:false},
  {exact_gzip_restore_verified:false},{current_b2_snapshot_promoted:false},
  {source_as_of:'2026-10-15T10:59:00.000Z'},
  {expires_at:new Date(now).toISOString()},{expires_at:'invalid'}];
 for(const change of changes){
  await assert.rejects(verifyPublishedIntelligenceReadback(receipt,{
   ...options,fetchImpl:async()=>Response.json({...live,...change}),
  }),/READBACK_UNVERIFIED/);
 }
 for(const status of [401,403,429,503]){
  await assert.rejects(verifyPublishedIntelligenceReadback(receipt,{
   ...options,fetchImpl:async()=>new Response('private upstream',{status}),
  }),/READBACK_UNVERIFIED/);
 }
 for(const clock of [now+7*3600000,now-2*3600000,NaN]){
  await assert.rejects(verifyPublishedIntelligenceReadback(receipt,{
   ...options,now:()=>clock,fetchImpl:async()=>Response.json(live),
  }),/READBACK_UNVERIFIED/);
 }
});

// Use the deployed route implementation, whose public contract intentionally
// omits source_run_id. This guards against inventing public metadata in mocks.
test('accepts the actual Worker public serving contract without requiring private metadata',async()=>{
 const {default:worker}=await import('../../workers/control-plane/src/index.mjs');
 const row={product:'intelligence',schema_name:'geomacro.public-intelligence-live.v1',
  proof_schema:'geomacro.public-intelligence-live-proof.v1',generated_at:'2026-10-15T11:30:00.000Z',
  source_as_of:receipt.source_as_of,expires_at:live.expires_at,
  b2_object_key:'geomacro-evidence/v1/live/public-intelligence/latest.json.gz',
  b2_sha256:receipt.b2_sha256,payload_sha256:digest,source_run_id:'1234',
  payload_json:bytes,verified_at:'2026-10-15T11:31:00.000Z'};
 const env={DB:{prepare:()=>({bind:()=>({first:async()=>row})})}};
 // The route evaluates Date.now(), so freeze it only for this isolated test.
 const originalNow=Date.now;Date.now=()=>now;
 try{
  const result=await verifyPublishedIntelligenceReadback(receipt,{...options,
   fetchImpl:async(url,opts)=>{
    const response=await worker.fetch(new Request(url,opts),env);
    assert.equal(response.status,200);
    assert.equal((await response.clone().json()).source_run_id,undefined);
    return response;
   },
  });
  assert.equal(result.d1_public_readback_verified,true);
 }finally{Date.now=originalNow;}
});
