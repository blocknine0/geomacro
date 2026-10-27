import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {eligiblePublicFreeD1CacheRequest,readPublicFreeD1Cached,PUBLIC_FREE_D1_TTL_SECONDS,PUBLIC_FREE_D1_BUNDLE_TTL_SECONDS,PUBLIC_FREE_D1_DERIVED_TTL_SECONDS}
  from "../../workers/control-plane/src/public-free-d1-cache.mjs";

import {projectPublicMachineDomainResponse}
  from "../../workers/control-plane/src/public-machine-domain-reuse.mjs";

const base="https://geomacro-control-plane.example/v1/public/three-domain-continuity";
const request=(url=base,headers={})=>new Request(url,{headers});
const result=(status=200)=>Response.json({ok:status===200},{status,
  headers:{"Cache-Control":"no-store"}});

test("bounded public identical reads reuse only a 200 response",async()=>{
  let reads=0;const stored=new Map(),pending=[];
  const cache={async match(key){return stored.get(key.url)?.clone()??null},
    async put(key,response){stored.set(key.url,response.clone())}};
  const run=()=>{reads++;return result()};
  const first=await readPublicFreeD1Cached(request(),run,{cache,waitUntil:promise=>pending.push(promise)});
  await Promise.all(pending);
  const second=await readPublicFreeD1Cached(request(),run,{cache});
  assert.equal(reads,1);
  assert.equal(first.status,200);
  assert.equal(second.status,200);
  assert.equal(first.headers.get("Cache-Control"),"public, max-age="+PUBLIC_FREE_D1_TTL_SECONDS);
  assert.equal(second.headers.get("Cache-Control"),"public, max-age="+PUBLIC_FREE_D1_TTL_SECONDS);
  assert.deepEqual(await first.json(),await second.json());
});

test("non-success 503 and quota failures are never cached",async()=>{
  let puts=0,reads=0;
  const cache={async match(){return null},async put(){puts++}};
  for(const status of [503,429,401]){
    const r=await readPublicFreeD1Cached(request(),()=>{reads++;return result(status)},{cache});
    assert.equal(r.status,status);
    assert.equal(r.headers.get("Cache-Control"),"no-store");
  }
  assert.equal(puts,0);
  assert.equal(reads,3);
});

test("protected, query-based and header-bearing requests bypass shared cache",async()=>{
  let reads=0,puts=0,matches=0;
  const cache={async match(){matches++;return result()},async put(){puts++}};
  for(const req of [
    request(base+"?offset=250"),request(base,{"Authorization":"Bearer private"}),
    request(base,{"Cookie":"session=private"}),
    request(base,{"Range":"bytes=0-100"}),
    request(base,{"X-API-Key":"secret"}),
    request("https://geomacro-control-plane.example/v1/internal/private-osint-15m"),
    request("https://geomacro-control-plane.example/v1/public/risk-gate-d1-readiness"),
  ]){
    assert.equal(eligiblePublicFreeD1CacheRequest(req),false);
    const r=await readPublicFreeD1Cached(req,()=>{reads++;return result()},{cache});
    assert.equal(r.headers.get("Cache-Control"),"no-store");
  }
  assert.equal(reads,7);assert.equal(puts,0);assert.equal(matches,0);
});

