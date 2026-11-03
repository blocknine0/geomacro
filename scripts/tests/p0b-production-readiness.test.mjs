import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {getP0bIngestionStatus} from '../../workers/control-plane/src/p0b-ingestion-status.mjs';

const text=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
const manifest=JSON.parse(text('config/private-osint-working-sources.v1.json'));
const ogl=JSON.parse(text('config/official-ogl-atom-sources.json'));
const intended=manifest.sources.reduce((n,s)=>n+s.categories.length,0)+ogl.sources.length;

function dbFixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(text('workers/control-plane/migrations/0113_p0a_source_registry.sql'));
 db.exec(text('workers/control-plane/migrations/0114_p0_b_spool_queue.sql'));
 const sql=(statement,values=[])=>({
  bind(...args){return sql(statement,args)},
  async first(){return db.prepare(statement).get(...values)??null},
  async all(){return {results:db.prepare(statement).all(...values)}},
 });
 return {db,DB:{prepare:sql}};
}
test('P0-B source registry is exactly pinned, idempotent and research only',()=>{
 const tmp=mkdtempSync(join(tmpdir(),'geomacro-p0b-pinned-'));
 const path=join(tmp,'seed.sql');
 const {db}=dbFixture();
 try{
  const run=execFileSync('node',['scripts/ops/seed-p0b-pinned-registry.mjs','--output',path],
   {encoding:'utf8',cwd:new URL('../../',import.meta.url).pathname});
  const receipt=JSON.parse(run);
  const seed=readFileSync(path,'utf8');
  assert.equal(receipt.registry_config_rows,intended);
  assert.equal(receipt.commercial_rights_promoted,false);
  db.exec(seed);
  let row=db.prepare('SELECT COUNT(*) AS n,COUNT(DISTINCT source_id) AS ids FROM source_registry').get();
  assert.equal(row.n,intended);assert.equal(row.ids,intended);
  db.exec(seed);
  row=db.prepare('SELECT COUNT(*) AS n FROM source_registry').get();
  assert.equal(row.n,intended);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM source_registry WHERE rights_tier<>'RESEARCH_ONLY'").get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM source_registry WHERE country_iso3<>'GLOBAL'").get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM source_registry WHERE polling_interval_sec<>900").get().n,0);
  const present=db.prepare('SELECT DISTINCT intended_category FROM source_registry').all()
   .map(x=>x.intended_category).sort();
  assert.deepEqual(present,['CRITICAL_MINERALS','GEOPOLITICS','MACRO_FX']);
 }finally{db.close();rmSync(tmp,{recursive:true,force:true})}
});
test('P0-B admin readiness returns D1 state only and refuses empty registry',async()=>{
 const {db,DB}=dbFixture();
 try{
  const env={DB,GEOMACRO_P0B_ADMISSION_ACTIVE:'1',
   B2_KEY_ID:'not-a-secret',B2_APPLICATION_KEY:'not-a-secret',
   B2_SPOOL_ENCRYPTION_KEY:'not-a-secret',B2_SPOOL_BUCKET:'test',
   INGEST_QUEUE:{send:async()=>{}}};
  const before=await getP0bIngestionStatus(env);
  assert.equal(before.status,200);
  const empty=await before.json();
  assert.equal(empty.ready_for_real_acceptance,false);
  db.prepare('INSERT INTO source_registry '+
    '(source_id,canonical_endpoint,parser_type,intended_category,country_iso3,rights_tier,'+
     'polling_interval_sec,rate_limit_backoff) VALUES (?,?,?,?,?,?,?,?)').run(
    'p0b_test','https://example.org/rss','RSS_2','GEOPOLITICS','GLOBAL','RESEARCH_ONLY',
    900,'{"max_retries":1,"base_delay_ms":500,"respect_retry_after":true}');
  const live=await getP0bIngestionStatus(env), data=await live.json();
  assert.equal(data.ready_for_real_acceptance,true);
  assert.equal(data.genuine_end_to_end_b2_remote_acceptance_proven,false);
  assert.equal(data.source_registry.enabled,1);
  const asText=JSON.stringify(data);
  assert.ok(!asText.includes('example.org'));
  assert.ok(!asText.includes('not-a-secret'));
  const disabled=await getP0bIngestionStatus({...env,GEOMACRO_P0B_ADMISSION_ACTIVE:'0'});
  assert.equal((await disabled.json()).ready_for_real_acceptance,false);
 }finally{db.close()}
});
test('supported Wrangler queue probe and protected route are in canonical deploy',()=>{
 const deploy=text('.github/workflows/deploy-d1-control-plane.yml');
 const entry=text('workers/control-plane/src/index.mjs');
 assert.match(deploy,/queues info "\$queue"/u);
 assert.doesNotMatch(deploy,/queues list --json/u);
 assert.match(deploy,/Seed pinned private source registry with exact D1 readback/u);
 assert.match(deploy,/P0B_PRODUCTION_READINESS_UNVERIFIED/u);
 assert.match(entry,/authorized\(request, env\);[\s\S]{0,250}\/v1\/internal\/p0b\/status/u);
});
