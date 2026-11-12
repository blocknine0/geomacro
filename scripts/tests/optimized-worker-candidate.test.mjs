import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateConfig,verifyCandidateBindings,prepareCandidate,uploadedVersionIdFromWranglerEvents} from '../ops/prepare-optimized-worker-candidate.mjs';
import {reviewedHot50CandidateVars,REVIEWABLE_ADDITIVE_SECRETS}
 from '../lib/canary-additive-binding-parity.mjs';
const sha='a'.repeat(40);
const baseline={resources:{script_runtime:{compatibility_date:'2026-10-03',compatibility_flags:[]},bindings:[
 {name:'DB',type:'d1',id:'canonical-db'},
 {name:'CONTROL_PLANE_TOKEN',type:'secret_text'},
 {name:'PAYMENT_ENABLED',type:'plain_text',text:'0'},
 {name:'GEOMACRO_SOURCE_SHA',type:'plain_text',text:'b'.repeat(40)}]}};
const candidate=()=>{const v=structuredClone(baseline);
 for(const [name,text] of Object.entries(reviewedHot50CandidateVars(sha))){
  const row=v.resources.bindings.find(x=>x.name===name);
  if(row)row.text=text;
  else v.resources.bindings.push({name,type:'plain_text',text});
 }
 return v;
};
test('candidate inherits all production secrets/resources/flags without copying values',()=>{
 const config=candidateConfig(baseline,sha);
 assert.deepEqual(config.vars,reviewedHot50CandidateVars(sha));
 assert.deepEqual(config.unsafe.bindings,[{name:'DB',type:'inherit'},
  {name:'CONTROL_PLANE_TOKEN',type:'inherit'},{name:'PAYMENT_ENABLED',type:'inherit'}]);
 assert.doesNotMatch(JSON.stringify(config),/canonical-db|secret_text/);
 assert.equal(config.vars.RISK_STREAM_ACTIVE,'1');
 assert.equal(config.vars.STREAM_INGESTION_ENABLED,'true');
 assert.equal(config.vars.RISK_STREAM_HOT50_AUTONOMOUS_ENABLED,'1');
 assert.equal(config.vars.GEOMACRO_COMMERCIAL_STREAM_RELEASE,'0');
 assert.equal(config.vars.RISK_STREAM_CANARY_HOLD_CLEARED,'0');
 assert.equal(config.vars.RISK_STREAM_SEVEN_DAY_ARCHIVE_APPROVED,'0');
 assert.equal(verifyCandidateBindings(baseline,candidate(),sha),true);
});
test('same binding names cannot conceal resource changes or payment activation',()=>{
 for(const [name,field,value] of [['DB','id','other-db'],['PAYMENT_ENABLED','text','1']]){
  const changed=candidate();changed.resources.bindings.find(x=>x.name===name)[field]=value;
  assert.throws(()=>verifyCandidateBindings(baseline,changed,sha),/RESOURCE_OR_VALUE_CHANGED/);
 }
 const changed=candidate();changed.resources.script_runtime.compatibility_date='2026-11-07';
 assert.throws(()=>verifyCandidateBindings(baseline,changed,sha),/SCRIPT_RUNTIME_CHANGED/);
 const duplicate=candidate();duplicate.resources.bindings.push(duplicate.resources.bindings[0]);
 assert.throws(()=>verifyCandidateBindings(baseline,duplicate,sha),/COUNT_CHANGED/);
});
test('candidate cannot upload from unprotected branch before provider access',async()=>{
 let calls=0;
 await assert.rejects(prepareCandidate({env:{},fetchImpl:async()=>{calls++}}),/PROTECTED_MAIN_REQUIRED/);
 assert.equal(calls,0);
});

test('candidate preserves enabled production cache and cross-version isolation',()=>{
 const live=structuredClone(baseline);
 live.resources.script_runtime.cache_options={enabled:true,cross_version_cache:false};
 const config=candidateConfig(live,sha);
 assert.deepEqual(config.cache,{enabled:true,cross_version_cache:false});
 const wrong=candidate();
 assert.throws(()=>verifyCandidateBindings(live,wrong,sha),/SCRIPT_RUNTIME_CHANGED/);
 const correct=candidate();correct.resources.script_runtime.cache_options=structuredClone(config.cache);
 assert.equal(verifyCandidateBindings(live,correct,sha),true);
});