test("public factual JSON uses separate finite category cache keys, private receipts bypass",async()=>{
  const home="https://geomacro-control-plane.example/v1/public/reusable-source-news";
  const cached=new Map();let queries=0;
  const store={async match(key){return cached.get(key.url)?.clone()??null},
    async put(key,response){cached.set(key.url,response.clone())}};
  const run=()=>{queries++;return result()};
  for(const suffix of ["","?domain=macro","?domain=rare_earth","?domain=geopolitics"]){
    const req=request(home+suffix);
    assert.equal(eligiblePublicFreeD1CacheRequest(req),true);
    await readPublicFreeD1Cached(req,run,{cache:store});
    await readPublicFreeD1Cached(req,run,{cache:store});
  }
  assert.equal(queries,4);
  assert.equal(cached.size,4);
  for(const suffix of ["?country=IND","?offset=200","?domain=macro&country=IND","?domain=bitcoin"]){
    assert.equal(eligiblePublicFreeD1CacheRequest(request(home+suffix)),false);
  }
  assert.equal(eligiblePublicFreeD1CacheRequest(request(home,{Authorization:"Bearer private"})),false);
  assert.equal(eligiblePublicFreeD1CacheRequest(request(home,{"Cache-Control":"no-store"})),false);
});
test("concurrent cold-cache users share one actual D1 read per POP without data mixing",async()=>{
 const url="https://geomacro-control-plane.example/v1/public/reusable-source-news?domain=macro";
 let reads=0,writes=0;
 const entries=new Map();
 const cache={
   async match(k){return entries.get(k.url)?.clone()??null},
   async put(k,res){writes++;await new Promise(resolve=>setTimeout(resolve,10));entries.set(k.url,res.clone())},
 };
 const build=async()=>{
   reads++;
   await new Promise(resolve=>setTimeout(resolve,10));
   return Response.json({ok:true,source:"bounded-macro"});
 };
 const outputs=await Promise.all(Array.from({length:12},
   ()=>readPublicFreeD1Cached(request(url),build,{cache})));
 assert.equal(reads,1);
 assert.equal(writes,1);
 for(const res of outputs){
   assert.equal(res.status,200);
   assert.deepEqual(await res.json(),{ok:true,source:"bounded-macro"});
 }
});
test("cache failure cannot replace truthful D1 readback",async()=>{
  let reads=0;
  const broken={async match(){throw Error("CACHE_OUTAGE")},async put(){throw Error("CACHE_WRITE_FAILED")}};
  const r=await readPublicFreeD1Cached(request(),()=>{reads++;return result()},{cache:broken});
  assert.equal(r.status,200);assert.equal(reads,1);
  assert.deepEqual(await r.json(),{ok:true});
});

test("no private Set-Cookie response is cached and HTML path is explicitly public",async()=>{
  let puts=0;
  assert.equal(eligiblePublicFreeD1CacheRequest(request(
    "https://geomacro-control-plane.example/v1/public/website-derived-news-html")),true);
  const resp=await readPublicFreeD1Cached(request(),()=>new Response("private",{
    headers:{"Set-Cookie":"sid=secret","Cache-Control":"no-store"}
  }),{cache:{async match(){return null},async put(){puts++}}});
  assert.equal(resp.headers.get("Cache-Control"),"no-store");
  assert.equal(puts,0);
});

test("Worker keeps public-only cache and original strict private access intact",()=>{
  const code=readFileSync(new URL("../../workers/control-plane/src/index.mjs",import.meta.url),"utf8");
  assert.match(code,/return publicReadCache\(\(\)=>threeDomainEvidenceContinuity\(env\)\)/);
  assert.ok(code.includes("return publicReadCache(()=>renderDerivedStoriesHtml(env,Date.now(),"));
  assert.match(code,/if\(q.size===0\)return publicReadCache/);
  assert.match(code,/return handlePrivateOsint15m\(request,env\)/);
  assert.match(code,/return publicReadCache\(\(\)=>publicReusableSourceNews\(env,url.searchParams\)\)/);
});

test("source-neutral public machine feed shares exact one D1 projection per bounded key",async()=>{
  const root="https://geomacro-control-plane.example/v1/public/derived-structural-72h";
  const stored=new Map();let reads=0;
  const cache={async match(k){return stored.get(k.url)?.clone()??null},
    async put(k,v){stored.set(k.url,v.clone())}};
  const run=async()=>{reads++;return Response.json({
    ok:true,schema:"geomacro.derived-news-structural-feed.v1",
    projection:"source_neutral",items:[],scored:false,signed:false
  },{headers:{"Cache-Control":"no-store"}})};
  for(const query of ["","?domain=macro","?domain=rare_earth","?domain=geopolitics"]){
    const req=request(root+query);
    assert.equal(eligiblePublicFreeD1CacheRequest(req),true);
    const first=await readPublicFreeD1Cached(req,run,{cache});
    const second=await readPublicFreeD1Cached(req,run,{cache});
    assert.deepEqual(await first.json(),await second.json());
  }
  assert.equal(reads,4);
  assert.equal(stored.size,4);
  for(const query of [
    "?country=IND","?domain=macro&country=IND","?domain=%6dacro",
    "?domain=macro&domain=macro","?domain=unknown","?offset=250",
    "?domain=macro%20","?domain=geopolitics#invalid"
  ]){
    const req=request(root+query);
    if(query.includes("#"))continue; // fragments do not traverse HTTP
    assert.equal(eligiblePublicFreeD1CacheRequest(req),false,query);
  }
  assert.equal(eligiblePublicFreeD1CacheRequest(request(root,{
    Authorization:"Bearer machine-internal"
  })),false);
  assert.equal(eligiblePublicFreeD1CacheRequest(request(root,{
    "Cache-Control":"no-cache"
  })),false);
  assert.equal(eligiblePublicFreeD1CacheRequest(request(
    root.replace("/public/","/partner/predge/"))),false);
});

