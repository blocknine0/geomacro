import test from "node:test";
import assert from "node:assert/strict";
import {verifyPublicArchiveBrowserCors} from "../lib/verify-public-archive-browser-cors.mjs";
const base="https://geomacro-public-finds-archive.daspallab202391.workers.dev";
const index={schema:"geomacro.permanent-derived-news-archive-index.v1",
 months:["2026-11"],categories:["geopolitics","macro","rare_earth"],
 seed_complete:true,total_signals:36};
const paths=["/index.json","/archive/2026-11/geopolitics.json",
 "/archive/2026-11/macro.json","/archive/2026-11/rare_earth.json"];
const assets=new Map(paths.map(path=>[path,path==="/index.json"?
 JSON.stringify(index):JSON.stringify({schema:"geomacro.permanent-derived-news-archive-month.v1",
 category:path.split("/").at(-1).replace(".json",""),signals:[{id:"one"}]})]));
const loadFile=path=>assets.get(path.replace(/^\/assets/u,""));
const asResponse=(path,{cors="*",body=assets.get(path),status=200}={})=>
 new Response(body,{status,headers:{"Access-Control-Allow-Origin":cors,
  "Content-Type":"application/json"}});
const opts=fetchImpl=>({index,assetRoot:"/assets",loadFile,fetchImpl,
 pause:async()=>{},attempts:2});
test("real browser-origin CORS and all three immutable shards pass with exact bytes",async()=>{
 const called=[];
 const result=await verifyPublicArchiveBrowserCors(opts(async(url,init)=>{
  assert.equal(init.headers.Origin,"https://geomacro.live");
  assert.equal(init.method,"GET");
  assert.equal(init.redirect,"error");
  assert.equal(init.headers.Authorization,undefined);
  const path=new URL(url).pathname;
  called.push(path);
  return asResponse(path);
 }));
 assert.deepEqual(called,paths);
 assert.equal(result.ok,true);
 assert.equal(result.shards_verified,3);
 assert.equal(result.archive_index_verified,true);
 assert.equal(result.browser_cors_verified,true);
 assert.equal(result.exact_immutable_bytes_verified,true);
 assert.equal(result.d1_reads,0);assert.equal(result.b2_requests,0);
 assert.equal(result.payments,0);
});
test("archive can return 200 yet browser remains blocked by missing CORS",async()=>{
 await assert.rejects(
  ()=>verifyPublicArchiveBrowserCors(opts(async url=>
   asResponse(new URL(url).pathname,{cors:"https://wrong.example"}))),
  /PUBLIC_ARCHIVE_BROWSER_CORS_CORS_MISSING_OR_CREDENTIALLED/
 );
});
test("HTTP 200 with stale/replaced shard bytes cannot pass",async()=>{
 await assert.rejects(
  ()=>verifyPublicArchiveBrowserCors(opts(async url=>{
   const path=new URL(url).pathname;
   return asResponse(path,{body:path.includes("rare_earth")?"{}":assets.get(path)});
  })),
  /PUBLIC_ARCHIVE_BROWSER_CORS_IMMUTABLE_BYTES_MISMATCH/
 );
});
test("bounded retry accepts propagated fresh Worker only after full four-asset cohort",async()=>{
 let calls=0;
 const proof=await verifyPublicArchiveBrowserCors(opts(async url=>{
  calls++;
  const path=new URL(url).pathname;
  if(calls===1)return asResponse(path,{status:503});
  return asResponse(path);
 }));
 assert.equal(proof.checked_asset_count,4);
 assert.equal(calls,5);
});
test("never accept unsupported index or fabricated category/month",async()=>{
 for(const bad of [{...index,months:["2026-13"]},
  {...index,categories:["geopolitics","macro","macro"]},
  {...index,seed_complete:false}]){
  await assert.rejects(()=>verifyPublicArchiveBrowserCors({...opts(async()=>asResponse("/index.json")),
   index:bad}),/PUBLIC_ARCHIVE_BROWSER_CORS_INPUT_INVALID/);
 }
});
