import test from 'node:test';
import assert from 'node:assert/strict';
import {readContinuityLock,assertContinuityLock,verifyContinuityRuntime} from './verify-predge-continuity-lock.mjs';
test('checked-in policy pins real schedules and authenticated three-category runtime',async()=>{
 assert.match(assertContinuityLock(readContinuityLock()).policy_sha256,/^[a-f0-9]{64}$/);
 assert.equal((await verifyContinuityRuntime()).three_category_attributed_delivery_locked,true);
});
test('removing a schedule, changing retention, attribution or quota cannot silently unlock delivery',()=>{
 for(const mutate of [x=>x.policy.projection='source_neutral',x=>x.policy.retention_hours=24,
  x=>x.policy.daily_utc_request_hard_cap=5000,x=>x.policy.source_attribution_required=false,
  x=>x.workflows['website-derived-news-continuity.yml']=x.workflows['website-derived-news-continuity.yml'].replace('7 * * * *','7 0 * * *'),
  x=>x.workflows['five-minute-original-news-fastlane.yml']=x.workflows['five-minute-original-news-fastlane.yml'].replace('2-57/5 * * * *','2 0 * * *'),
  x=>x.workflows['predge-research-continuity.yml']=x.workflows['predge-research-continuity.yml'].replace('cancel-in-progress: false','cancel-in-progress: true'),
  x=>x.workflows['predge-research-continuity.yml']=x.workflows['predge-research-continuity.yml'].replace('recover-missed-publication:','recovery-disabled:'),
  x=>x.workflows['website-derived-news-continuity.yml']=x.workflows['website-derived-news-continuity.yml'].replace('refresh-derived-news:','refresh-derived-news:\n    if: false'),
  x=>x.workflows['five-minute-original-news-fastlane.yml']=x.workflows['five-minute-original-news-fastlane.yml'].replace('bun scripts/ops/publish-original-news-five-minute-fastlane.ts','echo skipped'),
 ]){const input=readContinuityLock();mutate(input);assert.throws(()=>assertContinuityLock(input),/LOCK_/);}
});
