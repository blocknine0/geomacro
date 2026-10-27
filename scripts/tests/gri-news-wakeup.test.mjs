import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GRI_NEWS_WORKFLOWS,verifyGriNewsWakeup,verifyOriginalNewsDeployWakeup} from '../ops/verify-gri-news-wakeup.mjs';
const sha='a'.repeat(40),ancestor='b'.repeat(40);
const env={GITHUB_REPOSITORY:'blocknine0/geomacro',GITHUB_REF:'refs/heads/main',
 GITHUB_SHA:sha,GITHUB_EVENT_NAME:'workflow_run'};
const run={name:GRI_NEWS_WORKFLOWS[1],conclusion:'success',
 head_repository:{full_name:'blocknine0/geomacro'},head_branch:'main',
 head_sha:ancestor,event:'schedule'};
const args={env,event:{workflow_run:run},checkoutSha:sha,isAncestor:true};
test('all actual news lanes wake canonical main after it advances, without approving scores',()=>{
 for(const name of GRI_NEWS_WORKFLOWS){
  const r=verifyGriNewsWakeup({...args,event:{workflow_run:{...run,name}}});
  assert.equal(r.allowed,true);assert.equal(r.news_workflow_ancestry_verified,true);
  assert.equal(r.signed_gri_input_verified,false);assert.equal(r.published,false);
  assert.equal(r.b2_requests+r.d1_writes+r.payments,0);
 }
});
test('fork, failed, unrelated, PR, unknown source event and non-ancestor completions reject',()=>{
 for(const change of [{name:'Unknown workflow'},{conclusion:'failure'},
  {head_repository:{full_name:'fork/geomacro'}},{head_branch:'feature'},
  {event:'pull_request'},{name:'Auto Ingest News',event:'workflow_run'},{head_sha:'main'}])
  assert.throws(()=>verifyGriNewsWakeup({...args,event:{workflow_run:{...run,...change}}}));
 assert.throws(()=>verifyGriNewsWakeup({...args,isAncestor:false}));
 assert.throws(()=>verifyGriNewsWakeup({...args,event:{}}));
});
test('schedule, owner dispatch and scoped main push check exact checkout, without claiming news proof',()=>{
 for(const kind of ['schedule','workflow_dispatch','push']){
  const r=verifyGriNewsWakeup({...args,env:{...env,GITHUB_EVENT_NAME:kind},event:{}});
  assert.equal(r.allowed,true);assert.equal(r.news_workflow_ancestry_verified,false);
 }
 for(const change of [{GITHUB_SHA:ancestor},{GITHUB_REF:'refs/heads/feature'},
  {GITHUB_REPOSITORY:'fork/geomacro'},{GITHUB_EVENT_NAME:'pull_request'}])
  assert.throws(()=>verifyGriNewsWakeup({...args,env:{...env,...change}}));
});

test('one-time consent continuation wakes only on genuine successful private original source intake',()=>{
 const name='Current Original Private Signing Review Intake (No Funds)';
 assert.ok(GRI_NEWS_WORKFLOWS.includes(name));
 for(const event of ['schedule','workflow_dispatch','push']){
  const result=verifyGriNewsWakeup({...args,event:{workflow_run:{...run,name,event}}});
  assert.equal(result.news_workflow_ancestry_verified,true);
  assert.equal(result.signed_gri_input_verified,false);
  assert.equal(result.published,false);
  assert.equal(result.payments,0);
 }
 for(const bad of [
  {conclusion:'failure'},{event:'workflow_run'},{event:'pull_request'},
  {head_repository:{full_name:'other/geomacro'}},{head_branch:'reviewer-private'}
 ]){
  assert.throws(()=>verifyGriNewsWakeup({...args,
   event:{workflow_run:{...run,name,...bad}}}));
 }
 assert.throws(()=>verifyGriNewsWakeup({...args,isAncestor:false,
  event:{workflow_run:{...run,name}}}));
});

test('trusted canonical D1 primary and recovery writer completions wake all-news signing',()=>{
 for(const name of ['Website Derived News Continuity','Website Derived News Cadence Backstop']){
  const result=verifyGriNewsWakeup({...args,event:{workflow_run:{...run,name,event:'schedule'}}});
  assert.equal(result.allowed,true);
  assert.equal(result.signed_gri_input_verified,false);
  assert.equal(result.published,false);
  // These canonical source publishers may themselves be woken by a trusted
  // prior workflow. That chain must still bind canonical main and ancestry.
  const chained=verifyGriNewsWakeup({...args,event:{workflow_run:{...run,name,event:'workflow_run'}}});
  assert.equal(chained.allowed,true);
  assert.equal(chained.news_workflow_ancestry_verified,true);
  assert.throws(()=>verifyGriNewsWakeup({...args,isAncestor:false,
    event:{workflow_run:{...run,name,event:'workflow_run'}}}));
 }
 const resumed=verifyGriNewsWakeup({...args,event:{workflow_run:{
  ...run,name:'Five-Minute Original News Fastlane',event:'workflow_run'}}});
 assert.equal(resumed.news_workflow_ancestry_verified,true);
 assert.equal(resumed.signed_gri_input_verified,false);
 assert.equal(resumed.published,false);
 const backstop=readFileSync('.github/workflows/gri-signed-ready-cadence-backstop.yml','utf8');
 const enqueue=backstop.split('  enqueue-approved-review:')[1].split('    runs-on:')[0];
 assert.match(enqueue,/github.event.workflow_run.event == 'workflow_run'/);
 assert.match(enqueue,/github.event.workflow_run.name == 'Five-Minute Original News Fastlane'/);
});

