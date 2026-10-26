import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {createHash,createHmac} from "node:crypto";
import {normalizeReusableNewsJson} from "../../src/lib/reusable-news-json.ts";
import {privateOsintBundleRead,PRIVATE_OSINT_BUNDLE_SCHEMA} from "../../workers/control-plane/src/private-osint-bundle.mjs";
import {handlePrivateOsint15m} from "../../workers/control-plane/src/private-osint-15m.mjs";
const now=Date.parse('2026-10-25T12:00:00.000Z'),root='a'.repeat(64);
function fixture(){
 const db=new DatabaseSync(':memory:');
 for(const file of ['0028_private_osint_15m_durable.sql','0029_private_osint_bundle_index.sql'])
  db.exec(readFileSync(new URL('../../workers/control-plane/migrations/'+file,import.meta.url),'utf8'));
 let batches=0;
 const env={CONTROL_PLANE_TOKEN:root,DB:{prepare(sql){
  const q={sql,params:[],bind(...params){q.params=params;return q}};return q;
 },async batch(qs){
  batches++;db.exec('BEGIN');try{
   const result=qs.map(q=>({success:true,results:db.prepare(q.sql).all(...q.params)}));
   db.exec('COMMIT');return result;
  }catch(error){db.exec('ROLLBACK');throw error}
 }}};
 function insert(category,n,country='IND',first=now-60000){
  const id=createHash('sha256').update(category+':'+n).digest('hex');
  const native=new Date(now-8*60000).toISOString();
  const item={...normalizeReusableNewsJson({category,country_iso3:country,
   text:'Central bank announces inflation, security sanctions and critical minerals policy',published_at:native}),id:'news-'+id};
  db.prepare('INSERT INTO private_osint_news_25h(item_id,category,country_iso3,native_feed_published_at,projection_json,first_seen_at,last_seen_at) VALUES(?,?,?,?,?,?,?)')
   .run(id,category,country,native,JSON.stringify(item),new Date(first).toISOString(),new Date(first).toISOString());
 }
 for(let i=0;i<105;i++)insert('geopolitics',i);
 for(let i=0;i<2;i++)insert('macro',i,'USA');
 for(let i=0;i<3;i++)insert('rare_earth',i,'CAN');
 return {env,db,insert,batches:()=>batches};
}
test('one protected D1 batch returns all three lanes; keyset pages avoid duplicates and later arrivals',async()=>{
 const f=fixture();try{
  const response=await privateOsintBundleRead(f.env,new URLSearchParams('view=bundle'),now);
  assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private, no-store/u);
  const first=await response.json();assert.equal(first.schema,PRIVATE_OSINT_BUNDLE_SCHEMA);
  assert.equal(f.batches(),1);assert.equal(first.single_d1_batch_read,true);
  assert.equal(first.categories.geopolitics.count,100);assert.equal(first.categories.macro.count,2);
  assert.equal(first.categories.rare_earth.count,3);assert.equal(first.total_items,105);
  assert.equal(first.original_page_verified,false);assert.equal(first.commercial_use_authorized,false);
  assert.equal(first.has_more,true);assert.ok(first.next_cursor);
  f.insert('geopolitics',999,'IND',now+1000);
  const next=new URLSearchParams({view:'bundle',cursor:first.next_cursor});
  const second=await (await privateOsintBundleRead(f.env,next,now+60000)).json();
  assert.equal(f.batches(),2);assert.equal(second.total_items,5);
  assert.equal(second.categories.macro.count,0);assert.equal(second.categories.rare_earth.count,0);
  assert.equal(second.has_more,false);assert.equal(second.next_cursor,null);
  const ids=[...first.categories.geopolitics.items,...second.categories.geopolitics.items].map(i=>i.id);
  assert.equal(new Set(ids).size,105);
  const plan=f.db.prepare('EXPLAIN QUERY PLAN SELECT item_id FROM private_osint_news_25h WHERE category=? AND native_feed_published_at>=? ORDER BY native_feed_published_at DESC,item_id DESC LIMIT 101').all('macro',new Date(now-25*3600000).toISOString());
  assert.match(JSON.stringify(plan),/idx_private_osint_category_clock/u);
 }finally{f.db.close()}
});
test('country filter is bound to pagination; malformed cursors and scope changes never query D1',async()=>{
 const f=fixture();try{
  const body=await (await privateOsintBundleRead(f.env,new URLSearchParams('view=bundle&country=IND'),now)).json();
  assert.equal(body.categories.macro.count,0);assert.equal(body.categories.rare_earth.count,0);
  const before=f.batches();
  for(const query of [new URLSearchParams({view:'bundle',country:'USA',cursor:body.next_cursor}),
   new URLSearchParams('view=bundle&cursor=garbage'),new URLSearchParams('view=bundle&country=IND&country=USA'),
   new URLSearchParams('view=bundle&offset=0'),new URLSearchParams('view=bundle&category=crypto')])
   assert.equal((await privateOsintBundleRead(f.env,query,now)).status,400);
  assert.equal(f.batches(),before);
 }finally{f.db.close()}
});
test('bundle reader retains the distinct private credential and rejects corrupted source projections',async()=>{
 const f=fixture();try{
  for(const token of ['',root]){
   const r=await handlePrivateOsint15m(new Request('https://example.org/v1/internal/private-osint-15m?view=bundle',{
    headers:{Authorization:'Bearer '+token}}),f.env);
   assert.equal(r.status,401);
  }
  assert.equal(f.batches(),0);
  const privateToken=createHmac('sha256',root).update('geomacro-private-osint-15m-v1').digest('hex');
  const ok=await handlePrivateOsint15m(new Request('https://example.org/v1/internal/private-osint-15m?view=bundle',{
   headers:{Authorization:'Bearer '+privateToken}}),f.env);
  assert.equal(ok.status,200);assert.equal(f.batches(),1);
  const row=f.db.prepare("SELECT item_id,projection_json FROM private_osint_news_25h WHERE category='macro' LIMIT 1").get();
  const corrupt=JSON.parse(row.projection_json);corrupt.source.original_url='https://publisher.example/raw-article';
  f.db.prepare('UPDATE private_osint_news_25h SET projection_json=? WHERE item_id=?').run(JSON.stringify(corrupt),row.item_id);
  const denied=await privateOsintBundleRead(f.env,new URLSearchParams('view=bundle'),now);
  assert.equal(denied.status,503);assert.ok(!(await denied.text()).includes('raw-article'));
 }finally{f.db.close()}
});

