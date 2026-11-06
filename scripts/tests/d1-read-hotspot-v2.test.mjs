import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {withPublicEdgeCache} from "../../workers/control-plane/src/cache-middleware.mjs";
import {readHot50MaterializedNews} from "../../workers/control-plane/src/hot50-materialized-news.mjs";
import {readCachedSignedGro} from "../../workers/control-plane/src/signed-gro-read-cache.mjs";

const url="https://geomacro.example/v1/public/website-derived-news-bundle";
const valid=()=>({ok:true,schema:"geomacro.website-derived-news-bundle.v1",
 delivery_scope:"free_website_only",chargeable:false,complete:true,item_cap:600,
 signals:[],first_ingest:[],returned_rows:0});

test("one exact indexed materialized row is read for each hot50 public miss",async()=>{
 let queries=0,binds=[];
 const now=Date.parse("2026-11-06T04:00:00Z");
 const env={DB:{prepare(sql){
  queries++;
  assert.equal(sql,"SELECT payload,updated_at FROM materialized_cache WHERE key=? LIMIT 1");
  return {bind(...args){binds.push(args);return {first:async()=>({
   payload:JSON.stringify(valid()),updated_at:now-10000
  })}}};
 }}};
 assert.equal((await readHot50MaterializedNews(env,now)).ok,true);
 assert.equal(queries,1);
 assert.deepEqual(binds,[["public_derived_news_hot50"]]);
 assert.equal(await readHot50MaterializedNews(env,now+12*60_000),null,
  "stale materialization cannot pretend to be current");
});

test("Cache API HIT avoids recalculation and STALE explicitly schedules refresh",async()=>{
 let now=1000000,origin=0;const entries=new Map(),background=[];
 const cache={
  match:async key=>entries.get(key.url)?.clone()??null,
  put:async(key,response)=>{entries.set(key.url,response.clone())},
 };
 const req=new Request(url),producer=()=>{origin++;return Response.json({revision:origin})};
 const options={cache,now:()=>now,ttlSeconds:60,staleSeconds:120,
  waitUntil:p=>background.push(p)};
 const first=await withPublicEdgeCache(req,producer,options);
 assert.equal(first.status,200);assert.equal(origin,1);
 const hit=await withPublicEdgeCache(req,producer,options);
 assert.equal(hit.headers.get("X-GeoMacro-Edge-Cache"),"HIT");
 assert.equal(origin,1);
 const stored=entries.get(url);
 assert.equal(stored.headers.get("Cache-Tag"),"geomacro-public");
 now+=61000;
 const stale=await withPublicEdgeCache(req,producer,options);
 assert.equal(stale.headers.get("X-GeoMacro-Edge-Cache"),"STALE");
 assert.equal(stale.headers.get("Cache-Control"),"public, max-age=0");
 await Promise.all(background);
 assert.equal(origin,2);
 const revived=await withPublicEdgeCache(req,producer,options);
 assert.equal((await revived.json()).revision,2);
});

test("protected requests and errors cannot enter the public POP cache",async()=>{
 let touched=0,puts=0;
 const cache={match:async()=>null,put:async()=>{puts++}};
 const fail=()=>{touched++;return Response.json({ok:false},{status:503})};
 await withPublicEdgeCache(new Request(url),fail,{cache});
 await withPublicEdgeCache(new Request(url,{headers:{Authorization:"Bearer token"}}),fail,{cache});
 await withPublicEdgeCache(new Request("https://geomacro.example/v1/partner/predge/check"),fail,{cache});
 assert.equal(touched,3);assert.equal(puts,0);
});

test("signed GRO cache never bypasses verification, negative results or request ledger",async()=>{
 let now=1000000,reads=0,validSignature=true;
 const env={GEOMACRO_PREDGE_SIGNED_GRO_READ_CACHE:"1",DB:{}};
 const subject={type:"country",id:"USA"};
 const origin=()=>{reads++;return {signature:"immutable-test-fixture"}};
 const verify=row=>validSignature&&row?.signature==="immutable-test-fixture"?row:null;
 assert.ok(await readCachedSignedGro(env,subject,now,origin,verify));
 assert.ok(await readCachedSignedGro(env,subject,now+1000,origin,verify));
 assert.equal(reads,1);
 validSignature=false;
 assert.equal(await readCachedSignedGro(env,subject,now+2000,origin,verify),null);
 assert.equal(reads,2,"invalid cached signature forces canonical fallback");
 validSignature=true;
 assert.ok(await readCachedSignedGro(env,subject,now+6000,origin,verify));
 assert.equal(reads,3,"expired cache requires a new D1 read");
});

test("production routing uses explicit opt-in, and existing private/paid gates remain",()=>{
 const worker=readFileSync(new URL("../../workers/control-plane/src/index.mjs",import.meta.url),"utf8");
 const bundle=readFileSync(new URL("../../workers/control-plane/src/website-derived-intelligence.mjs",import.meta.url),"utf8");
 const source=readFileSync(new URL("../../workers/control-plane/src/private-osint-bundle.mjs",import.meta.url),"utf8");
 assert.match(worker,/GEOMACRO_D1_READ_HOTSPOT_V2/);
 assert.match(worker,/refreshHot50MaterializedNews/);
 assert.match(bundle,/readHot50MaterializedNews/);
 assert.match(source,/idx_private_osint_country_category_clock_v2/);
 assert.match(worker,/return predgeResearchDerivedNewsFeed\(request,env\);/);
 assert.match(worker,/return handlePrivateOsint15m\(request,env\)/);
});
