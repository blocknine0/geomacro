import test from "node:test";
import assert from "node:assert/strict";
import {awaitExactGeomacroBuild} from "../lib/production-exact-build-readiness.mjs";

const sha="a".repeat(40);
const build=(value)=>new Response(JSON.stringify({
  canonical_repository:"blocknine0/geomacro",canonical_main_sha:value,
}),{status:200,headers:{"content-type":"application/json"}});

test("waits for exact production SHA before permitting one RPC diagnostic",async()=>{
  let clock=0,calls=0;
  const fetcher=async(url,options)=>{
    assert.equal(new URL(url).pathname,"/.well-known/geomacro-build.json");
    assert.equal(options.redirect,"error");
    calls++;
    return build(calls===1?"b".repeat(40):sha);
  };
  assert.equal(await awaitExactGeomacroBuild({
    expectedSha:sha,fetcher,now:()=>clock,
    sleep:async ms=>{clock+=ms;},maxWaitMs:24000,intervalMs:12000,
  }),true);
  assert.equal(calls,2);
});

test("fails closed without calling RPC if publication remains stale",async()=>{
  let clock=0,calls=0;
  await assert.rejects(()=>awaitExactGeomacroBuild({
    expectedSha:sha,fetcher:async()=>{calls++;return build("b".repeat(40));},
    now:()=>clock,sleep:async ms=>{clock+=ms;},
    maxWaitMs:25000,intervalMs:12000,
  }),/EXACT_SHA_NOT_PUBLISHED/u);
  assert.equal(calls,4);
});

test("rejects wrong SHA before contacting production",async()=>{
  let calls=0;
  await assert.rejects(()=>awaitExactGeomacroBuild({
    expectedSha:"NOT_A_SHA",fetcher:async()=>{calls++;return build(sha);},
  }),/EXPECTED_SHA_INVALID/u);
  assert.equal(calls,0);
});

test("accepts canonical repository only",async()=>{
  let clock=0;
  const foreign=new Response(JSON.stringify({
    canonical_repository:"unrelated/repo",canonical_main_sha:sha,
  }),{status:200});
  await assert.rejects(()=>awaitExactGeomacroBuild({
    expectedSha:sha,fetcher:async()=>foreign.clone(),
    now:()=>clock,sleep:async ms=>{clock+=ms;},
    maxWaitMs:0,
  }),/EXACT_SHA_NOT_PUBLISHED/u);
});