test('private one-row proof mode reads at most two indexed rows per category without changing full pagination',async()=>{
 const f=fixture();try{
  const proof=await privateOsintBundleRead(f.env,new URLSearchParams('view=bundle&limit=1'),now);
  assert.equal(proof.status,200);
  const b=await proof.json();
  assert.equal(f.batches(),1);
  assert.equal(b.single_d1_batch_read,true);
  assert.equal(b.category_count,3);
  assert.equal(b.page_size_per_category,1);
  assert.equal(b.total_items,3);
  assert.deepEqual(['geopolitics','macro','rare_earth'].map(d=>b.categories[d].count),[1,1,1]);
  assert.ok(b.has_more);assert.ok(b.next_cursor);
  const next=await privateOsintBundleRead(f.env,new URLSearchParams({
    view:'bundle',limit:'1',cursor:b.next_cursor
  }),now);
  assert.equal(next.status,200);
  const second=await next.json();
  assert.equal(second.page_size_per_category,1);
  assert.ok(second.categories.geopolitics.items[0].id!==b.categories.geopolitics.items[0].id);
  // Reject unbounded scans, duplicate query parameters and tampering
  // before contacting the protected D1 database.
  const before=f.batches();
  for(const query of [
   'view=bundle&limit=2','view=bundle&limit=100','view=bundle&limit=0',
   'view=bundle&limit=1&limit=1','view=bundle&limit=4294967295'
  ]){
   const denied=await privateOsintBundleRead(f.env,new URLSearchParams(query),now);
   assert.equal(denied.status,400,query);
  }
  assert.equal(f.batches(),before);
 }finally{f.db.close()}
});
