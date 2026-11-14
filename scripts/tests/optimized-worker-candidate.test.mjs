import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateConfig,verifyCandidateBindings,prepareCandidate,uploadedVersionIdFromWranglerEvents} from '../ops/prepare-optimized-worker-candidate.mjs';
import {reviewedHot50CandidateVars,REVIEWABLE_ADDITIVE_SECRETS}
 from '../lib/canary-additive-binding-parity.mjs';
const sha='a'.repeat(40);
const researchRuntime={RISK_STREAM_ACTIVE:'1',STREAM_INGESTION_ENABLED:'true',
 STREAM_MODE:'PRODUCTION',RISK_STREAM_HOT50_AUTONOMOUS_ENABLED:'1'};
const baseline={resources:{script_runtime:{compatibility_date:'2026-10-03',compatibility_flags:[]},bindings:[
 {name:'DB',type:'d1',id:'canonical-db'},
 {name:'CONTROL_PLANE_TOKEN',type:'secret_text'},
 {name:'PAYMENT_ENABLED',type:'plain_text',text:'0'},
 {name:'GEOMACRO_SOURCE_SHA',type:'plain_text',text:'b'.repeat(40)}]}};
const candidate=()=>{const v=structuredClone(baseline);
 for(const [name,text] of Object.entries(reviewedHot50CandidateVars(sha,researchRuntime))){
  const row=v.resources.bindings.find(x=>x.name===name);
  if(row)row.text=text;
  else v.resources.bindings.push({name,type:'plain_text',text});
 }
 return v;
};
test('candidate inherits all production secrets/resources/flags without copying values',()=>{
 const config=candidateConfig(baseline,sha,[],researchRuntime);
 assert.deepEqual(config.vars,reviewedHot50CandidateVars(sha,researchRuntime));
 assert.deepEqual(config.unsafe.bindings,[{name:'DB',type:'inherit'},
  {name:'CONTROL_PLANE_TOKEN',type:'inherit'},{name:'PAYMENT_ENABLED',type:'inherit'}]);
 assert.doesNotMatch(JSON.stringify(config),/canonical-db|secret_text/);
 assert.equal(config.vars.RISK_STREAM_ACTIVE,'1');
 assert.equal(config.vars.STREAM_INGESTION_ENABLED,'true');
 assert.equal(config.vars.STREAM_MODE,'PRODUCTION');
 assert.equal(config.vars.RISK_STREAM_HOT50_AUTONOMOUS_ENABLED,'1');
 assert.equal(config.vars.GEOMACRO_COMMERCIAL_STREAM_RELEASE,'0');
 assert.equal(config.vars.RISK_STREAM_CANARY_HOLD_CLEARED,'0');
 assert.equal(config.vars.RISK_STREAM_SEVEN_DAY_ARCHIVE_APPROVED,'0');
 const serialized=JSON.parse(JSON.stringify(config));
 assert.equal(Object.hasOwn(serialized.vars,'STREAM_MODE'),true);
 assert.equal(serialized.vars.STREAM_MODE,'PRODUCTION');
 assert.equal(verifyCandidateBindings(baseline,candidate(),sha,[],researchRuntime),true);
});

test('candidate config materializes STREAM_MODE when the live baseline omits it',()=>{
 const live=structuredClone(baseline);
 live.resources.bindings=live.resources.bindings.filter(x=>x.name!=='STREAM_MODE');
 const config=candidateConfig(live,sha);
 assert.equal(config.vars.STREAM_MODE,'DISABLED');
 const uploaded={resources:{...live.resources,bindings:[
  ...live.resources.bindings.filter(x=>!Object.hasOwn(config.vars,x.name)),
  ...Object.entries(config.vars).map(([name,text])=>({name,type:'plain_text',text}))
 ]}};
 assert.equal(uploaded.resources.bindings.find(x=>x.name==='STREAM_MODE').text,'DISABLED');
 assert.equal(verifyCandidateBindings(live,uploaded,sha),true);
 const omitted=structuredClone(uploaded);
 omitted.resources.bindings=omitted.resources.bindings.filter(x=>x.name!=='STREAM_MODE');
 assert.throws(()=>verifyCandidateBindings(live,omitted,sha),/RESOURCE_OR_VALUE_CHANGED/);
});
test('same binding names cannot conceal resource changes or payment activation',()=>{
 for(const [name,field,value] of [['DB','id','other-db'],['PAYMENT_ENABLED','text','1']]){
  const changed=candidate();changed.resources.bindings.find(x=>x.name===name)[field]=value;
  assert.throws(()=>verifyCandidateBindings(baseline,changed,sha,[],researchRuntime),/RESOURCE_OR_VALUE_CHANGED/);
 }
 const changed=candidate();changed.resources.script_runtime.compatibility_date='2026-11-07';
 assert.throws(()=>verifyCandidateBindings(baseline,changed,sha,[],researchRuntime),/SCRIPT_RUNTIME_CHANGED/);
 const duplicate=candidate();duplicate.resources.bindings.push(duplicate.resources.bindings[0]);
 assert.throws(()=>verifyCandidateBindings(baseline,duplicate,sha,[],researchRuntime),/COUNT_CHANGED/);
});
test('candidate cannot upload from unprotected branch before provider access',async()=>{
 let calls=0;
 await assert.rejects(prepareCandidate({env:{},fetchImpl:async()=>{calls++}}),/PROTECTED_MAIN_REQUIRED/);
 assert.equal(calls,0);
});