test('successful canonical D1 deployment resumes originals after main advances without admitting GRI',()=>{
 const deployed={...run,name:'Deploy D1 Control Plane',event:'push',status:'completed'};
 for(const event of ['push','workflow_dispatch']){
  const a={...args,event:{workflow_run:{...deployed,event}}};
  const resumed=verifyOriginalNewsDeployWakeup(a);
  assert.equal(resumed.allowed,true);
  assert.equal(resumed.deployment_ancestry_verified,true);
  assert.equal(resumed.signed_gri_input_verified,false);
  assert.equal(resumed.published,false);
  assert.equal(resumed.b2_requests+resumed.d1_writes+resumed.payments,0);
  // Deployment is NOT an admissible direct signed-GRI wakeup.
  assert.throws(()=>verifyGriNewsWakeup(a));
 }
 for(const patch of [
  {name:'Unknown workflow'},{name:'Five-Minute Original News Fastlane'},
  {status:'in_progress'},{conclusion:'failure'},{conclusion:'cancelled'},
  {head_repository:{full_name:'fork/geomacro'}},{head_branch:'feature'},
  {event:'pull_request'},{event:'workflow_run'},{head_sha:'main'}
 ])assert.throws(()=>verifyOriginalNewsDeployWakeup({...args,
  event:{workflow_run:{...deployed,...patch}}}));
 assert.throws(()=>verifyOriginalNewsDeployWakeup({...args,isAncestor:false,
  event:{workflow_run:deployed}}));
 for(const patch of [{GITHUB_SHA:ancestor},{GITHUB_REF:'refs/heads/feature'},
  {GITHUB_REPOSITORY:'fork/geomacro'}])
  assert.throws(()=>verifyOriginalNewsDeployWakeup({...args,env:{...env,...patch},
   event:{workflow_run:deployed}}));
 for(const kind of ['schedule','workflow_dispatch','push']){
  const receipt=verifyOriginalNewsDeployWakeup({...args,
   env:{...env,GITHUB_EVENT_NAME:kind},event:{}});
  assert.equal(receipt.allowed,true);
  assert.equal(receipt.news_workflow_ancestry_verified,false);
 }
});

test('deployment recovery gates producer writes and reviewer credentials on canonical source, without a new cron',()=>{
 const wf=readFileSync('.github/workflows/five-minute-original-news-fastlane.yml','utf8');
 assert.match(wf,/workflow_run:\s+workflows: \["Deploy D1 Control Plane"\]\s+types: \[completed\]\s+branches: \[main\]/);
 assert.equal((wf.match(/cron:/g)||[]).length,1);
 const producer=wf.split('  original-five-minute-derived-news:')[1];
 const reviewer=wf.split('  continue-private-source-review:')[1].split('  fastlane-contract:')[0];
 for(const job of [producer,reviewer]){
  assert.match(job,/ref: \$\{\{ github.sha \}\}/);
  assert.match(job,/fetch-depth: 0/);
  assert.match(job,/github.event.workflow_run.conclusion == 'success'/);
  assert.match(job,/github.event.workflow_run.head_repository.full_name == 'blocknine0\/geomacro'/);
  assert.match(job,/github.event.workflow_run.head_branch == 'main'/);
  assert.match(job,/verify-gri-news-wakeup.mjs --original-news-deploy/);
 }
 for(const step of ['Refresh retained actor-action news','Automatically approve and sign',
  'Preserve private originals']){
  assert.match(producer.slice(producer.indexOf('- name: '+step)),
   /^- name:[^\n]+\n\s+if: \$\{\{ steps\.budget\.outputs\.critical == 'true' && !cancelled\(\) && steps\.wakeup\.outcome == 'success'\s+&& steps\.intake-clock\.outputs\.due == 'true' \}\}/);
 }
 assert.ok(producer.indexOf('--original-news-deploy')<producer.indexOf('run: bun scripts/ops/publish-original-news-five-minute-fastlane.ts'));
 assert.ok(reviewer.indexOf('--original-news-deploy')<reviewer.indexOf('Derive only the restricted review capability'));
 assert.doesNotMatch(wf,/download-artifact|COINBASE_X402_MAINNET_ACK|B2_APPLICATION_KEY/);
});