test("only the two canonical website 250/500 pages are independently cached",async()=>{
  let reads=0,puts=0;
  const stored=new Map();
  const cache={async match(k){return stored.get(k.url)?.clone()??null},
    async put(k,r){puts++;stored.set(k.url,r.clone())}};
  const run=async()=>{reads++;return Response.json({ok:true,signals:[]})};
  for(const path of ["website-derived-news","website-derived-news-immediate"]){
    const root="https://geomacro-control-plane.example/v1/public/"+path;
    for(const q of ["","?offset=250","?offset=500"]){
      assert.equal(eligiblePublicFreeD1CacheRequest(request(root+q)),true);
      await readPublicFreeD1Cached(request(root+q),run,{cache});
      await readPublicFreeD1Cached(request(root+q),run,{cache});
    }
    for(const q of [
      "?offset=0","?offset=750","?offset=250&offset=500",
      "?offset=%32%35%30","?country=USA","?domain=macro","?offset=250&x=1"
    ])assert.equal(eligiblePublicFreeD1CacheRequest(request(root+q)),false,q);
  }
  assert.equal(reads,6);assert.equal(puts,6);
  assert.equal(stored.size,6);
});

test("cache never covers paid, protected or Predge machine routes after offload",()=>{
  const source=readFileSync(new URL("../../workers/control-plane/src/index.mjs",import.meta.url),"utf8");
  assert.ok(source.includes('await publicSharedDerivedNewsFeed(env,url.searchParams,Date.now(),'));
  assert.ok(source.includes('await readDerivedStories(env,Date.now(),Number(q.get("offset")),legacyDelay,'));
  assert.ok(source.includes("return predgeResearchDerivedNewsFeed(request,env);"));
  assert.ok(source.includes("if (!auth.ok) return json("));
});


test("bundle read-through uses a 60s TTL, single-flight, and strict acceptance bypass",async()=>{
 const url="https://geomacro-control-plane.example/v1/public/website-derived-news-bundle";
 const objects=new Map();let reads=0;
 const cache={
  async match(key){return objects.get(key.url)?.clone()??null},
  async put(key,value){objects.set(key.url,value.clone())},
 };
 const run=async()=>{reads++;return Response.json({
  ok:true,schema:"geomacro.website-derived-news-bundle.v1",signals:[],
 })};
 const first=await readPublicFreeD1Cached(request(url),run,{cache});
 const second=await readPublicFreeD1Cached(request(url),run,{cache});
 assert.equal(PUBLIC_FREE_D1_BUNDLE_TTL_SECONDS,60);
 assert.equal(first.headers.get("Cache-Control"),"public, max-age=60");
 assert.equal(second.headers.get("Cache-Control"),"public, max-age=60");
 assert.equal(reads,1);
 for(const headers of [
  {"Cache-Control":"no-cache"},{"Cache-Control":"no-store"},
  {"Cache-Control":"max-age=0"},{"Pragma":"no-cache"},
  {"Authorization":"Bearer private"},{"Cookie":"sid=private"},
 ]){
  assert.equal(eligiblePublicFreeD1CacheRequest(request(url,headers)),false);
  const response=await readPublicFreeD1Cached(request(url,headers),run,{cache});
  assert.equal(response.headers.get("Cache-Control"),null);
 }
 assert.equal(reads,7);
 assert.equal(eligiblePublicFreeD1CacheRequest(request(url+"?offset=250")),false);
 assert.equal(eligiblePublicFreeD1CacheRequest(request(url)),true);
});

