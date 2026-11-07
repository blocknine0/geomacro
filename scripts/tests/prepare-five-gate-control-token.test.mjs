import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {prepareFiveGateControlToken} from '../ops/prepare-five-gate-control-token.mjs';

const ROOT='unit-test-disposable-root-material-only-very-long';
const derived=createHmac('sha256',ROOT).update('geomacro-control-plane-v1').digest('hex');
const base={
 GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'blocknine0/geomacro',
 GITHUB_REF:'refs/heads/main',GITHUB_ENV:'/tmp/github-test-env-file',
};
const ok={
 status:200,redirected:false,
 text:async()=>JSON.stringify({ok:true,schema:'geomacro.p0b.status.v1'}),
};
test('missing GitHub secret uses only existing root, proves Worker admin before export',async()=>{
 const seen=[],written=[],masked=[];
 const result=await prepareFiveGateControlToken({
  env:{...base,GEOMACRO_COMMERCE_LEDGER_TOKEN:ROOT},
  fetchImpl:async(url,init)=>{seen.push({url,init});return ok},
  appendEnv:(path,line)=>written.push({path,line}),
  mask:value=>masked.push(value),
 });
 assert.equal(result.status,'PASS');
 assert.equal(result.source,'DERIVED_FROM_EXISTING_LEDGER_ROOT');
 assert.equal(result.cloudflare_mutations,0);
 assert.equal(result.d1_writes,0);
 assert.equal(result.payments,0);
 assert.equal(seen.length,1);
 assert.match(seen[0].url,/^https:\/\/geomacro-control-plane\.daspallab202391\.workers\.dev\/v1\/internal\/p0b\/status$/u);
 assert.equal(seen[0].init.method,'GET');
 assert.equal(seen[0].init.headers.Authorization,'Bearer '+derived);
 assert.deepEqual(masked,[derived]);
 assert.deepEqual(written,[{path:base.GITHUB_ENV,line:'CONTROL_PLANE_TOKEN='+derived+'\n'}]);
 assert.doesNotMatch(JSON.stringify(result),new RegExp(derived,'u'));
 assert.doesNotMatch(JSON.stringify(result),new RegExp(ROOT,'u'));
});

test('already-existing valid GitHub secret takes precedence without rotating root',async()=>{
 const explicit='a'.repeat(64),observed=[];
 const result=await prepareFiveGateControlToken({
  env:{...base,CONTROL_PLANE_TOKEN:explicit,GEOMACRO_COMMERCE_LEDGER_TOKEN:ROOT},
  fetchImpl:async(_url,options)=>{observed.push(options.headers.Authorization);return ok},
  appendEnv:()=>{},mask:()=>{},
 });
 assert.equal(result.source,'EXISTING_GITHUB_SECRET');
 assert.deepEqual(observed,['Bearer '+explicit]);
});

test('mismatched live Worker credential refuses export with no mutation',async()=>{
 for(const status of [401,403,503]){
  const written=[],masked=[];
  await assert.rejects(
   prepareFiveGateControlToken({
    env:{...base,GEOMACRO_COMMERCE_LEDGER_TOKEN:ROOT},
    fetchImpl:async()=>({status,redirected:false}),
    appendEnv:(...args)=>written.push(args),mask:v=>masked.push(v),
   }),
   /RELEASE_CONTROL_PLANE_(?:SECRET_DOES_NOT_MATCH_WORKER|READONLY_STATUS_UNAVAILABLE)/u);
  assert.deepEqual(written,[]);
  assert.deepEqual(masked,[]);
 }
});

test('missing existing root or wrong runner identity refuses before any network',async()=>{
 const samples=[
  {...base},
  {...base,GEOMACRO_COMMERCE_LEDGER_TOKEN:'short'},
  {...base,GEOMACRO_COMMERCE_LEDGER_TOKEN:ROOT,GITHUB_REF:'refs/heads/feature'},
  {...base,GEOMACRO_COMMERCE_LEDGER_TOKEN:ROOT,GITHUB_ACTIONS:'false'},
 ];
 for(const env of samples){
  let called=false;
  await assert.rejects(prepareFiveGateControlToken({
   env,fetchImpl:async()=>{called=true;return ok},
   appendEnv:()=>{throw Error('UNEXPECTED_EXPORT')},mask:()=>{throw Error('UNEXPECTED_MASK')},
  }),/RELEASE_/u);
  assert.equal(called,false);
 }
});

test('protected workflow never runs auto-derivation on scheduled quota path',()=>{
 const file=readFileSync('.github/workflows/canary-promotion.yml','utf8');
 assert.match(file,/GEOMACRO_COMMERCE_LEDGER_TOKEN:\s*\$\{\{ secrets\.GEOMACRO_COMMERCE_LEDGER_TOKEN \}\}/u);
 assert.match(file,/if: github\.event_name == 'workflow_dispatch'/u);
 assert.match(file,/node scripts\/ops\/prepare-five-gate-control-token\.mjs/u);
 assert.doesNotMatch(file,/wrangler.*secret put CONTROL_PLANE_TOKEN/iu);
 assert.match(file,/test -f config\/d1-hotspot-v2-canary\.hold/u);
});
