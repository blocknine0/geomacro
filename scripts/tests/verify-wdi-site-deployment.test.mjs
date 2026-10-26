import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectPublishedWdiBuild,probePublishedWdiBuild} from '../ops/verify-wdi-site-deployment.mjs';
const SHA='0123456789abcdef0123456789abcdef01234567';
const OTHER='abcdef0123456789abcdef0123456789abcdef01';
const payload=(sha=SHA)=>({schema_version:'geomacro.deployment-build.v1',
 canonical_repository:'blocknine0/geomacro',canonical_main_sha:sha});
test('WDI deployment requires actual published SHA, never a GitHub merge claim',()=>{
 const exact=inspectPublishedWdiBuild({status:200,payload:payload(),expectedSha:SHA});
 assert.equal(exact.status,'DEPLOYED_MAIN_SHA_MATCH');
 assert.equal(exact.deployed_main_sha_match,true);
 const old=inspectPublishedWdiBuild({status:200,payload:payload(OTHER),expectedSha:SHA});
 assert.equal(old.status,'DEPLOYED_SHA_DIFFERS');
 assert.equal(old.deployed_main_sha_match,false);
 assert.equal(old.observed_sha_short,OTHER.slice(0,12));
 for(const bad of [
  {status:503,payload:payload()},
  {status:200,payload:{...payload(),canonical_repository:'attacker/geomacro'}},
  {status:200,payload:{...payload(),schema_version:'invalid'}},
  {status:200,payload:{...payload(),canonical_main_sha:'not-a-sha'}},
  {status:200,payload:null},
 ])assert.equal(inspectPublishedWdiBuild({...bad,expectedSha:SHA}).deployed_main_sha_match,false);
 assert.throws(()=>inspectPublishedWdiBuild({status:200,payload:payload(),expectedSha:'bad'}));
});
test('build diagnostic uses one fixed public GET; no WDI provider, D1 or commercial calls',async()=>{
 const requests=[];
 const res=await probePublishedWdiBuild({expectedSha:SHA,fetchImpl:async(url,options)=>{
   requests.push({url,method:options.method,redirect:options.redirect});
   return new Response(JSON.stringify(payload()),{status:200});
 }});
 assert.deepEqual(requests,[{url:'https://geomacro.live/.well-known/geomacro-build.json',
   method:'GET',redirect:'error'}]);
 assert.equal(res.status,'DEPLOYED_MAIN_SHA_MATCH');
 assert.equal(res.external_provider_requests,0);
 assert.equal(res.d1_writes+res.b2_requests+res.payments,0);
 assert.equal(res.wdi_source_data_health_verified_separately,true);
 const unavailable=await probePublishedWdiBuild({expectedSha:SHA,
   fetchImpl:async()=>{throw Error('no network');}});
 assert.equal(unavailable.status,'DEPLOYMENT_READBACK_UNAVAILABLE');
 assert.equal(unavailable.deployed_main_sha_match,false);
});
test('overlarge or malformed site payload cannot impersonate production',async()=>{
 for(const body of [''.padEnd(9000,'x'),'{invalid']){
  const report=await probePublishedWdiBuild({expectedSha:SHA,
    fetchImpl:async()=>new Response(body,{status:200})});
  assert.equal(report.status,'DEPLOYMENT_READBACK_UNAVAILABLE');
  assert.equal(report.deployed_main_sha_match,false);
 }
});
