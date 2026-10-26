import test from "node:test";
import assert from "node:assert/strict";
import {createHash,createHmac} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {handlePrivateOsint15m,privateOsint15mWrite,privateOsint15mRead,privateOsintD1FailureClass,PRIVATE_OSINT_D1_SCHEMA} from "../../workers/control-plane/src/private-osint-15m.mjs";
const now=Date.parse("2026-10-25T12:00:00.000Z");
const at="2026-10-25T11:52:00.000Z";
const hash=x=>createHash("sha256").update(x).digest("hex");
const root="a".repeat(64),token=createHmac("sha256",root).update("geomacro-private-osint-15m-v1").digest("hex");
function item(o={}){
 return {
  schema:"geomacro.reusable-news-json.v1",id:"news-"+hash("source:article:clock"),
  id_is_cryptographic_proof:false,category:"macro",country_iso3:"IND",
  source:{publisher_name:null,original_url:null,original_published_at:at},
  facts:{event_types:["inflation"],action_terms:["announce"],
    named_organizations:["Federal Reserve"],numeric_mentions:[{value:"25",unit:"basis points",scale:null}],
    fact_extraction_status:"MACHINE_EXTRACTED_UNVERIFIED"},
  usage_rights:{declared_source_license:"unknown",declaration_is_verified:false,
   article_specific_permission_verified:false,commercial_reuse_authorized:false,
   attribution_and_scope_review_required:true,factual_analysis_only:true},
  verification:{original_page_verified:false,independent_event_verified:false,
   facts_reviewed:false,source_licence_verified:false},
  delivery:{raw_article_included:false,raw_headline_included:false,
   downstream_paid_product_authorized:false,signing_authorized:false,
   user_submission_persisted:false},...o,
 };
}
const check=()=>({source_ref:hash("source-endpoint+macro"),category:"macro",
 state:"OBSERVED",checked_at:new Date(now).toISOString()});
