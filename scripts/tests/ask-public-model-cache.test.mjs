import test from "node:test";
import assert from "node:assert/strict";
import {handleAskPublicModelCache,boundedCacheFields,purgeExpiredAskPublicModelCache}
 from "../../workers/control-plane/src/ask-public-model-cache.mjs";
const k="f".repeat(64);
const fields={
 summary:"Inflation is a broad increase in prices.",
 what_changed:"General explanation only, no fresh incident was established.",
 why_it_matters:"Higher prices can reduce purchasing power.",
 geomacro_view:"Compare headline and core inflation for the same reporting period.",
};
function mockD1(){
 const data=new Map();
 let writes=0,reads=0;
 const db={prepare(sql){return {bind(...args){return {
   async first(){
     reads++;
     const value=data.get(args[0]);
     return value&&value.expires_at>args[1]?{response_json:value.json}:null;
   },
   async run(){
     if(sql.startsWith("DELETE")){
       let n=0;
       for(const [id,item] of data)if(item.expires_at<=args[0]){data.delete(id);n++;}
       return {meta:{changes:n}};
     }
     const [id,json,created,expires,now]=args;
     if(!data.has(id)||data.get(id).expires_at<=now){
       data.set(id,{json,created,expires_at:expires});writes++;
       return {meta:{changes:1}};
     }
     return {meta:{changes:0}};
   },
 };}};}};
 return {DB:db,data,getWrites:()=>writes,getReads:()=>reads};
}
function req(method,body=null,key=k){
 const url="https://example.workers.dev/v1/internal/ask/public-model-cache"+
   (method==="GET"?"?key="+key:"");
 return new Request(url,{method,headers:body?{"content-type":"application/json"}:undefined,
   body:body?JSON.stringify(body):undefined});
}
const now=Date.parse("2026-11-06T00:00:00.000Z"),epoch=now/1000;
test("only four approved public fields; rejects private/oversize",()=>{
 assert.equal(boundedCacheFields(fields)!==null,true);
 assert.equal(boundedCacheFields({...fields,user_id:"abc"}),null);
 assert.equal(boundedCacheFields({...fields,summary:"OSINT reports a secret"}),null);
 assert.equal(boundedCacheFields({...fields,what_changed:""}),null);
 assert.equal(boundedCacheFields({...fields,summary:"A".repeat(401)}),null);
});
test("global D1 cache: miss -> immutable put -> hit -> expiry, no raw question",async()=>{
 const env=mockD1();
 let r=await handleAskPublicModelCache(req("GET"),env,now);
 assert.deepEqual(await r.json(),{ok:true,hit:false});
 r=await handleAskPublicModelCache(req("PUT",{
   key:k,fields,expires_at:epoch+1800,
 }),env,now);
 assert.deepEqual(await r.json(),{ok:true,stored:true});
 r=await handleAskPublicModelCache(req("GET"),env,now+2000);
 assert.deepEqual(await r.json(),{ok:true,hit:true,fields});
 assert.equal(env.getReads(),2);assert.equal(env.getWrites(),1);
 r=await handleAskPublicModelCache(req("PUT",{
   key:k,fields,expires_at:epoch+1800,
 }),env,now+2000);
 assert.deepEqual(await r.json(),{ok:true,stored:false});
 assert.equal(env.getWrites(),1);
 r=await handleAskPublicModelCache(req("GET"),env,now+1800*1000);
 assert.deepEqual(await r.json(),{ok:true,hit:false});
 const cleaned=await purgeExpiredAskPublicModelCache(env,now+1800*1000);
 assert.deepEqual(cleaned,{ok:true,deleted:1});
 assert.equal(env.data.size,0);
});
test("fails closed on malformed key, missing D1 or invalid body",async()=>{
 const env=mockD1();
 assert.equal((await handleAskPublicModelCache(req("GET",null,"not-hash"),env,now)).status,400);
 assert.equal((await handleAskPublicModelCache(req("GET"),{},now)).status,503);
 assert.equal((await handleAskPublicModelCache(req("PUT",{
   key:k,fields:{...fields,evidence:["a"]},expires_at:epoch+1200,
 }),env,now)).status,400);
 assert.equal((await handleAskPublicModelCache(req("PUT",{
   key:k,fields,expires_at:epoch+1850,
 }),env,now)).status,400);
 assert.equal(env.getWrites(),0);
});
