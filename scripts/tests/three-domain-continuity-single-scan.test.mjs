import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {threeDomainEvidenceContinuity} from '../../workers/control-plane/src/three-domain-evidence-continuity.mjs';
import {readDerivedStories} from '../../workers/control-plane/src/website-derived-intelligence.mjs';
const now=Date.parse('2026-10-30T06:00:00Z');
const domains=['geopolitics','macro','rare_earth'];
function fixture(n){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE website_derived_intelligence(id TEXT PRIMARY KEY,category TEXT,published_at TEXT,date_precision TEXT,story_json TEXT,first_seen_at TEXT);
 CREATE INDEX published ON website_derived_intelligence(published_at DESC,id DESC);
 CREATE TABLE pipeline_checkpoint(pipeline TEXT,scope TEXT,metadata_json TEXT,status TEXT,last_attempt_at TEXT,PRIMARY KEY(pipeline,scope));`);
 const insert=db.prepare('INSERT INTO website_derived_intelligence VALUES(?,?,?,?,?,?)');
 for(let i=0;i<n;i++){
  const category=domains[i%3],published_at=new Date(now-3600000-i*1000).toISOString();
  const s={id:category+'-'+i.toString(16).padStart(8,'0'),category,
   title:'Geomacro finds an official source release in the relevant domain',
   what_changed:'An official publisher released a statement relevant to this monitored category.',
   why_it_matters:'The release may affect operating conditions but no causal impact is verified.',
   topic:['foreign policy','monetary policy','rare-earth supply'][i%3],
   development_type:'policy update',geography:null,published_at,date_precision:'exact',
   observed_release_count:1,sources_credited:[],status:'official_release_observed_unscored',
   same_event_corrob_verified:false,severity:null};
  insert.run(s.id,category,published_at,'exact',JSON.stringify(s),new Date(now-1000).toISOString());
 }
 const queries=[];
 const env={DB:{prepare(sql){queries.push(sql);let args=[];const query={bind(...values){args=values;return query},async all(){return {results:db.prepare(sql).all(...args)}},async first(){return db.prepare(sql).get(...args)}};return query}}};
 return {db,env,queries};
}
for(const count of [0,1,250,251,500,600])test(`one canonical scan preserves all ${count} rows and native clocks`,async()=>{
 const {db,env,queries}=fixture(count);
 try{
  const baseline=[];
  for(const offset of [0,250,500]){
   const page=await (await readDerivedStories(env,now,offset)).json();
   baseline.push(...page.signals);if(!page.has_more)break;
  }
  const priorScans=queries.filter(q=>q.includes('website_derived_intelligence')).length;
  queries.length=0;
  const response=await threeDomainEvidenceContinuity(env,now);
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.journal_complete,true);
  const scans=queries.filter(q=>q.includes('website_derived_intelligence'));
  assert.equal(scans.length,1);assert.ok(!scans[0].includes('OFFSET'));
  if(count>500)assert.equal(priorScans,3);
  for(const domain of domains){
   const expected=baseline.filter(s=>s.category===domain);
   const actual=result.categories[domain];
   assert.equal(actual.native_news_event_count_72h,expected.length);
   assert.equal(actual.latest_native_news_published_at,expected[0]?.published_at??null);
   assert.deepEqual(actual.source_neutral_news.map(s=>[s.id,s.published_at]),expected.slice(0,5).map(s=>[s.id,s.published_at]));
   assert.equal(actual.commercial_rights_verified,false);
  }
  assert.equal(result.chargeable,false);assert.equal(result.signed_gro_verified,false);
 }finally{db.close()}
});
test('over-cap canonical journal fails closed without truncating into success',async()=>{
 const {db,env}=fixture(601);
 try{const response=await threeDomainEvidenceContinuity(env,now);assert.equal(response.status,503)}finally{db.close()}
});