function fakeD1(){
 const items=new Map(),checks=new Map();
 const env={CONTROL_PLANE_TOKEN:root,DB:{
  prepare(sql){
   let params=[];
   const stmt={sql,bind(...xs){params=xs;stmt.params=xs;return stmt},
    async first(){
     if(sql.includes("FROM private_osint_news_25h WHERE item_id")){
      const x=items.get(params[0]);return x??null;
     }return null;
    },
    async all(){
     if(sql.includes("WHERE item_id IN ("))return {results:params.map(id=>items.get(id)).filter(Boolean)};
     if(sql.includes("SELECT projection_json,first_seen_at,last_seen_at")){
      let rows=[...items.values()].filter(x=>x.native_feed_published_at>=params[0]);
      if(sql.includes("category=?")) rows=rows.filter(x=>x.category===params[1]);
      if(sql.includes("country_iso3=?"))rows=rows.filter(x=>x.country_iso3===params[sql.includes("category=?")?2:1]);
      rows.sort((a,b)=>b.native_feed_published_at.localeCompare(a.native_feed_published_at));
      return {results:rows.slice(Number(params.at(-1)),Number(params.at(-1))+101)};
     }return {results:[]};
    }};
   return stmt;
  },
  async batch(qs){
   for(const q of qs){
    if(q.sql.startsWith("INSERT INTO private_osint_news_25h")){
     const [item_id,category,country_iso3,native_feed_published_at,projection_json,first_seen_at,last_seen_at]=q.params;
     items.set(item_id,{item_id,category,country_iso3,native_feed_published_at,
      projection_json,first_seen_at:items.get(item_id)?.first_seen_at??first_seen_at,last_seen_at});
    }else if(q.sql.startsWith("INSERT INTO private_osint_source_checks_24h")){
     for(let i=0;i<q.params.length-1;i+=4)checks.set(q.params[i]+q.params[i+1],q.params.slice(i,i+4));
    }else if(q.sql.startsWith("DELETE FROM private_osint_news_25h WHERE native_feed_published_at")){
     for(const [k,v] of items)if(v.native_feed_published_at<q.params[0])items.delete(k);
    }
   }return [];
  },
 }};
 return {env,items,checks};
}
test("scoped authenticated route is not a public or root-admin URL",async()=>{
 const {env}=fakeD1();
 for(const auth of [null,"Bearer "+root,"Bearer "+("0".repeat(64))]){
  const r=await handlePrivateOsint15m(new Request("https://example.org/v1/internal/private-osint-15m",{
   headers:auth?{Authorization:auth}:{}}),env);
  assert.equal(r.status,401);
  assert.equal((await r.json()).error,"UNAUTHORIZED");
 }
 const response=await handlePrivateOsint15m(new Request("https://example.org/v1/internal/private-osint-15m?offset=0",{
  headers:{Authorization:"Bearer "+token}}),env);
 assert.equal(response.status,200);
 const result=await response.json();
 assert.equal(result.items.length,0);
 assert.equal(result.scope,"PROTECTED_INTERNAL_OSINT_RESEARCH_ONLY");
 assert.equal(result.original_page_verified,false);
 assert.equal(result.commercial_use_authorized,false);
 assert.equal(result.independent_verification_required_for_ingestion,false);
});
test("largest valid write bundles reads below D1 Free query and parameter ceilings",async()=>{
 const db=new DatabaseSync(':memory:');
 db.exec(readFileSync(new URL('../../workers/control-plane/migrations/0028_private_osint_15m_durable.sql',import.meta.url),'utf8'));
 let queries=0,maxParameters=0;
 const env={DB:{prepare(sql){
  const q={sql,params:[],bind(...params){q.params=params;maxParameters=Math.max(maxParameters,params.length);return q},
   async all(){queries++;return {results:db.prepare(sql).all(...q.params)}}};return q;
 },async batch(qs){
  db.exec('BEGIN');try{
   const result=qs.map(q=>{queries++;return {success:true,meta:{changes:Number(db.prepare(q.sql).run(...q.params).changes)}}});
   db.exec('COMMIT');return result;
  }catch(error){db.exec('ROLLBACK');throw error}
 }}};
 try{
  const body={schema:PRIVATE_OSINT_D1_SCHEMA,
   items:Array.from({length:20},(_,n)=>item({id:'news-'+hash('bundle:'+n)})),
   checks:Array.from({length:32},(_,n)=>({...check(),source_ref:hash('check:'+n)}))};
  const response=await privateOsint15mWrite(env,body,now),receipt=await response.json();
  assert.equal(response.status,200);assert.equal(receipt.persisted,20);assert.equal(receipt.checks_saved,32);
  assert.equal(receipt.existence_and_readback_bundled,true);
  assert.equal(receipt.d1_queries_this_write,queries);assert.equal(queries,27);
  assert.ok(queries<50);assert.ok(maxParameters<=100);
  assert.equal(db.prepare('SELECT count(*) AS n FROM private_osint_source_checks_24h').get().n,32);
 }finally{db.close()}
});
test("actual news native-clock timestamp is durable, 15m first_seen measured; duplicate does not reset",async()=>{
 const {env,items,checks}=fakeD1(),body={schema:PRIVATE_OSINT_D1_SCHEMA,items:[item()],checks:[check()]};
 const first=await privateOsint15mWrite(env,body,now);
 assert.equal(first.status,200);
 const receipt=await first.json();
 assert.equal(receipt.persisted,1);
 assert.equal(receipt.checks_saved,1);
 assert.equal(receipt.native_feed_to_first_durable_write_within_15m,1);
 assert.equal(receipt.d1_exact_readback_verified,true);
 assert.equal(receipt.independent_verification_required_for_ingestion,false);
 assert.equal(body.items[0].verification.independent_event_verified,false);
 assert.equal(checks.size,1);
 const saved=[...items.values()][0];
 assert.equal(saved.first_seen_at,new Date(now).toISOString());
 const second=await privateOsint15mWrite(env,{
  ...body,checks:[{...check(),checked_at:new Date(now+60000).toISOString()}]},now+60000);
 assert.equal(second.status,200);
 assert.equal([...items.values()][0].first_seen_at,new Date(now).toISOString());
 const read=await privateOsint15mRead(env,new URLSearchParams("category=macro&country=IND"),now+60000);
 const doc=await read.json();
 assert.equal(doc.items[0].private_first_seen_at,new Date(now).toISOString());
 assert.equal(doc.items[0].original_page_independently_verified,false);
 assert.equal(doc.items[0].country_iso3,"IND");
 assert.equal(doc.items[0].source.original_url,null);
});
test("stale, future, raw body, copied source URL, fake rights and forged original proof rejected",async()=>{
 for(const bad of [
  {source:{...item().source,original_published_at:new Date(now-25*3600000-1000).toISOString()}},
  {source:{...item().source,original_published_at:new Date(now+60000).toISOString()}},
  {source:{...item().source,original_url:"https://publisher.example/private"}},
  {verification:{...item().verification,original_page_verified:true}},
  {delivery:{...item().delivery,downstream_paid_product_authorized:true}},
  {raw_article:"copied full publisher body"},
 ]){
  await assert.rejects(privateOsint15mWrite(fakeD1().env,{
   schema:PRIVATE_OSINT_D1_SCHEMA,items:[item(bad)],checks:[],
  },now),/REUSABLE_SOURCE_NEWS_INVALID/);
 }
});
test("malformed and oversized writes fail closed, no query scope escalation",async()=>{
 const env=fakeD1().env;
 await assert.rejects(privateOsint15mWrite(env,{
  schema:PRIVATE_OSINT_D1_SCHEMA,items:[item(),item()],checks:[],
 },now),/PRIVATE_OSINT_RESEARCH_INPUT_INVALID/);
 for(const s of ["country=india","offset=5","category=btc","x=raw"]){
  assert.equal((await privateOsint15mRead(env,new URLSearchParams(s),now)).status,400);
 }
});
test("real SQLite coalesces duplicate poll writes while preserving immediate new first-seen and state changes",async()=>{
 const db=new DatabaseSync(':memory:');
 db.exec(readFileSync(new URL('../../workers/control-plane/migrations/0028_private_osint_15m_durable.sql',import.meta.url),'utf8'));
 const env={DB:{prepare(sql){
  const q={sql,params:[],bind(...params){q.params=params;return q},
   async first(){return db.prepare(sql).get(...q.params)??null},
   async all(){return {results:db.prepare(sql).all(...q.params)}}};return q;
 },async batch(statements){
  db.exec('BEGIN');try{
   const result=statements.map(s=>({success:true,meta:{changes:Number(db.prepare(s.sql).run(...s.params).changes)}}));
   db.exec('COMMIT');return result;
  }catch(error){db.exec('ROLLBACK');throw error}
 }}};
 const count=()=>Number(db.prepare('SELECT total_changes() AS n').get().n);
 const write=async(time,state='OBSERVED')=>{
  const response=await privateOsint15mWrite(env,{schema:PRIVATE_OSINT_D1_SCHEMA,items:[item()],
   checks:[{...check(),checked_at:new Date(time).toISOString(),state}]},time);
  assert.equal(response.status,200);return response.json();
 };
 try{
  await write(now);assert.equal(count(),2);
  const duplicate=await write(now+60000);assert.equal(count(),2);
  assert.equal(duplicate.d1_exact_readback_verified,true);
  assert.equal(duplicate.duplicate_news_last_seen_refresh_hours,6);
  await write(now+120000,'DENIED');assert.equal(count(),3);
  await write(now+62*60000,'DENIED');assert.equal(count(),4);
  await write(now+6*3600000+60000,'DENIED');assert.equal(count(),6);
  const row=db.prepare('SELECT first_seen_at,last_seen_at FROM private_osint_news_25h').get();
  assert.equal(row.first_seen_at,new Date(now).toISOString());
  assert.equal(row.last_seen_at,new Date(now+6*3600000+60000).toISOString());
 }finally{db.close()}
});