test("derived public journal and machine 300-second POP cache saves hot D1 scans",async()=>{
 for(const path of ["website-derived-news-immediate","website-derived-news","derived-structural-72h","website-derived-news-html"]){
  let scans=0;const memory=new Map();
  const cache={async match(k){return memory.get(k.url)?.clone()??null},
    async put(k,v){memory.set(k.url,v.clone())}};
  const url="https://geomacro-control-plane.example/v1/public/"+path;
  const compute=async()=>{scans++;return Response.json({ok:true,path})};
  const first=await readPublicFreeD1Cached(request(url),compute,{cache});
  const second=await readPublicFreeD1Cached(request(url),compute,{cache});
  assert.equal(first.headers.get("Cache-Control"),"public, max-age=300");
  assert.equal(second.headers.get("Cache-Control"),"public, max-age=300");
  assert.equal(scans,1);
  await readPublicFreeD1Cached(request(url,{"Cache-Control":"no-cache"}),compute,{cache});
  assert.equal(scans,2,"trusted readback bypasses public edge cache");
 }
});

test("HTML fallback and immediate JSON share the exact eligible D1 page 0 key",async()=>{
 const source=readFileSync(new URL("../../workers/control-plane/src/index.mjs",import.meta.url),"utf8");
 assert.ok(source.includes('pageUrl.pathname="/v1/public/website-derived-news-immediate"'));
 assert.ok(source.includes('headers:request.headers'));
 assert.ok(source.includes('renderDerivedStoriesHtml(env,Date.now(),'));
 assert.ok(source.includes('readPublicFreeD1Cached(pageRequest,async()=>'));
 const jsonRoot="https://geomacro-control-plane.example/v1/public/website-derived-news-immediate";
 let physicalD1Reads=0;const entries=new Map();
 const cache={async match(k){return entries.get(k.url)?.clone()??null},
    async put(k,v){entries.set(k.url,v.clone())}};
 const readD1=async()=>{physicalD1Reads++;return Response.json({
  ok:true,schema:"geomacro.website-derived-news-feed.v1",signals:[]
 })};
 const htmlUrl="https://geomacro-control-plane.example/v1/public/website-derived-news-html";
 const pageReq=htmlReq=>{
   const url=new URL(htmlReq.url);
   url.pathname="/v1/public/website-derived-news-immediate";
   return new Request(url.toString(),{method:"GET",headers:htmlReq.headers});
 };
 await readPublicFreeD1Cached(request(jsonRoot),readD1,{cache});
 await readPublicFreeD1Cached(pageReq(request(htmlUrl)),readD1,{cache});
 assert.equal(physicalD1Reads,1);
 await readPublicFreeD1Cached(pageReq(request(htmlUrl,{"Cache-Control":"no-cache"})),readD1,{cache});
 assert.equal(physicalD1Reads,2,"origin readback must not receive stale JSON or HTML");
 await readPublicFreeD1Cached(pageReq(request(htmlUrl,{Authorization:"Bearer protected"})),readD1,{cache});
 assert.equal(physicalD1Reads,3,"authenticated requests never share public cache");
});

test("five-minute derived and 60-second bundle public caches preserve authenticated D1 proof",async()=>{
 assert.equal(PUBLIC_FREE_D1_DERIVED_TTL_SECONDS,300);
 assert.equal(PUBLIC_FREE_D1_BUNDLE_TTL_SECONDS,60);
 const urls=[
  ["https://geomacro-control-plane.example/v1/public/website-derived-news-immediate",300],
  ["https://geomacro-control-plane.example/v1/public/website-derived-news-html",300],
  ["https://geomacro-control-plane.example/v1/public/derived-structural-72h",300],
  ["https://geomacro-control-plane.example/v1/public/website-derived-news-bundle",60],
 ];
 let origin=0;
 const objects=new Map();
 const cache={async match(k){return objects.get(k.url)?.clone()??null},
  async put(k,v){objects.set(k.url,v.clone())}};
 for(const [url,ttl] of urls){
  const compute=async()=>{origin++;return Response.json({ok:true,at:origin})};
  const first=await readPublicFreeD1Cached(request(url),compute,{cache});
  const second=await readPublicFreeD1Cached(request(url),compute,{cache});
  assert.equal(first.headers.get("cache-control"),"public, max-age="+ttl);
  assert.equal(second.headers.get("cache-control"),"public, max-age="+ttl);
  assert.deepEqual(await first.json(),await second.json());
  // Admin authenticated/no-cache readbacks must bypass POP cache.
  const privateFetch=await readPublicFreeD1Cached(
   request(url,{"Cache-Control":"no-cache","Authorization":"Bearer internal"}),
   compute,{cache});
  assert.equal(privateFetch.headers.get("cache-control"),null);
 }
 assert.equal(origin,8);
 assert.equal(objects.size,4);
});