test('protected candidate receives existing independent read-only Billing token',async()=>{
 const {readFileSync}=await import('node:fs');
 const flow=readFileSync(new URL('../../.github/workflows/geomacro-optimized-worker-candidate.yml',import.meta.url),'utf8');
 const proof=readFileSync(new URL('../lib/cloudflare-workers-paid-plan-proof.mjs',import.meta.url),'utf8');
 const candidate=flow.split('  candidate:')[1];
 assert.ok(candidate);
 assert.match(candidate,/environment: production/u);
 assert.match(candidate,/CLOUDFLARE_BILLING_READ_TOKEN: \$\{\{ secrets\.CLOUDFLARE_BILLING_READ_TOKEN \}\}/u);
 assert.match(proof,/const token=env\.CLOUDFLARE_BILLING_READ_TOKEN/u);
 assert.match(proof,/method:"GET"/u);
 assert.match(proof,/\/subscriptions/u);
 assert.doesNotMatch(candidate,/npm run release:hold|--promote|deployments.*POST/u);
});


test('manual exact-main candidate upload is opt-in and never deploys traffic',async()=>{
 const {readFileSync}=await import('node:fs');
 const y=readFileSync(new URL('../../.github/workflows/geomacro-optimized-worker-candidate.yml',import.meta.url),'utf8');
 const cand=y.split('  candidate:')[1];
 assert.match(y,/workflow_dispatch:/u);
 assert.match(y,/UPLOAD_EXACT_MAIN_ZERO_TRAFFIC_NO_FUNDS/u);
 assert.match(cand,/github\.ref == 'refs\/heads\/main'/u);
 assert.match(cand,/github\.event_name == 'workflow_dispatch'/u);
 assert.match(cand,/inputs\.approval == 'UPLOAD_EXACT_MAIN_ZERO_TRAFFIC_NO_FUNDS'/u);
 assert.match(cand,/test -f config\/d1-hotspot-v2-canary\.hold/u);
 assert.match(cand,/node scripts\/ops\/prepare-optimized-worker-candidate\.mjs/u);
 assert.doesNotMatch(cand,/canary-promoter|wrangler deploy|versions deploy|--release-hold/u);
});

test('fresh Wrangler structured version-upload event pins the immutable candidate UUID',()=>{
 const id='12345678-1234-4123-8123-123456789abc';
 const lines=[
  {type:'wrangler-session',version:1,command_line_args:['versions','upload']},
  {type:'version-upload',worker_name:'geomacro-control-plane',
   version_id:id,timestamp:'2026-11-11T05:44:22Z'}
 ].map(x=>JSON.stringify(x)).join('\n')+'\n';
 assert.equal(uploadedVersionIdFromWranglerEvents(lines),id);
});
test('ambiguous, stale or cross-worker upload receipts are rejected',()=>{
 const upload={type:'version-upload',worker_name:'geomacro-control-plane',
  version_id:'12345678-1234-4123-8123-123456789abc'};
 const run=events=>events.map(x=>JSON.stringify(x)).join('\n');
 assert.throws(()=>uploadedVersionIdFromWranglerEvents(run([upload,upload])),
  /RECEIPT_MISSING_OR_AMBIGUOUS/);
 assert.throws(()=>uploadedVersionIdFromWranglerEvents(run([{type:'deploy'}])),
  /RECEIPT_MISSING_OR_AMBIGUOUS/);
 assert.throws(()=>uploadedVersionIdFromWranglerEvents(run([{...upload,worker_name:'other-worker'}])),
  /UPLOAD_IDENTITY_INVALID/);
 assert.throws(()=>uploadedVersionIdFromWranglerEvents(run([{...upload,version_id:'invalid'}])),
  /UPLOAD_IDENTITY_INVALID/);
 assert.throws(()=>uploadedVersionIdFromWranglerEvents('not-json'),
  /RECEIPT_INVALID/);
});
test('candidate selection never guesses from previous versions sharing a SHA',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../ops/prepare-optimized-worker-candidate.mjs',import.meta.url),'utf8');
 assert.match(source,/WRANGLER_OUTPUT_FILE_PATH/u);
 assert.match(source,/uploadedVersionIdFromWranglerEvents/u);
 assert.ok(source.includes("const candidate=await get('/versions/'+uploadedId);"));
 assert.doesNotMatch(source,/versions\?deployable=true/u);
});