test('candidate preserves enabled production cache and cross-version isolation',()=>{
 const live=structuredClone(baseline);
 live.resources.script_runtime.cache_options={enabled:true,cross_version_cache:false};
 const config=candidateConfig(live,sha,[],researchRuntime);
 assert.deepEqual(config.cache,{enabled:true,cross_version_cache:false});
 const wrong=candidate();
 assert.throws(()=>verifyCandidateBindings(live,wrong,sha,[],researchRuntime),/SCRIPT_RUNTIME_CHANGED/);
 const correct=candidate();correct.resources.script_runtime.cache_options=structuredClone(config.cache);
 assert.equal(verifyCandidateBindings(live,correct,sha,[],researchRuntime),true);
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
  REVIEWABLE_ADDITIVE_SECRETS,researchRuntime),true);
 assert.throws(()=>verifyCandidateBindings(baseline,enabled,sha,[],researchRuntime),
  /UNREVIEWED_ADDITION/);
 const bad=structuredClone(enabled);
 bad.resources.bindings.push({name:'PAYMENT_OVERRIDE',type:'plain_text',text:'1'});
 assert.throws(()=>verifyCandidateBindings(baseline,bad,sha,
  REVIEWABLE_ADDITIVE_SECRETS,researchRuntime),/UNREVIEWED_ADDITION/);
 for(const [name,value] of [['RISK_STREAM_ACTIVE','0'],
  ['STREAM_INGESTION_ENABLED','false'],
  ['GEOMACRO_COMMERCIAL_STREAM_RELEASE','1']]){
  const mutated=structuredClone(enabled);
  mutated.resources.bindings.find(b=>b.name===name).text=value;
  assert.throws(()=>verifyCandidateBindings(baseline,mutated,sha,
   REVIEWABLE_ADDITIVE_SECRETS,researchRuntime),/REVIEWED_FLAG_NOT_VERIFIED|CANARY_NO_FUNDS/);
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

test('candidate carries Predge vars fail-closed and adds the paid token only when explicitly reviewed',async()=>{
 const {readFileSync}=await import('node:fs');
 const code=readFileSync(new URL('../ops/prepare-optimized-worker-candidate.mjs',import.meta.url),'utf8');
 const flow=readFileSync(new URL('../../.github/workflows/deploy-d1-control-plane.yml',import.meta.url),'utf8');
 assert.match(code,/CANDIDATE_REVIEWED_ADDITIVE_SECRET_NAMES_INVALID/);
 for(const name of ['PREDGE_PAID_RISK_GATE_TOKEN','PREDGE_PAID_TRAFFIC_ENABLED',
  'PREDGE_PAID_GO_LIVE_CROSSCHECK','PREDGE_MUTUAL_TRIAL_STARTED_AT',
  'GEOMACRO_STORE_CHECKOUT_ENABLED'])
  assert.match(flow,new RegExp(name));
 const defaults=candidateConfig(baseline,sha);
 assert.equal(defaults.vars.PREDGE_PAID_TRAFFIC_ENABLED,'NO');
 assert.equal(defaults.vars.PREDGE_PAID_GO_LIVE_CROSSCHECK,'');
 assert.equal(defaults.vars.PREDGE_MUTUAL_TRIAL_STARTED_AT,'');
 assert.equal(Object.hasOwn(defaults.vars,'GEOMACRO_STORE_CHECKOUT_ENABLED'),false);
 const trial=candidateConfig(baseline,sha,[],{PREDGE_PAID_TRAFFIC_ENABLED:'YES',
  PREDGE_PAID_GO_LIVE_CROSSCHECK:'',PREDGE_MUTUAL_TRIAL_STARTED_AT:'2026-11-13T10:00:00Z'});
 assert.equal(trial.vars.PREDGE_PAID_TRAFFIC_ENABLED,'YES');
 assert.equal(trial.vars.PREDGE_MUTUAL_TRIAL_STARTED_AT,'2026-11-13T10:00:00Z');
 const store=candidateConfig(baseline,sha,[],{GEOMACRO_STORE_CHECKOUT_ENABLED:'YES'});
 assert.equal(store.vars.GEOMACRO_STORE_CHECKOUT_ENABLED,'YES');
 assert.throws(()=>candidateConfig(baseline,sha,[],{PREDGE_PAID_TRAFFIC_ENABLED:'1'}),
  /PREDGE_TRIAL_RUNTIME_VAR_INVALID/);
 const token='PREDGE_PAID_RISK_GATE_TOKEN';
 assert.equal(candidateConfig(baseline,sha,[token]).vars.PREDGE_PAID_TRAFFIC_ENABLED,'NO');
 assert.throws(()=>candidateConfig(baseline,sha,['UNKNOWN_SECRET']),
  /REVIEWED_SECRET_NOT_ADDITIVE/);
});