test("D1 durably accepts a newly seen news record after 15m and never resets first_seen on repeat",async()=>{
 const {env,items}=fakeD1();
 const late=item({id:"news-"+hash("genuine-late-arrival"),
  source:{publisher_name:null,original_url:null,
   original_published_at:new Date(now-2*3600000).toISOString()}});
 const body={schema:PRIVATE_OSINT_D1_SCHEMA,items:[late],checks:[check()]};
 const initial=await privateOsint15mWrite(env,body,now);
 assert.equal(initial.status,200);
 const first=await initial.json();
 assert.equal(first.persisted,1);
 assert.equal(first.native_feed_to_first_durable_write_within_15m,0);
 assert.equal(first.native_feed_to_first_durable_write_over_15m,1);
 assert.equal(first.newly_persisted_after_15m,1);
 assert.equal(first.newly_persisted_within_15m,0);
 assert.equal(first.previously_persisted_reobserved,0);
 assert.equal(first.late_arrivals_not_rejected_by_15m_cutoff,true);
 const firstSeen=[...items.values()][0].first_seen_at;
 const repeated=await privateOsint15mWrite(env,{...body,checks:[
  {...check(),checked_at:new Date(now+60_000).toISOString()}]},now+60_000);
 assert.equal(repeated.status,200);
 const again=await repeated.json();
 assert.equal(again.persisted,1);
 assert.equal(again.native_feed_to_first_durable_write_over_15m,1);
 assert.equal(again.newly_persisted_after_15m,0);
 assert.equal(again.previously_persisted_reobserved,1);
 assert.equal([...items.values()][0].first_seen_at,firstSeen);
 const response=await privateOsint15mRead(env,new URLSearchParams("category=macro"),now+60_000);
 const readback=await response.json();
 assert.equal(readback.items.length,1);
 assert.equal(readback.items[0].private_first_seen_at,firstSeen);
 assert.equal(readback.items[0].commercially_eligible,false);
});

