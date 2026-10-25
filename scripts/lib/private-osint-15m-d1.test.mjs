import test from "node:test";
import assert from "node:assert/strict";
import {createHash,createHmac} from "node:crypto";
import {handlePrivateOsint15m,privateOsint15mWrite,privateOsint15mRead,PRIVATE_OSINT_D1_SCHEMA} from "../../workers/control-plane/src/private-osint-15m.mjs";
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
     checks.set(q.params[0]+q.params[1],q.params);
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
