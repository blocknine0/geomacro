import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {getP0bIngestionStatus} from '../../workers/control-plane/src/p0b-ingestion-status.mjs';
import {verifyLatestP0bCommitted} from '../../workers/control-plane/src/p0b-production-verifier.mjs';

const text=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
const manifest=JSON.parse(text('config/private-osint-working-sources.v1.json'));
const ogl=JSON.parse(text('config/official-ogl-atom-sources.json'));
const intended=manifest.sources.reduce((n,s)=>n+s.categories.length,0)+ogl.sources.length;

function dbFixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(text('workers/control-plane/migrations/0113_p0a_source_registry.sql'));
 db.exec(text('workers/control-plane/migrations/0114_p0_b_spool_queue.sql'));
 db.exec(text('workers/control-plane/migrations/0115_p0_b_storage_circuit.sql'));
 const sql=(statement,values=[])=>({
  bind(...args){return sql(statement,args)},
  async first(){return db.prepare(statement).get(...values)??null},
  async all(){return {results:db.prepare(statement).all(...values)}},
 });
 return {db,DB:{prepare:sql}};
}
test('P0-B source registry is exactly pinned, idempotent and research only',()=>{
 const path=new URL('../../workers/control-plane/p0b-seed.generated.sql',import.meta.url);
 const {db}=dbFixture();
 try{
  const run=execFileSync('node',['scripts/ops/seed-p0b-pinned-registry.mjs'],
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
 }finally{db.close();rmSync(path,{force:true})}
});
test('P0-B admin readiness returns D1 state only and refuses empty registry',async()=>{
 const {db,DB}=dbFixture();
 try{
  const env={DB,GEOMACRO_P0B_ADMISSION_ACTIVE:'1',
   B2_KEY_ID:'not-a-secret',B2_APPLICATION_KEY:'not-a-secret',
   B2_SPOOL_ENCRYPTION_KEY:'not-a-secret',B2_SPOOL_BUCKET:'test',B2_SPOOL_PREFIX:'spool/',
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
  assert.doesNotMatch(asText,/https?:\/\//u);
  assert.doesNotMatch(asText,/not-a-secret/u);
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
 assert.match(entry,/\/v1\/internal\/p0b\/verify-latest/u);
 const monitor=text('.github/workflows/p0b-production-parity-hourly.yml');
 assert.match(monitor,/P0B_REAL_B2_D1_PARITY_VERIFIED/u);
 assert.match(monitor,/source_rights_granted==false/u);
});

test('P0-B real parity endpoint rejects no committed item and verifies exact D1 pointer',async()=>{
 const {db,DB}=dbFixture();
 const hash='a'.repeat(64),uri='b2://spool/20261104/p0b_test/'+hash+'.json';
 try{
  const env={DB,GEOMACRO_P0B_ADMISSION_ACTIVE:'1'};
  const none=await verifyLatestP0bCommitted(env);
  assert.equal(none.status,409);
  assert.equal((await none.json()).verified,false);
  db.prepare('INSERT INTO source_registry '+
   '(source_id,canonical_endpoint,parser_type,intended_category,country_iso3,rights_tier,'+
   'polling_interval_sec,rate_limit_backoff) VALUES (?,?,?,?,?,?,?,?)').run(
    'p0b_test','https://example.org/rss','RSS_2','GEOPOLITICS','GLOBAL','RESEARCH_ONLY',
    900,'{"max_retries":1,"base_delay_ms":500,"respect_retry_after":true}');
  db.prepare('INSERT INTO ingestion_spool_queue '+
   '(id,candidate_sha256,source_id,b2_spool_uri,b2_byte_size,state,d1_committed_at,acked_at) '+
   'VALUES (?,?,?,?,?,?,?,?)').run(
    '00000000-0000-4000-8000-000000000000',hash,'p0b_test',uri,123,'D1_COMMITTED',
    '2026-11-04T03:00:00Z','2026-11-04T03:00:00Z');
  db.prepare('INSERT INTO normalized_articles '+
   '(id,candidate_sha256,source_id,b2_archive_uri,status) VALUES (?,?,?,?,?)').run(
    '00000000-0000-4000-8000-000000000001',hash,'p0b_test',uri,'ADMITTED');
  let calls=0;
  const response=await verifyLatestP0bCommitted(env,{manager:{
   async readVerified(actualUri,sha,id){
    calls++;
    assert.equal(actualUri,uri);assert.equal(sha,hash);assert.equal(id,'p0b_test');
    return {candidateSha256:hash,sourceId:'p0b_test'};
   }
  }});
  assert.equal(response.status,200);
  const receipt=await response.json();
  assert.equal(receipt.verified,true);
  assert.equal(receipt.original_article_page_verified,false);
  assert.equal(receipt.source_rights_granted,false);
  assert.equal(calls,1);
  db.prepare("UPDATE normalized_articles SET b2_archive_uri='b2://other'").run();
  const bad=await verifyLatestP0bCommitted(env,{manager:{
   async readVerified(){throw Error('should never read if D1 pointer differs')}
  }});
  assert.equal(bad.status,503);
  assert.equal((await bad.json()).verified,false);
 }finally{db.close()}
});

test('P0-B permanent activation reuses existing private archive credentials and dedicated domain key',()=>{
 const deploy=text('.github/workflows/deploy-d1-control-plane.yml');
 const parity=text('.github/workflows/p0b-production-parity-hourly.yml');
 assert.match(deploy,/P0B_ACTIVATE: "1"/u);
 assert.match(deploy,/P0B_B2_BUCKET: geomacro-private-archive/u);
 assert.ok(deploy.includes('P0B_B2_KEY_ID: ${{ secrets.B2_KEY_ID }}'));
 assert.ok(deploy.includes('P0B_B2_APPLICATION_KEY: ${{ secrets.B2_APPLICATION_KEY }}'));
 assert.match(deploy,/geomacro-p0b-private-spool-aes-gcm-v1/u);
 assert.match(deploy,/P0B_EXISTING_B2_ACCESS_KEY_MISSING/u);
 assert.match(deploy,/P0B_EXISTING_B2_SECRET_KEY_MISSING/u);
 assert.match(parity,/P0B_REAL_B2_D1_PARITY_VERIFIED/u);
 assert.doesNotMatch(parity,/GEOMACRO_P0B_ENABLE/u);
});

test('Production activation requires real B2 key capability preflight and exact spool prefix',()=>{
 const deployment=text('.github/workflows/deploy-d1-control-plane.yml');
 assert.match(deployment,/Verify actual B2 key scope and derive allowed private spool prefix/u);
 assert.match(deployment,/scripts\/ops\/p0b-b2-scope-preflight\.mjs/u);
 assert.match(deployment,/B2_SPOOL_PREFIX=prefix/u);
 assert.match(deployment,/P0B_VERIFIED_B2_STORAGE_SCOPE_REQUIRED/u);
 const monitor=text('.github/workflows/p0b-production-parity-hourly.yml');
 assert.match(monitor,/b2_storage_guard/u);
});
