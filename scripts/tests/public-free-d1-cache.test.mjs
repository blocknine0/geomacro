import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {eligiblePublicFreeD1CacheRequest,readPublicFreeD1Cached,PUBLIC_FREE_D1_TTL_SECONDS,PUBLIC_FREE_D1_BUNDLE_TTL_SECONDS}
  from "../../workers/control-plane/src/public-free-d1-cache.mjs";

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

test("bundle receives a shorter TTL and respects explicit no-cache/no-store readback requests",async()=>{
  const bundle="https://geomacro-control-plane.example/v1/public/website-derived-news-bundle";
  assert.equal(PUBLIC_FREE_D1_BUNDLE_TTL_SECONDS,15);
  assert.equal(eligiblePublicFreeD1CacheRequest(request(bundle)),true);
  assert.equal(eligiblePublicFreeD1CacheRequest(request(bundle,{"Cache-Control":"no-cache"})),false);
  assert.equal(eligiblePublicFreeD1CacheRequest(request(bundle,{"Cache-Control":"no-store"})),false);
  assert.equal(eligiblePublicFreeD1CacheRequest(request(base,{"Cache-Control":"max-age=0"})),false);
  assert.equal(eligiblePublicFreeD1CacheRequest(request(base,{"Pragma":"no-cache"})),false);
  let reads=0,puts=0,matches=0;
  const cache={async match(){matches++;return null},async put(key,response){
    puts++;
    assert.equal(response.headers.get("Cache-Control"),"public, max-age=15");
  }};
  const run=()=>{reads++;return result()};
  const first=await readPublicFreeD1Cached(request(bundle),run,{cache});
  assert.equal(first.headers.get("Cache-Control"),"public, max-age=15");
  const second=await readPublicFreeD1Cached(request(bundle,{"Cache-Control":"no-cache"}),run,{cache});
  assert.equal(second.headers.get("Cache-Control"),"no-store");
  assert.equal(reads,2);
  assert.equal(matches,1);
  assert.equal(puts,1);
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
  assert.match(code,/return publicReadCache\(\(\)=>renderDerivedStoriesHtml\(env\)\)/);
  assert.match(code,/return publicReadCache\(\(\)=>readDerivedStoriesBundle\(env\)\)/);
  assert.match(code,/website-derived-news-bundle/);
  const cache=readFileSync(new URL("../../workers/control-plane/src/public-free-d1-cache.mjs",import.meta.url),"utf8");
  assert.match(cache,/PUBLIC_FREE_D1_BUNDLE_TTL_SECONDS = 15/);
  assert.match(cache,/Cache-Control/);

  assert.match(code,/if\(q.size===0\)return publicReadCache/);
  assert.match(code,/return handlePrivateOsint15m\(request,env\)/);
});