test("protected D1 write categorizes free quota and missing schema without SQL disclosure",async()=>{
 assert.equal(privateOsintD1FailureClass({message:"Your account has exceeded D1's free tier daily row read limit. Upgrade or wait"}),"D1_FREE_DAILY_ROW_READ_LIMIT");
 assert.equal(privateOsintD1FailureClass({message:"Your account has exceeded D1's free tier daily row write limit."}),"D1_FREE_DAILY_ROW_WRITE_LIMIT");
 assert.equal(privateOsintD1FailureClass({message:"no such table: private_osint_news_25h"}),"D1_SCHEMA_UNAVAILABLE");
 assert.equal(privateOsintD1FailureClass({message:"secret internal SQL + payment data"}),"D1_UNCLASSIFIED_STORAGE_FAILURE");
 const message="Your account has exceeded D1's free tier daily row read limit. private secret!";
 const fail=await privateOsint15mWrite({DB:{prepare(){throw Error(message)}}},
   {schema:PRIVATE_OSINT_D1_SCHEMA,items:[],checks:[check()]},now);
 assert.equal(fail.status,503);
 const body=await fail.json();
 assert.equal(body.failure_class,"D1_FREE_DAILY_ROW_READ_LIMIT");
 assert.equal(body.retry_after_utc,"2026-10-26T00:00:00.000Z");
 assert.equal(body.write_or_readback_commit_status_unknown,true);
 assert.equal(body.public_published,false);
 assert.equal(body.paid_product_authorized,false);
 assert.ok(!JSON.stringify(body).includes("secret"));
});
