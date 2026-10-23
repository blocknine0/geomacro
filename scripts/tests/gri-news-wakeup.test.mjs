import test from 'node:test';
import assert from 'node:assert/strict';
import {GRI_NEWS_WORKFLOWS,verifyGriNewsWakeup} from '../ops/verify-gri-news-wakeup.mjs';
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
  {event:'pull_request'},{event:'workflow_run'},{head_sha:'main'}])
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
 assert.throws(()=>verifyGriNewsWakeup({...args,event:{workflow_run:{
  ...run,name:'Five-Minute Original News Fastlane',event:'workflow_run'}}}));
});
