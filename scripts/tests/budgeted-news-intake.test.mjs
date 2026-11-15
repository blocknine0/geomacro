import test from 'node:test';
import assert from 'node:assert/strict';
import {intakeIsDue,readIntakeBaseline} from '../lib/budgeted-news-intake.mjs';
import {storeNewsIntakePolicy,loadNewsIntakePolicy} from '../../workers/control-plane/src/news-intake-policy.mjs';
import {readFileSync} from 'node:fs';
const now=Date.parse('2026-10-27T10:30:00Z');
const canonicalBundle='https://geomacro-control-plane.daspallab202391.workers.dev/v1/internal/website-derived-news-bundle';
test('cadence uses acknowledged intake, never quote/cron clocks; official release windows retain priority',()=>{
 const p={schema:'geomacro.news-intake-admission.v1',last_success_at:new Date(now-5*60000).toISOString()};
 assert.equal(intakeIsDue(p,10,now),false);assert.equal(intakeIsDue(p,5,now),true);
 assert.equal(intakeIsDue(null,10,now),true);
 assert.equal(intakeIsDue(p,60,now,[{kind:'cpi',source:'bls',at:new Date(now).toISOString()}]),true);
 assert.throws(()=>intakeIsDue({...p,last_success_at:new Date(now+1).toISOString()},10,now),/CLOCK_INVALID/);
});
test('healthy baseline pays one read and no retention sweep; only exact proven overcap repairs once',async()=>{
 let requests=0,repairs=0;
 const readAll=async fetchImpl=>{const r=await fetchImpl(canonicalBundle);const j=await r.json();if(!r.ok)throw Error('READ_FAILED');return j.records;};
 const run=fetchImpl=>readIntakeBaseline({fetchImpl,readAll,bundleUrl:canonicalBundle,now,repair:async()=>{repairs++;}});
 assert.deepEqual(await run(async()=>{requests++;return Response.json({records:['existing']});}),['existing']);
 assert.equal(requests,1);assert.equal(repairs,0);
 requests=0;
 const recovered=await run(async()=>{requests++;return repairs?Response.json({records:['after-repair']}):Response.json({error:'DERIVED_NEWS_BUNDLE_HARD_CAP_EXCEEDED'},{status:503});});
 assert.deepEqual(recovered,['after-repair']);assert.equal(repairs,1);assert.equal(requests,2);
 repairs=0;
 await assert.rejects(run(async()=>Response.json({error:'D1_DAILY_ROW_READ_LIMIT'},{status:503})),/READ_FAILED/);
 assert.equal(repairs,0);
});
test('retries of the same known overcapacity fault cannot multiply D1 reads',async()=>{
 let requests=0,repairs=0;
 const rows=await readIntakeBaseline({now,bundleUrl:canonicalBundle,repair:async()=>{repairs++;},fetchImpl:async()=>{requests++;return repairs?Response.json({records:[1]}):Response.json({error:'DERIVED_NEWS_BUNDLE_HARD_CAP_EXCEEDED'},{status:503});},readAll:async f=>{
  for(let n=0;n<3;n++){const r=await f(canonicalBundle);if(r.ok)return (await r.json()).records;}
  throw Error('FAILED');
 }});
 assert.deepEqual(rows,[1]);assert.equal(requests,2);assert.equal(repairs,1);
});
test('intake baseline rejects legacy public/page fallback before issuing another D1 request',async()=>{
 let requests=0;
 await assert.rejects(readIntakeBaseline({now,bundleUrl:canonicalBundle,repair:async()=>{},fetchImpl:async()=>{requests++;return Response.json({records:[]});},readAll:async f=>{
  const r=await f('https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/website-derived-news-immediate');
  return r.json();
 }}),/FASTLANE_COMPLETE_BUNDLE_REQUIRED/);
 assert.equal(requests,0);
});
test('admission success clock is typed, monotonic and cannot carry source text',async()=>{
 let saved=null;const env={DB:{prepare:sql=>({bind:(key,json,at)=>({first:async()=>saved?{value_json:JSON.stringify(saved)}:null,run:async()=>{const next=JSON.parse(json);if(!saved||saved.last_success_at<=at)saved=next;return {success:true};}})})}};
 const p={schema:'geomacro.news-intake-admission.v1',interval_minutes:10,max_new_rows:25,last_success_at:new Date(now).toISOString(),raw_headline:'DROP'};
 assert.equal((await storeNewsIntakePolicy(env,p,now)).status,200);
 assert.equal(saved.raw_headline,undefined);assert.equal((await loadNewsIntakePolicy(env)).interval_minutes,10);
 await storeNewsIntakePolicy(env,{...p,last_success_at:new Date(now-60000).toISOString()},now);
 assert.equal(saved.last_success_at,p.last_success_at);
 assert.equal((await storeNewsIntakePolicy(env,{...p,interval_minutes:1},now)).status,400);
 const index=readFileSync('workers/control-plane/src/index.mjs','utf8');
 assert.ok(index.indexOf("url.pathname==='/v1/internal/news-intake-policy'")>index.indexOf('const auth = authorized(request, env)'));
 const publisher=readFileSync('scripts/ops/publish-original-news-five-minute-fastlane.ts','utf8');
 assert.ok(publisher.indexOf('if(!intakeIsDue(')<publisher.indexOf('const baseline=await'));
 assert.match(publisher,/pending.length>publishPending.length/);assert.match(publisher,/cursor.etag=null/);
 assert.doesNotMatch(publisher,/canonicalRead/u);
 assert.match(publisher,/readAll:\(fetchImpl,now\)=>fetchAllDerivedNews\(fetchImpl,now,\{fresh:true,canonicalOriginToken:token\}\)/u);
 assert.match(publisher,/fetchAllDerivedNews\(globalThis\.fetch,Date\.now\(\),\s*\{fresh:true,canonicalOriginToken:token\}\)/u);
 assert.match(publisher,/bundleUrl:controlPlaneOrigin\+"\/v1\/internal\/website-derived-news-bundle"/u);
 const route=index.indexOf("url.pathname==='/v1/internal/website-derived-news-bundle'");
 assert.ok(route>index.indexOf('const auth = authorized(request, env)'));
 assert.ok(index.slice(route,route+500).includes('readDerivedStoriesBundle(env,Date.now(),false)'));
});
