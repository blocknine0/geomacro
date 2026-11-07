import {test} from 'node:test';
import assert from 'node:assert/strict';
import {attributeD1} from '../../workers/control-plane/src/d1-query-attribution.mjs';
function native(){return {prepare(sql){return {bind(){return this},async all(){if(sql==='FAIL')throw Error('failed');return {results:[{n:7}],meta:{rows_read:3,rows_written:2}}},async run(){return this.all()},async raw(){return [[7]]}}},async batch(ss){return Promise.all(ss.map(s=>s.all()))}}}
test('all, first and batch retain results and aggregate provider costs without bindings',async()=>{
 const rows=[],t=attributeD1(native(),r=>rows.push(r));
 assert.equal(await t.db.prepare('SELECT ?').bind('secret').first('n'),7);
 await t.db.prepare('SELECT ?').all();
 await t.db.batch([t.db.prepare('SELECT ?').bind('another-secret')]);
 t.flush();assert.equal(rows.length,1);assert.equal(rows[0].calls,3);
 assert.equal(rows[0].rows_read,9);assert.equal(rows[0].rows_written,6);
 assert.ok(!JSON.stringify(rows).includes('secret'));assert.match(rows[0].fingerprint,/^[a-f0-9]{64}$/);
});
test('failed and metadata-less calls remain unknown, never zero-cost evidence',async()=>{
 const rows=[],t=attributeD1(native(),r=>rows.push(r));
 await assert.rejects(t.db.prepare('FAIL').all(),/failed/);
 assert.deepEqual(await t.db.prepare('RAW').raw(),[[7]]);
 t.flush();assert.equal(rows.reduce((n,r)=>n+r.unknown,0),2);
 assert.equal(rows.reduce((n,r)=>n+r.errors,0),1);
});
test('telemetry sink failure cannot change successful database result',async()=>{
 const t=attributeD1(native(),()=>{throw Error('sink')});
 assert.equal(await t.db.prepare('SELECT').first('n'),7);assert.doesNotThrow(()=>t.flush());
});
