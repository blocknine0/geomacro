import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {WEBSITE_GRI_HISTORY_PRUNE_SQL} from '../../workers/control-plane/src/website-gri-history.mjs';
const now=Date.parse('2026-10-23T10:00:00.000Z'),iso=n=>new Date(n).toISOString();
function setup(){
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE website_verified_gri_snapshot_history(source_as_of TEXT)');
 return db;
}
const prune=db=>db.prepare(WEBSITE_GRI_HISTORY_PRUNE_SQL).run(iso(now-30*86400000),12,iso(now-3600000));
test('quiet year retains the most recent verified website score, without refreshing its date',()=>{
 const db=setup();try{
  const old=iso(now-365*86400000);db.prepare('INSERT INTO website_verified_gri_snapshot_history VALUES (?)').run(old);
  prune(db);assert.equal(db.prepare('SELECT source_as_of FROM website_verified_gri_snapshot_history').get().source_as_of,old);
 }finally{db.close()}
});
test('under-embargo burst preserves the prior eligible score with bounded storage',()=>{
 const db=setup();try{
  const old=iso(now-365*86400000),insert=db.prepare('INSERT INTO website_verified_gri_snapshot_history VALUES (?)');
  insert.run(iso(now-366*86400000));insert.run(old);
  for(let i=1;i<=50;i++)insert.run(iso(now-i*60000));
  prune(db);
  const rows=db.prepare('SELECT source_as_of FROM website_verified_gri_snapshot_history').all();
  assert.equal(rows.length,13);assert.ok(rows.some(x=>x.source_as_of===old));
  assert.equal(rows.some(x=>x.source_as_of===iso(now-366*86400000)),false);
  // A genuinely newer eligible score releases the old anchor naturally.
  insert.run(iso(now-61*60000));prune(db);
  const after=db.prepare('SELECT source_as_of FROM website_verified_gri_snapshot_history').all();
  assert.equal(after.length,13);assert.equal(after.some(x=>x.source_as_of===old),false);
 }finally{db.close()}
});