// The new version must carry real new secrets in the SAME immutable code upload.
test('reviewed additive secret set is exact and no unauthorized binding can appear',()=>{
 const enabled=candidate();
 for(const name of REVIEWABLE_ADDITIVE_SECRETS)
  enabled.resources.bindings.push({name,type:'secret_text'});
 assert.equal(verifyCandidateBindings(baseline,enabled,sha,
  REVIEWABLE_ADDITIVE_SECRETS),true);
 assert.throws(()=>verifyCandidateBindings(baseline,enabled,sha,[]),
  /UNREVIEWED_ADDITION/);
 const bad=structuredClone(enabled);
 bad.resources.bindings.push({name:'PAYMENT_OVERRIDE',type:'plain_text',text:'1'});
 assert.throws(()=>verifyCandidateBindings(baseline,bad,sha,
  REVIEWABLE_ADDITIVE_SECRETS),/UNREVIEWED_ADDITION/);
 for(const [name,value] of [['RISK_STREAM_ACTIVE','0'],
  ['STREAM_INGESTION_ENABLED','false'],
  ['GEOMACRO_COMMERCIAL_STREAM_RELEASE','1']]){
  const mutated=structuredClone(enabled);
  mutated.resources.bindings.find(b=>b.name===name).text=value;
  assert.throws(()=>verifyCandidateBindings(baseline,mutated,sha,
   REVIEWABLE_ADDITIVE_SECRETS),/REVIEWED_FLAG_NOT_VERIFIED/);
 }
});
test('zero-traffic candidate requires explicit separate Hot50 review and secrets-file upload',async()=>{
 const {readFileSync}=await import('node:fs');
 const src=readFileSync(new URL('../ops/prepare-optimized-worker-candidate.mjs',import.meta.url),'utf8');
 const flow=readFileSync(new URL('../../.github/workflows/geomacro-optimized-worker-candidate.yml',import.meta.url),'utf8');
 assert.match(src,/ENABLE_HOT50_RESEARCH_NO_FUNDS/);
 assert.match(src,/--secrets-file/);
 assert.match(src,/rmSync\(secretFile,\{force:true\}\)/);
 assert.match(flow,/reviewed_hot50_runtime:/);
 assert.match(flow,/GEOMACRO_LICENSE_ED25519_PRIVATE_KEY_PKCS8_B64/);
 assert.match(flow,/RISK_STREAM_INDEX_LEAD_BEARER/);
});

test('already-provisioned secret inherits unchanged and cannot be re-reviewed as additive',()=>{
 const live=structuredClone(baseline);
 live.resources.bindings.push({name:REVIEWABLE_ADDITIVE_SECRETS[0],type:'secret_text'});
 const config=candidateConfig(live,sha);
 assert.equal(config.unsafe.bindings.some(x=>
  x.name===REVIEWABLE_ADDITIVE_SECRETS[0]),true);
 assert.throws(()=>candidateConfig(live,sha,[REVIEWABLE_ADDITIVE_SECRETS[0]]),
  /REVIEWED_SECRET_NOT_ADDITIVE/);
 assert.equal(config.unsafe.bindings.some(x=>x.name==='DB'),true);
});

test('candidate requires exact missing secret names in one upload and keeps existing secrets intact',async()=>{
 const {readFileSync}=await import('node:fs');
 const code=readFileSync(new URL('../ops/prepare-optimized-worker-candidate.mjs',import.meta.url),'utf8');
 const flow=readFileSync(new URL('../../.github/workflows/geomacro-optimized-worker-candidate.yml',import.meta.url),'utf8');
 assert.match(code,/CANDIDATE_EXACT_ADDITIVE_SECRET_REVIEW_REQUIRED/);
 assert.match(code,/REVIEWABLE_ADDITIVE_SECRETS\.filter/);
 assert.match(code,/if\(reviewedSecrets\.length\)/);
 assert.match(flow,/reviewed_additive_secret_names:/);
 assert.match(flow,/CANDIDATE_REVIEWED_ADDITIVE_SECRET_NAMES:/);
 const live=structuredClone(baseline);
 live.resources.bindings.push({name:REVIEWABLE_ADDITIVE_SECRETS[0],type:'secret_text'});
 const missing=REVIEWABLE_ADDITIVE_SECRETS.slice(1);
 const config=candidateConfig(live,sha,missing);
 assert(config.unsafe.bindings.some(x=>x.name===REVIEWABLE_ADDITIVE_SECRETS[0]));
 assert.equal(config.unsafe.bindings.filter(x=>missing.includes(x.name)).length,0);
});
