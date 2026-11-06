import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {withPublicEdgeCache} from "../../workers/control-plane/src/cache-middleware.mjs";
import {readHot50MaterializedNews} from "../../workers/control-plane/src/hot50-materialized-news.mjs";
import {readDerivedStories,readDerivedStoriesBundle} from "../../workers/control-plane/src/website-derived-intelligence.mjs";
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
  return {bind(...args){binds.push(args);return {all:async()=>({
   results:[{payload:JSON.stringify(valid()),updated_at:now-10000}],
   meta:{rows_read:1,rows_written:0}
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


test("unmigrated or empty CQRS table transparently falls back to canonical journal with identical JSON and headers",async()=>{
 const now=Date.parse("2026-11-06T07:00:00.000Z");
 const signal={
  id:"macro-00000001",category:"macro",
  title:"Geomacro finds original official policy change in the observed sector",
  what_changed:"An official publisher released a new statement about a policy development in the observed sector.",
  why_it_matters:"This release may affect operating assumptions but actual consequences require independent confirmation.",
  topic:"monetary policy",development_type:"policy update",geography:null,
  published_at:"2026-11-06T06:00:00.000Z",date_precision:"exact",observed_release_count:1,
  sources_credited:[],status:"official_release_observed_unscored",
  same_event_corrob_verified:false,severity:null
 };
 const canonicalRow={story_json:JSON.stringify(signal),first_seen_at:"2026-11-06T06:05:00.000Z"};
 const sqlReads=[];
 function fixture(cacheMode,flag){
  const env={GEOMACRO_D1_READ_HOTSPOT_V2:flag,DB:{
   prepare(sql){
    sqlReads.push(sql);
    if(sql.includes("materialized_cache")){
     if(cacheMode==="absent")throw Error("D1_ERROR: no such table: materialized_cache");
     return {bind(){return {all:async()=>({
      results:cacheMode==="empty"?[]:[{payload:null,updated_at:now}],
      meta:{rows_read:1,rows_written:0}
     })}}};
    }
    if(sql.includes("website_derived_materialized")){
     return {all:async()=>{throw Error("no such table: website_derived_materialized_pages_v1")}};
    }
    if(sql.includes("website_derived_intelligence")){
     return {bind(){return {all:async()=>({results:[canonicalRow]})}}};
    }
    throw Error("UNEXPECTED_SQL "+sql);
   }
  }};
  return env;
 }
 for(const mode of ["absent","empty","null-payload"]){
  const env=fixture(mode,"1");
  const canonical=fixture(mode,"0");
  const [live,baseline]=await Promise.all([
   readDerivedStories(env,now,0,0,true),
   readDerivedStories(canonical,now,0,0,true)
  ]);
  assert.equal(live.status,200,mode);
  assert.deepEqual(await live.json(),await baseline.json(),mode);
  assert.equal(live.headers.get("Cache-Control"),baseline.headers.get("Cache-Control"));
  assert.equal(live.headers.get("ETag"),baseline.headers.get("ETag"));
  assert.equal(live.headers.get("X-GeoMacro-Public-Offload"),baseline.headers.get("X-GeoMacro-Public-Offload"));
  const [bundle,oldBundle]=await Promise.all([
   readDerivedStoriesBundle(env,now,true),
   readDerivedStoriesBundle(canonical,now,true),
  ]);
  assert.equal(bundle.status,200,mode);
  assert.deepEqual(await bundle.json(),await oldBundle.json(),mode);
  assert.equal(bundle.headers.get("Cache-Control"),oldBundle.headers.get("Cache-Control"));
 }
 assert.ok(sqlReads.some(q=>q.includes("materialized_cache")),"feature gate exercises CQRS");
 assert.ok(sqlReads.some(q=>q.includes("website_derived_intelligence")),"fallback exercises canonical SQL");
});
test("the disabled flag never attempts the optional single-row materialization",async()=>{
 let calls=0;
 const now=Date.parse("2026-11-06T07:00:00.000Z");
 const env={GEOMACRO_D1_READ_HOTSPOT_V2:"0",DB:{prepare(sql){
  if(sql.includes("materialized_cache"))throw Error("MUST_NOT_QUERY_CQRS");
  calls++;
  return {bind(){return {all:async()=>({results:[]})}}};
 }}};
 const page=await readDerivedStories(env,now,0,0,false);
 assert.equal(page.status,200);
 const bundle=await readDerivedStoriesBundle(env,now,false);
 assert.equal(bundle.status,200);
 assert.equal(calls,2);
});


test("warm single-row CQRS returns the exact canonical page/bundle contracts",async()=>{
 const now=Date.parse("2026-11-06T07:00:00.000Z");
 const native="2026-11-06T06:00:00.000Z";
 const first="2026-11-06T06:05:00.000Z";
 const story={id:"geopolitics-00000001",category:"geopolitics",
  title:"Geomacro finds original official policy change in the observed sector",
  what_changed:"An official publisher released a new statement about a policy development in the observed sector.",
  why_it_matters:"This release may affect operating assumptions but actual consequences require independent confirmation.",
  topic:"foreign policy",development_type:"policy update",geography:null,
  published_at:native,date_precision:"exact",observed_release_count:1,
  sources_credited:[],status:"official_release_observed_unscored",
  same_event_corrob_verified:false,severity:null};
 const row={story_json:JSON.stringify(story),first_seen_at:first};
 const base={ok:true,schema:"geomacro.website-derived-news-bundle.v1",
  checked_at:new Date(now).toISOString(),original_release_delay_minutes:0,
  retention_days:3,retention_hours:72,delivery_scope:"free_website_only",
  complete:true,item_cap:600,returned_rows:1,
  ingest_clock_kind:"D1_FIRST_INSERT_NOT_WEBSITE_FIRST_RENDER",
  first_ingest:[{id:story.id,first_seen_at:first}],signals:[story],
  scored:false,chargeable:false,supabase_dependency:false};
 let cachedRead=0;
 const env=flag=>({GEOMACRO_D1_READ_HOTSPOT_V2:flag,DB:{
  prepare(sql){
   if(sql.includes("materialized_cache")){
    cachedRead++;
    return {bind:()=>({all:async()=>({results:[{payload:JSON.stringify(base),updated_at:now-2000}]})})};
   }
   if(sql.includes("website_derived_materialized"))
    return {all:async()=>{throw Error("no such table: website_derived_materialized_pages_v1")}};
   if(sql.includes("website_derived_intelligence"))
    return {bind:()=>({all:async()=>({results:[row]})})};
   throw Error("Unexpected SQL");
  }
 }});
 for(const project of [
  e=>readDerivedStories(e,now,0,0,true),
  e=>readDerivedStoriesBundle(e,now,true),
 ]){
  const fromCache=await project(env("1"));
  const canonical=await project(env("0"));
  assert.equal(fromCache.status,200);
  assert.equal(await fromCache.text(),await canonical.text());
  assert.deepEqual([...fromCache.headers.entries()], [...canonical.headers.entries()]);
 }
 assert.equal(cachedRead,2);
});
