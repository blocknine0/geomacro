import test from 'node:test';
import assert from 'node:assert/strict';
import {runUnifiedRiskAssessmentTick} from '../../workers/control-plane/src/unified-risk-gate.mjs';
import {materializeRiskGateAssessments} from '../../workers/control-plane/src/risk-gate-assessment-buffer.mjs';
const now=Date.parse('2026-11-06T12:00:00Z'),sha='a'.repeat(64);
const snapshot={target_type:'COUNTRY',target_id:'USA',day_utc:'2026-11-06',categories:{}};
const history=[{entity_type:'COUNTRY',entity_id:'USA',day_utc:snapshot.day_utc,snapshot,content_sha256:sha}];
const gro={subject:{type:'country',id:'USA'},object_id:'gro-USA-1',verification:{status:'VERIFIED'},commercial_eligibility:{status:'VERIFIED'},
 risk:{score:32},integrity:{payload_hash:sha,signature_scheme:'Ed25519',signature:'x'.repeat(90)},
 attribution:[{driver:'conflict',score_contribution:30},{driver:'inflation',score_contribution:35},{driver:'critical_minerals',score_contribution:25}],
 evidence_summary:{independent_source_count:2},evidence:[{event_id:'event-1',corroboration_status:'CONFIRMED',independent_source_count:2,source_ids:['first','second'],content_hashes:[sha]}]};
function db(rows){return {DB:{prepare(sql){return {bind(...args){return {all:async()=>{
 if(sql.includes('country_gro_verified_hot')){
  assert.ok(args.includes('USA'));return {results:rows};
 }
 assert.match(sql,/risk_observations/);return {results:[]};
}}}}}}};}
const hot={country_iso3:'USA',object_id:gro.object_id,archive_write_acknowledged:1,archive_readback_verified:1,
 archive_key:'geomacro-evidence/v1/live/country-gro/USA.json.gz',archive_sha256:sha};
function sink({tamper=false}={}){
 const saved=new Map(),writes=[];
 return {saved,writes,async remote(path,options){
  assert.ok(path.length<2400);assert.match(path,/geomacro_risk_assessment_7d/);
  if(options.method==='POST'){
   const rows=JSON.parse(options.body);writes.push(rows);
   for(const r of rows)saved.set(r.assessment_sha256,r);
   return new Response(null,{status:201});
  }
  assert.match(path,/ingested_at=gte\./);
  return Response.json([...saved.values()].map(x=>tamper?{...x,result_sha256:'f'.repeat(64)}:x));
 }};
}
test('no current GRO creates zero assessment rows, not fabricated insufficient evidence',async()=>{
 const r=await materializeRiskGateAssessments(db([]),history,{now,remote(){assert.fail('unexpected remote write')}});
 assert.equal(r.assessment_rows,0);assert.equal(r.assessment_status,'BLOCKED_NO_SIGNED_GRO');
});
test('invalid cryptographic proof never reaches the observation reader or Supabase',async()=>{
 const env={DB:{prepare(sql){assert.match(sql,/country_gro_verified_hot/);return {bind(){return {all:async()=>({results:[hot]})}}}}}};
 const r=await materializeRiskGateAssessments(env,history,{now,verifyGro:async()=>null,remote(){assert.fail('untrusted input escaped')}});
 assert.equal(r.assessment_rows,0);
});
test('three tiers use real product logic; Basic provisional and missing seven-day Complex remain insufficient',async()=>{
 const storage=sink();
 const r=await materializeRiskGateAssessments(db([hot]),history,{now,remote:storage.remote,verifyGro:async()=>gro});
 assert.equal(r.assessment_rows,3);assert.equal(r.verified_assessment_rows,1);
 const rows=[...storage.saved.values()];
 assert.equal(rows.find(x=>x.tier==='STANDARD').assessment_status,'VERIFIED');
 assert.equal(rows.find(x=>x.tier==='BASIC').assessment_status,'INSUFFICIENT');
 assert.equal(rows.find(x=>x.tier==='COMPLEX').assessment_status,'INSUFFICIENT');
 assert.ok(rows.every(x=>x.gro_sha256===sha));
 assert.doesNotMatch(JSON.stringify(rows),/source_ids|attribution|archive_key|signature|charged/);
 const again=sink();
 await materializeRiskGateAssessments(db([hot]),history,{now:now+1000,remote:again.remote,verifyGro:async()=>gro});
 assert.deepEqual([...storage.saved.keys()],[...again.saved.keys()],'repeat cron updates same immutable GRO/tier cache keys');
});
test('exact remote digest mismatch fails acceptance',async()=>{
 const storage=sink({tamper:true});
 await assert.rejects(()=>materializeRiskGateAssessments(db([hot]),history,{now,remote:storage.remote,verifyGro:async()=>gro}),/EXACT_READBACK_MISMATCH/);
});
test('real pinned verifier rejects a caller-shaped GRO without signed bytes',async()=>{
 const r=await materializeRiskGateAssessments(db([{...hot,gro}]),history,{now,remote(){assert.fail('unsigned input escaped')}});
 assert.equal(r.assessment_rows,0);
});

test('empty Hot50 tick is one read, zero writes and zero remote calls',async()=>{
 let reads=0;
 const env={RISK_GATE_COUNTRY_SCOPE:'HOT50',RISK_GATE_SUPABASE_ACCEPTANCE:'ACCEPTED_PRIVATE_RISK_GATE_DAILY',
  RISK_GATE_SUPABASE_URL:'https://test.supabase.co',RISK_GATE_SUPABASE_SERVICE_ROLE_KEY:'offline-only-service-key-over-32-characters',
  DB:{prepare(sql){reads++;assert.match(sql,/SELECT country_iso3 FROM country_gro_verified_hot/);
   return {bind(...args){assert.equal(args.length,52);return {all:async()=>({results:[]})}}}}}};
 const r=await runUnifiedRiskAssessmentTick(env,{now,fetcher(){assert.fail('empty tick made remote request')}});
 assert.equal(r.ok,true);assert.equal(r.assessment_rows,0);assert.equal(reads,1);
 assert.equal(r.assessment_status,'BLOCKED_NO_SIGNED_GRO');
});
