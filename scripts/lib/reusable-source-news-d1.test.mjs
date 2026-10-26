import test from "node:test";
import assert from "node:assert/strict";
import {publishReusableSourceNews,publicReusableSourceNews} from "../../workers/control-plane/src/reusable-source-news.mjs";
import {createHash} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";

const now=Date.parse("2026-10-25T00:00:00.000Z"),at="2026-10-24T23:55:00.000Z";
const hash=x=>createHash("sha256").update(x).digest("hex");
function fixture(overrides={}){
 const base={
  schema:"geomacro.reusable-news-json.v1",
  id:"news-"+hash("source+article+clock"),
  id_is_cryptographic_proof:false,
  category:"macro",country_iso3:null,
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
    user_submission_persisted:false},
 };
 return {...base,...overrides};
}
function fakeD1(){
 const db=new DatabaseSync(":memory:");
 db.exec(readFileSync(new URL("../../workers/control-plane/migrations/0026_reusable_source_news.sql",import.meta.url),"utf8"));
 const metrics={queries:0,writes:0};
 return {DB:{
   prepare(sql){
     const statement={sql,params:[],
       bind(...args){statement.params=args;return statement},
       async first(){
         metrics.queries++;return db.prepare(sql).get(...statement.params)??null;
       },
       async all(){
         metrics.queries++;return {results:db.prepare(sql).all(...statement.params)};
       }};
     return statement;
   },
   async batch(statements){
     db.exec("BEGIN");
     try{
       const out=statements.map(stmt=>{
         metrics.writes++;metrics.queries++;
         db.prepare(stmt.sql).run(...stmt.params);
         return {success:true};
       });
       db.exec("COMMIT");return out;
     }catch(error){db.exec("ROLLBACK");throw error}
   },
 },metrics};
}
const check={source_ref:hash("allowlisted-registered-source"),category:"macro",
  state:"OBSERVED",checked_at:new Date(now).toISOString()};
test("trusted writer persists only factual fields and readback verifies D1",async()=>{
 const env=fakeD1(),candidate=fixture();
 const result=await publishReusableSourceNews(env,{
   schema:"geomacro.reusable-source-news-batch.v1",items:[candidate],checks:[check],
 },now);
 assert.equal(result.status,200,JSON.stringify(await result.clone().json()));
 const ack=await result.json();
 assert.equal(ack.d1_readback_verified,true);
 assert.equal(ack.raw_upstream_stored,false);
 assert.equal(ack.first_observed_within_15m_count,1);
 assert.equal(ack.first_observed_later_than_15m_count,0);
 assert.equal(ack.previously_observed_count,0);
 assert.equal(ack.first_observation_is_not_independent_verification,true);
 const get=await publicReusableSourceNews(env,new URLSearchParams(),now);
 const doc=await get.json();
 assert.equal(doc.items.length,1);
 assert.deepEqual(doc.items[0],candidate);
 assert.equal(doc.checked_source_states.OBSERVED,1);
 assert.equal(doc.commercial_product_ready,false);
});
test("only a recognized rights class is observed, never commercial permission",async()=>{
 for(const license of ["commercial","noncommercial","public_domain","unknown"]){
   const obj=fixture({usage_rights:{...fixture().usage_rights,declared_source_license:license}});
   const env=fakeD1();
   const ack=await publishReusableSourceNews(env,{
     schema:"geomacro.reusable-source-news-batch.v1",items:[obj],checks:[],
   },now);
   assert.equal(ack.status,200,JSON.stringify(await ack.clone().json()));
 }
});
test("untrusted paid flags, copied article, source URL and invalid proofs are rejected",async()=>{
 const base=fixture();
 const edits=[
  {source:{...base.source,original_url:"https://publisher.example/news"}},
  {delivery:{...base.delivery,downstream_paid_product_authorized:true}},
  {usage_rights:{...base.usage_rights,commercial_reuse_authorized:true}},
  {verification:{...base.verification,original_page_verified:true}},
  {headline:"Private source title must never go into public JSON"},
 ];
 for(const e of edits){
   await assert.rejects(()=>publishReusableSourceNews(fakeD1(),{
     schema:"geomacro.reusable-source-news-batch.v1",
     items:[fixture(e)],checks:[],
   },now),/REUSABLE_SOURCE_NEWS_INVALID/);
 }
});
test("public API only accepts explicitly allowed category and page",async()=>{
 const env=fakeD1();
 for(const qs of ["domain=bitcoin","offset=100","view=raw","domain=macro&domain=rare_earth"]){
   const answer=await publicReusableSourceNews(env,new URLSearchParams(qs),now);
   assert.equal(answer.status,400);
 }
});

