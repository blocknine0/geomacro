import test from 'node:test';
import assert from 'node:assert/strict';
import {admitP0bSourceStorage} from '../../workers/control-plane/src/p0b-source-storage-admission.mjs';
import {dispatchP1DueSources} from '../../workers/control-plane/src/p1-source-fanout.mjs';
import {pollP0aSources} from '../../workers/control-plane/src/p0a-source-registry.mjs';
const now=Date.parse('2026-11-07T01:00:00Z');
function fixture(hold,fail=false){
 const queries=[];
 return {queries,GEOMACRO_P0B_ADMISSION_ACTIVE:'1',GEOMACRO_P1_FANOUT_ENABLED:'1',
  DB:{prepare(sql){queries.push(sql);assert.equal(sql,'SELECT hold_until FROM p0b_storage_circuit WHERE singleton=1');
   return {async first(){if(fail)throw Error('DB_DOWN');return hold===undefined?null:{hold_until:hold}}}}},
  SOURCE_POLL_QUEUE:{async sendBatch(){assert.fail('must not send while held')}}};
}
test('held storage refuses legacy and bundled dispatch before source lease writes',async()=>{
 for(const mode of ['0','1']){
  const env=fixture('2026-11-07T02:00:00Z');env.GEOMACRO_P1_BUNDLED_LEASES_ENABLED=mode;
  const r=await dispatchP1DueSources(env,{now});
  assert.equal(r.status,'P0B_STORAGE_CIRCUIT_HELD');assert.equal(r.queued,0);assert.equal(env.queries.length,1);
 }
});
test('manual and queue source polls cannot fetch or update checkpoints during a storage hold',async()=>{
 const env=fixture('2026-11-07T02:00:00Z');
 const r=await pollP0aSources(env,{now,fetchImpl:()=>assert.fail('no upstream fetch')});
 assert.equal(r.ok,false);assert.equal(r.error,'P0B_STORAGE_CIRCUIT_HELD');
 assert.deepEqual(r.receipts,[]);assert.equal(env.queries.length,1);
});
test('expired and absent circuits permit resumption; invalid clocks and unavailable DB fail closed',async()=>{
 for(const clock of [undefined,null,'2026-11-07T00:59:59Z'])
  assert.equal((await admitP0bSourceStorage(fixture(clock),now)).admitted,true);
 for(const env of [fixture('bad-clock'),fixture(null,true)]){
  const r=await admitP0bSourceStorage(env,now);assert.equal(r.admitted,false);assert.equal(r.reason,'P0B_STORAGE_CIRCUIT_UNAVAILABLE');
 }
 assert.equal((await admitP0bSourceStorage({},now)).admitted,true);
});
