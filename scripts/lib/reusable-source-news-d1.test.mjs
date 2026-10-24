import test from "node:test";
import assert from "node:assert/strict";
import {publishReusableSourceNews,publicReusableSourceNews} from "../../workers/control-plane/src/reusable-source-news.mjs";
import {createHash} from "node:crypto";

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
 const news=new Map(),status=new Map();
 return {DB:{
   prepare(sql){
     let args=[];
     const statement={
       bind(...input){args=input;statement.args=input;return statement},
       async first(){if(sql.includes("FROM reusable_news_items WHERE item_id")){
         const found=news.get(args[0]);return found?{projection_json:found.projection_json}:null;
       }return null},
       async all(){
         if(sql.includes("FROM reusable_source_checks")){
           const states=new Map();
           for(const row of status.values())states.set(row.state,(states.get(row.state)??0)+1);
           return {results:[...states].map(([state,total])=>({state,total}))};
         }
         if(sql.includes("SELECT projection_json")){
           const arr=[...news.values()].sort((a,b)=>b.published_at.localeCompare(a.published_at));
           const off=Number(args.at(-1));
           return {results:arr.slice(off,off+201).map(x=>({projection_json:x.projection_json}))};
         }
         return {results:[]};
       },
       sql,args,
     };return statement;
   },
   async batch(statements){
     for(const q of statements){
       if(q.sql.startsWith("INSERT OR IGNORE INTO reusable_news_items")){
         const [id,category,published_at,projection_json,first_seen_at]=q.args;
         if(!news.has(id))news.set(id,{category,published_at,projection_json,first_seen_at});
       }else if(q.sql.startsWith("INSERT INTO reusable_source_checks")){
         const [ref,category,state,checked_at]=q.args;
         status.set(ref,{category,state,checked_at});
       }
     }return [];
   }
  }};
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
