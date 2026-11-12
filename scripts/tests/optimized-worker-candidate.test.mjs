import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateConfig,verifyCandidateBindings,prepareCandidate,uploadedVersionIdFromWranglerEvents} from '../ops/prepare-optimized-worker-candidate.mjs';
const sha='a'.repeat(40);
const baseline={resources:{script_runtime:{compatibility_date:'2026-10-03',compatibility_flags:[]},bindings:[
 {name:'DB',type:'d1',id:'canonical-db'},
 {name:'CONTROL_PLANE_TOKEN',type:'secret_text'},
 {name:'PAYMENT_ENABLED',type:'plain_text',text:'0'},
 {name:'GEOMACRO_SOURCE_SHA',type:'plain_text',text:'b'.repeat(40)},
 {name:'GEOMACRO_P0B_ADMISSION_ACTIVE',type:'plain_text',text:'1'},
 {name:'GEOMACRO_P1_BUNDLED_LEASES_ENABLED',type:'plain_text',text:'1'},
 {name:'GEOMACRO_COMMERCIAL_STREAM_RELEASE',type:'plain_text',text:'0'},
 {name:'RISK_STREAM_CANARY_HOLD_CLEARED',type:'plain_text',text:'0'},
 {name:'RISK_STREAM_SEVEN_DAY_ARCHIVE_APPROVED',type:'plain_text',text:'0'}]}};
const candidate=()=>{const v=structuredClone(baseline);v.resources.bindings.find(x=>x.name==='GEOMACRO_SOURCE_SHA').text=sha;return v};
test('candidate inherits all production secrets/resources/flags without copying values',()=>{
 const config=candidateConfig(baseline,sha);
 assert.deepEqual(config.vars,{GEOMACRO_SOURCE_SHA:sha,
  GEOMACRO_COMMERCIAL_STREAM_RELEASE:'0',RISK_STREAM_CANARY_HOLD_CLEARED:'0',
  RISK_STREAM_SEVEN_DAY_ARCHIVE_APPROVED:'0'});
 assert.deepEqual(config.unsafe.bindings,[{name:'DB',type:'inherit'},
  {name:'CONTROL_PLANE_TOKEN',type:'inherit'},{name:'PAYMENT_ENABLED',type:'inherit'},
  {name:'GEOMACRO_P0B_ADMISSION_ACTIVE',type:'inherit'},
  {name:'GEOMACRO_P1_BUNDLED_LEASES_ENABLED',type:'inherit'}]);
 assert.doesNotMatch(JSON.stringify(config),/canonical-db|secret_text/);
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
 assert.throws(()=>verifyCandidateBindings(baseline,duplicate,sha),/INVALID_OR_DUPLICATE/);
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

test('reviewed Hot50 flag profile and exact additive secret are one immutable candidate',()=>{
 const live=structuredClone(baseline);
 live.resources.bindings.push(
  {name:'RISK_GATE_COUNTRY_SCOPE',type:'plain_text',text:'GLOBAL'},
  {name:'RISK_STREAM_ACTIVE',type:'plain_text',text:'0'},
  {name:'STREAM_INGESTION_ENABLED',type:'plain_text',text:'false'},
  {name:'RISK_STREAM_HOT50_AUTONOMOUS_ENABLED',type:'plain_text',text:'0'});
 const approved='GEOMACRO_LICENSE_ED25519_PRIVATE_KEY_PKCS8_B64';
 const opts={reviewedFlagProfile:'HOT50_INTAKE_REVIEWED',reviewedSecretNames:[approved]};
 const config=candidateConfig(live,sha,opts);
 assert.equal(config.vars.RISK_GATE_COUNTRY_SCOPE,'HOT50');
 assert.equal(config.vars.RISK_STREAM_ACTIVE,'1');
 assert.equal(config.vars.STREAM_INGESTION_ENABLED,'true');
 assert.equal(config.vars.RISK_STREAM_HOT50_AUTONOMOUS_ENABLED,'1');
 for(const name of ['GEOMACRO_COMMERCIAL_STREAM_RELEASE',
   'RISK_STREAM_CANARY_HOLD_CLEARED','RISK_STREAM_SEVEN_DAY_ARCHIVE_APPROVED'])
  assert.equal(config.vars[name],'0');
 const next=structuredClone(live);
 for(const [name,text] of Object.entries(config.vars)){
  const binding=next.resources.bindings.find(x=>x.name===name);
  if(binding)binding.text=text;
  else next.resources.bindings.push({name,type:'plain_text',text});
 }
 next.resources.bindings.push({name:approved,type:'secret_text'});
 assert.equal(verifyCandidateBindings(live,next,sha,opts),true);
 assert.throws(()=>verifyCandidateBindings(live,next,sha),
  /RESOURCE_OR_VALUE_CHANGED/);
 const unreviewed=structuredClone(next);
 unreviewed.resources.bindings.push({name:'UNREVIEWED_API_TOKEN',type:'secret_text'});
 assert.throws(()=>verifyCandidateBindings(live,unreviewed,sha,opts),
  /RESOURCE_OR_VALUE_CHANGED/);
 const unsafe=structuredClone(next);
 unsafe.resources.bindings.find(x=>x.name==='GEOMACRO_COMMERCIAL_STREAM_RELEASE').text='1';
 assert.throws(()=>verifyCandidateBindings(live,unsafe,sha,opts),/RESOURCE_OR_VALUE_CHANGED/);
});
test('candidate cannot reset already-on commercial/hold guards or accept unreviewed values',()=>{
 const live=structuredClone(baseline);
 live.resources.bindings.find(x=>x.name==='RISK_STREAM_CANARY_HOLD_CLEARED').text='1';
 assert.throws(()=>candidateConfig(live,sha),/BASELINE_RELEASE_GATE_UNSAFE/);
 assert.throws(()=>candidateConfig(baseline,sha,{reviewedSecretNames:['CONTROL_PLANE_TOKEN']}),
  /UNREVIEWED_SECRET_NAME/);
 assert.throws(()=>candidateConfig(baseline,sha,{reviewedFlagProfile:'CUSTOM'}),
  /UNREVIEWED_FLAG_PROFILE/);
});
test('candidate CI uses one --secrets-file version upload without secret-only versions',async()=>{
 const {readFileSync}=await import('node:fs');
 const code=readFileSync(new URL('../ops/prepare-optimized-worker-candidate.mjs',import.meta.url),'utf8');
 const y=readFileSync(new URL('../../.github/workflows/geomacro-optimized-worker-candidate.yml',import.meta.url),'utf8');
 assert.match(code,/--secrets-file/u);
 assert.match(code,/CANDIDATE_MISSING_SECRET_REVIEW_REQUIRED/u);
 assert.match(code,/rmSync\(secretDir/u);
 assert.doesNotMatch(code,/versions secret (put|bulk)|wrangler deploy/u);
 assert.match(y,/inputs\.reviewed_flag_profile/u);
 assert.match(y,/inputs\.reviewed_additive_secret_names/u);
});