test("rolling 25h D1 feed rejects older native publication, not mere retrieval timestamp",async()=>{
 const oldTime=new Date(now-25*3600000-1000).toISOString();
 const env=fakeD1();
 await assert.rejects(()=>publishReusableSourceNews(env,{
  schema:"geomacro.reusable-source-news-batch.v1",
  items:[fixture({source:{publisher_name:null,original_url:null,original_published_at:oldTime}})],
  checks:[],
 },now),/REUSABLE_SOURCE_NEWS_INVALID/);
 const valid=fixture({country_iso3:"IND"});
 const receipt=await publishReusableSourceNews(env,{
  schema:"geomacro.reusable-source-news-batch.v1",items:[valid],checks:[],
 },now);
 assert.equal(receipt.status,200);
 const result=await publicReusableSourceNews(env,
  new URLSearchParams("domain=macro&country=IND"),now);
 const body=await result.json();
 assert.equal(body.window_hours,25);
 assert.equal(body.country_filter,"IND");
 assert.equal(body.max_retained_news_items,4000);
 assert.equal(body.items.length,1);
 assert.equal(body.items[0].country_iso3,"IND");
 const absent=await publicReusableSourceNews(env,
  new URLSearchParams("country=USA"),now);
 assert.equal((await absent.json()).items.length,0);
});
test("40-news + 48-check batch uses at most seven D1 SQL queries and exact readback",async()=>{
 const env=fakeD1();
 const items=Array.from({length:40},(_,i)=>fixture({id:"news-"+hash("new:"+i)}));
 const checks=Array.from({length:48},(_,i)=>({...check,source_ref:hash("check:"+i)}));
 const initial=await publishReusableSourceNews(env,{
   schema:"geomacro.reusable-source-news-batch.v1",items,checks,
 },now);
 assert.equal(initial.status,200,JSON.stringify(await initial.clone().json()));
 const receipt=await initial.json();
 assert.equal(receipt.accepted,40);
 assert.equal(receipt.checked_sources,48);
 assert.equal(receipt.d1_readback_verified,true);
 assert.ok(receipt.d1_bundled_query_count<=7);
 const n=env.metrics.queries;
 const second=await publishReusableSourceNews(env,{
   schema:"geomacro.reusable-source-news-batch.v1",items,checks,
 },now+60_000);
 const again=await second.json();
 assert.equal(second.status,200);
 assert.equal(again.previously_observed_count,40);
 assert.equal(again.first_observed_within_15m_count,0);
 assert.equal(again.d1_bundled_query_count,3,
   "repeat batch should skip expiration and expensive 4000-row pruning");
 assert.equal(env.metrics.queries-n,3);
 const page=await publicReusableSourceNews(env,new URLSearchParams(),now+60_000);
 assert.equal((await page.json()).items.length,40);
});
test("bounded 25h country paging rejects arbitrary offsets",async()=>{
 const env=fakeD1();
 for(const query of ["offset=100","offset=4000","offset=-200",
  "country=india","country=ZZZZ","country=IND&country=USA"]){
   const res=await publicReusableSourceNews(env,new URLSearchParams(query),now);
   assert.equal(res.status,400,query);
 }
 for(const q of ["offset=200","offset=3800"]){
   const res=await publicReusableSourceNews(env,new URLSearchParams(q),now);
   assert.equal(res.status,200,q);
 }
});

test("same published news ID is safely reprojected from legacy null country into ISO3 country without duplicates",async()=>{
 const env=fakeD1(),legacy=fixture(),upgraded=fixture({country_iso3:"IND"});
 for(const item of [legacy,upgraded]){
  const response=await publishReusableSourceNews(env,{
   schema:"geomacro.reusable-source-news-batch.v1",items:[item],checks:[],
  },now);
  assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
  assert.equal((await response.json()).d1_readback_verified,true);
 }
 const scoped=await publicReusableSourceNews(env,new URLSearchParams("country=IND"),now);
 const body=await scoped.json();
 assert.equal(body.items.length,1);
 assert.deepEqual(body.items[0],upgraded);
 assert.equal(body.window_hours,25);
});

test("durable first-seen measures late publication once, never counts duplicate upserts as fresh",async()=>{
 const env=fakeD1(),old=new Date(now-40*60_000).toISOString();
 const item=fixture({source:{publisher_name:null,original_url:null,original_published_at:old}});
 const first=await publishReusableSourceNews(env,{
  schema:"geomacro.reusable-source-news-batch.v1",items:[item],checks:[],
 },now);
 assert.equal(first.status,200);
 const firstAck=await first.json();
 assert.equal(firstAck.first_observed_later_than_15m_count,1);
 assert.equal(firstAck.first_observed_within_15m_count,0);
 const repeat=await publishReusableSourceNews(env,{
  schema:"geomacro.reusable-source-news-batch.v1",items:[item],checks:[],
 },now+1000);
 assert.equal(repeat.status,200);
 const ack=await repeat.json();
 assert.equal(ack.first_observed_later_than_15m_count,0);
 assert.equal(ack.first_observed_within_15m_count,0);
 assert.equal(ack.previously_observed_count,1);
 assert.equal(ack.first_observation_is_not_independent_verification,true);
});
