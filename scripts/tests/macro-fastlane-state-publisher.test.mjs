import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {persistMacroFastlaneState,MACRO_STATE_MAX_BYTES} from '../lib/macro-fastlane-state-publisher.mjs';
import {collectMacroFastlane} from '../lib/macro-fastlane-collector.mjs';
import {collectCriticalMineralsFastlane} from '../lib/critical-minerals-fastlane.mjs';
import {MINERALS_SOURCE_IDS} from '../lib/critical-minerals-registry.mjs';
const now='2026-11-18T10:00:00.000Z';
const state=()=>({schema:'geomacro.macro-fastlane-state.v1',checked_at:now,
 source_checks:[{id:'fed_press',state:'OK',candidates:1}],
 mineral_checks:[{id:'bgs_news',state:'NOT_MODIFIED',candidates:0}]});
const options={url:'https://example.workers.dev/v1/internal/macro-fastlane',token:'x'.repeat(64)};
const ack=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
test('transient 503 PUT retries with bounded attempts and verifies exact protected D1 readback',async()=>{
 const calls=[],s=state(),pauses=[];
 const proof=await persistMacroFastlaneState({...options,state:s,
  fetchImpl:async(_,opts)=>{calls.push(opts);if(opts.method==='GET')return ack({ok:true,state:s});
   return calls.filter(c=>c.method==='PUT').length<3?ack({ok:false,error:'MACRO_STATE_D1_WRITE_UNAVAILABLE'},503):ack({ok:true,state_saved:true});},
  sleep:async ms=>pauses.push(ms)});
 assert.equal(proof.verified_d1_readback,true);
 assert.equal(proof.attempts,3);
 assert.deepEqual(pauses,[300,600]);
 assert.deepEqual(calls.map(c=>c.method),['PUT','PUT','PUT','GET']);
 assert.equal(JSON.parse(calls[0].body).checked_at,s.checked_at);
 assert.equal(calls[0].headers.Authorization,'Bearer '+options.token);
 assert.equal(proof.source_text_included,false);
});
test('400 invalid state never retries, no false ACK or readback',async()=>{
 let count=0;
 await assert.rejects(persistMacroFastlaneState({...options,state:state(),fetchImpl:async()=>{
  count++;return ack({ok:false,error:'MACRO_STATE_INVALID',field:'mineral_checks[4].state'},400);},sleep:async()=>{}}),/MACRO_STATE_PUT_HTTP_400_MACRO_STATE_INVALID_FIELD_mineral_checks\[4\]\.state/);
 assert.equal(count,1);
});
test('readback mismatch never retries acknowledged PUT',async()=>{
 const methods=[];
 await assert.rejects(persistMacroFastlaneState({...options,state:state(),
 fetchImpl:async(_,init)=>{methods.push(init.method);return init.method==='PUT'?ack({ok:true,state_saved:true}):ack({ok:true,state:{...state(),source_checks:[]}})},
 sleep:async()=>{}}),/MACRO_STATE_READBACK_MISMATCH/);
 assert.deepEqual(methods,['PUT','GET']);
});
test('fail closed on exhausted 503, bad auth, unsafe URL and oversize',async()=>{
 let count=0;
 await assert.rejects(persistMacroFastlaneState({...options,state:state(),
  fetchImpl:async()=>{count++;return ack({ok:false,error:'MACRO_STATE_D1_WRITE_UNAVAILABLE'},503)},sleep:async()=>{}}),/MACRO_STATE_PUT_RETRY_EXHAUSTED_HTTP_503/);
 assert.equal(count,3);
 await assert.rejects(persistMacroFastlaneState({...options,url:'http://localhost/v1/internal/macro-fastlane',state:state()}),/MACRO_STATE_REQUEST_INVALID/);
 await assert.rejects(persistMacroFastlaneState({...options,state:{...state(),payload:'a'.repeat(MACRO_STATE_MAX_BYTES)}}),/MACRO_STATE_PAYLOAD_TOO_LARGE/);
});
test('normalizes upstream Last-Modified headers to the server cursor format',async()=>{
 const upstreamLastModified='Sat, 21 Nov 2026 08:00:00 +0000';
 const expected='Sat, 21 Nov 2026 08:00:00 GMT';
 assert.equal(new Date(Date.parse(upstreamLastModified)).toUTCString(),expected);
 for(const file of ['../lib/macro-fastlane-collector.mjs','../lib/critical-minerals-fastlane.mjs']){
  const source=readFileSync(new URL(file,import.meta.url),'utf8');
  assert.match(source,/const normalizeLastModified=value=>\{if\(typeof value!=='string'\|\|value\.length>200\)return null;const ms=Date\.parse\(value\);return Number\.isFinite\(ms\)\?new Date\(ms\)\.toUTCString\(\):null;\}/);
  assert.match(source,/last_modified:normalizeLastModified\(data\.lastModified\)/);
 }
});
test('collectors prune retired macro and mineral cursor and source-check IDs',async()=>{
 const now=Date.parse('2026-11-22T14:00:00.000Z');
 const validCursor={etag:null,last_modified:null,retry_after:0,checked_at:now};
 const macro=await collectMacroFastlane({now,fetchImpl:async()=>{throw Error('NETWORK_NOT_EXPECTED');},
  state:{cursors:{retired_macro_source:validCursor,fed_press:validCursor},source_checks:[
   {id:'retired_macro_source',state:'OK',candidates:1},{id:'fed_press',state:'OK',candidates:1},
  ]},sourceIds:[],prices:false,calendars:false});
 assert.deepEqual(Object.keys(macro.state.cursors),['fed_press']);
 assert.deepEqual(macro.state.source_checks.map(check=>check.id),['fed_press']);

 let fetchCalls=0;
 const minerals=await collectCriticalMineralsFastlane({now,
  fetchImpl:async()=>{fetchCalls++;return new Response(null,{status:503});},
  state:{mineral_cursors:{mining_global:validCursor}},
 });
 assert.ok(fetchCalls>0);
 assert.equal(Object.hasOwn(minerals.cursors,'mining_global'),false);
 assert.ok(Object.keys(minerals.cursors).every(id=>MINERALS_SOURCE_IDS.includes(id)));
});
