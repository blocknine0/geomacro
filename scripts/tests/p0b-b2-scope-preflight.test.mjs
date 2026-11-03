import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deriveP0bB2Scope,runP0bB2Preflight} from '../ops/p0b-b2-scope-preflight.mjs';
const bucket='geomacro-private-archive';
const s3='https://s3.us-east-005.backblazeb2.com';
function auth(prefix='',capabilities=['readFiles','writeFiles'],buckets=[{name:bucket}]){
 return {apiInfo:{storageApi:{s3ApiUrl:s3,allowed:{
  namePrefix:prefix,capabilities,buckets
 }}}};
}
test('P0-B adapts existing scoped B2 key without escaping its private prefix',()=>{
 assert.deepEqual(deriveP0bB2Scope(auth('geomacro-evidence/v1/private/'),bucket),{
  prefix:'geomacro-evidence/v1/private/spool/',endpoint:s3,restricted:true
 });
 assert.deepEqual(deriveP0bB2Scope(auth(''),bucket),{
  prefix:'spool/',endpoint:s3,restricted:false
 });
});
test('P0-B rejects wrong archive bucket, read-only key, hostile prefix and unknown endpoint',()=>{
 assert.throws(()=>deriveP0bB2Scope(auth('', ['readFiles']),bucket),/P0B_B2_KEY_REQUIRES_READ_AND_WRITE/u);
 assert.throws(()=>deriveP0bB2Scope(auth('',['readFiles','writeFiles'],[{name:'other-bucket'}]),bucket),/P0B_B2_KEY_NOT_AUTHORIZED_FOR_ARCHIVE_BUCKET/u);
 assert.throws(()=>deriveP0bB2Scope(auth('../secret/'),bucket),/P0B_B2_KEY_PREFIX_UNSUPPORTED/u);
 const invalid=auth();invalid.apiInfo.storageApi.s3ApiUrl='https://evil.invalid';
 assert.throws(()=>deriveP0bB2Scope(invalid,bucket),/P0B_B2_S3_ENDPOINT_INVALID/u);
});
test('P0-B remote preflight reserves account-wide auth quota BEFORE reading Backblaze rights',async()=>{
 const called=[],written=[];
 const env={ROOT_LEDGER_TOKEN:'R'.repeat(48),P0B_B2_KEY_ID:'keyid-test',
  P0B_B2_APPLICATION_KEY:'long-test-credential-secret',
  P0B_B2_BUCKET:bucket,GITHUB_ENV:'/fake/github_env'};
 const fetchImpl=async (url,opts)=>{
  called.push({url,opts});
  if(called.length===1){
   assert.match(url,/\/v1\/b2-quota\/reserve$/u);
   assert.equal(JSON.parse(opts.body).kind,'NATIVE_AUTH');
   return Response.json({ok:true,reserved:true});
  }
  assert.equal(called.length,2);
  assert.equal(url,'https://api.backblazeb2.com/b2api/v4/b2_authorize_account');
  assert.match(opts.headers.Authorization,/^Basic /u);
  return Response.json(auth('geomacro-evidence/v1/private/'));
 };
 const receipt=await runP0bB2Preflight(env,{fetchImpl,append:(p,s)=>written.push([p,s])});
 assert.equal(receipt.ok,true);
 assert.equal(receipt.restricted_prefix_adapted,true);
 assert.equal(called.length,2);
 assert.deepEqual(written.map(x=>x[1]),[
  'P0B_SPOOL_PREFIX=geomacro-evidence/v1/private/spool/\n',
  'P0B_S3_ENDPOINT='+s3+'\n'
 ]);
});
test('P0-B preflight stops before Backblaze if the D1 quota governor refuses',async()=>{
 const env={ROOT_LEDGER_TOKEN:'R'.repeat(48),P0B_B2_KEY_ID:'keyid-test',
  P0B_B2_APPLICATION_KEY:'long-test-credential-secret',
  P0B_B2_BUCKET:bucket,GITHUB_ENV:'/fake/github_env'};
 let count=0;
 await assert.rejects(()=>runP0bB2Preflight(env,{fetchImpl:async ()=>{
  count++;return Response.json({ok:false,reserved:false},{status:429});
 },append:()=>{throw Error('SHOULD_NOT_WRITE')}}),/P0B_B2_NATIVE_AUTH_RESERVATION_HTTP_429/u);
 assert.equal(count,1);
});
