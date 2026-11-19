import test from 'node:test';
import assert from 'node:assert/strict';
import {persistMacroFastlaneState,MACRO_STATE_MAX_BYTES} from '../lib/macro-fastlane-state-publisher.mjs';
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
