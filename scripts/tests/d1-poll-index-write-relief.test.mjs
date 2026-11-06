import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
test('consolidated due index preserves ordered dispatch and UNIQUE candidate lookup',()=>{
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE source_registry(source_id TEXT PRIMARY KEY,enabled INTEGER,next_poll_at TEXT,poll_dispatch_lease_until TEXT);
 CREATE INDEX idx_p0a_registry_due ON source_registry(enabled,next_poll_at,source_id);
 CREATE INDEX idx_p1_dispatch_due ON source_registry(enabled,next_poll_at,poll_dispatch_lease_until,source_id);
 CREATE TABLE ingestion_spool_queue(candidate_sha256 TEXT UNIQUE);
 CREATE INDEX idx_spool_candidate_sha ON ingestion_spool_queue(candidate_sha256);`);
 const sql=readFileSync(new URL('../../workers/control-plane/migrations/0206_d1_poll_index_write_relief.sql',import.meta.url),'utf8');
 try{
  db.exec(sql);db.exec(sql);
  db.exec("INSERT INTO source_registry VALUES ('bbb',1,'2026-01-01',NULL),('aaa',1,'2026-01-01',NULL)");
  const query='SELECT source_id FROM source_registry WHERE enabled=1 AND next_poll_at<=? AND (poll_dispatch_lease_until IS NULL OR poll_dispatch_lease_until<=?) ORDER BY next_poll_at,source_id LIMIT 105';
  assert.deepEqual(db.prepare(query).all('2026-01-02','2026-01-02').map(x=>x.source_id),['aaa','bbb']);
  const plan=db.prepare('EXPLAIN QUERY PLAN '+query).all('2026-01-02','2026-01-02').map(x=>x.detail).join('\n');
  assert.match(plan,/COVERING INDEX idx_p1_dispatch_due/);assert.doesNotMatch(plan,/TEMP B-TREE/);
  db.exec("INSERT INTO ingestion_spool_queue VALUES ('sha')");
  assert.throws(()=>db.exec("INSERT INTO ingestion_spool_queue VALUES ('sha')"),/UNIQUE/);
  const indexes=db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(x=>x.name);
  assert.ok(!indexes.includes('idx_p0a_registry_due'));
  assert.ok(!indexes.includes('idx_spool_candidate_sha'));
 }finally{db.close()}
});