test("three public machine domains reuse one complete source-neutral origin payload",async()=>{
  const categories=["geopolitics","macro","rare_earth"];
  const item=category=>({
    schema:"geomacro.derived-news-structural.v1",category,id:category+"-1",
    raw_upstream_delivered:false,chargeable:false,payable:false,
    commercial_derived_rights_verified:false,
    original_published_at:"2026-10-28T01:30:00.000Z",
  });
  const original={ok:true,schema:"geomacro.derived-news-structural-feed.v1",
    projection:"source_neutral",raw_upstream_delivered:false,
    commercial_rights_verified:false,
    partner_resale_or_commercial_redistribution_authorized:false,
    chargeable:false,scored:false,signed:false,
    counts:{geopolitics:1,macro:1,rare_earth:1},
    availability_by_category:Object.fromEntries(categories.map(category=>
      [category,{latest_source_check:{current_source_check_verified:true}}])),
    generated_at:"2026-10-28T01:35:00.000Z",
    items:categories.map(item),
  };
  const response=Response.json(original,{headers:{
    "X-GeoMacro-Public-Offload":"r2",
    "X-GeoMacro-Canonical-Status":"snapshot-within-8m",
    "Cache-Control":"public, max-age=45",
    "ETag":"old-body-digest",
  }});
  for(const category of categories){
    const derived=await projectPublicMachineDomainResponse(response,category);
    assert.equal(derived.status,200);
    assert.equal(derived.headers.get("X-GeoMacro-Public-Offload"),"r2");
    assert.equal(derived.headers.get("X-GeoMacro-Canonical-Status"),"snapshot-within-8m");
    assert.equal(derived.headers.get("ETag"),null,
      "filtered body must not inherit the full-feed ETag");
    const parsed=await derived.json();
    assert.deepEqual(parsed.items,[item(category)]);
    assert.deepEqual(parsed.counts,original.counts,
      "existing per-category endpoint keeps all-domain diagnostic counts");
    assert.deepEqual(parsed.availability_by_category,original.availability_by_category);
    assert.equal(parsed.generated_at,original.generated_at);
  }
  assert.deepEqual(await response.json(),original,"original cached body remains untouched");
});

test("public machine projection propagates 503 and rejects untrusted bundles",async()=>{
  const unavailable=Response.json({ok:false,error:"D1_FREE_QUOTA_EXCEEDED"},
    {status:503,headers:{"Cache-Control":"no-store"}});
  const projected=await projectPublicMachineDomainResponse(unavailable,"macro");
  assert.equal(projected.status,503);
  assert.equal((await projected.json()).error,"D1_FREE_QUOTA_EXCEEDED");
  const bogus=Response.json({ok:true,schema:"geomacro.derived-news-structural-feed.v1",
    projection:"attributed_research",items:[]});
  const denied=await projectPublicMachineDomainResponse(bogus,"macro");
  assert.equal(denied.status,503);
  assert.equal(denied.headers.get("Cache-Control"),"no-store");
  const badCategory=await projectPublicMachineDomainResponse(bogus,"unauthorized");
  assert.equal(badCategory.status,503);
});

test("only public cache-eligible category queries use base-bundle reuse",()=>{
  const worker=readFileSync(new URL("../../workers/control-plane/src/index.mjs",import.meta.url),"utf8");
  assert.ok(worker.includes("if(domain!==null&&eligiblePublicFreeD1CacheRequest(request))"));
  assert.ok(worker.includes("baseUrl.search=\"\";"));
  assert.ok(worker.includes("projectPublicMachineDomainResponse(source,domain)"));
  assert.ok(worker.includes('return predgeResearchDerivedNewsFeed(request,env);'),
    "PREDGE still uses its existing private authenticated endpoint unchanged");
  const root="https://geomacro-control-plane.example/v1/public/derived-structural-72h?domain=macro";
  assert.equal(eligiblePublicFreeD1CacheRequest(request(root)),true);
  for(const headers of [
    {Authorization:"Bearer protected"},
    {"Cache-Control":"no-cache"},{"Cache-Control":"no-store"},
    {Cookie:"sid=secret"},{Pragma:"no-cache"},
  ])assert.equal(eligiblePublicFreeD1CacheRequest(request(root,headers)),false);
});
