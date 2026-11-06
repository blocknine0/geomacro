import test from "node:test";
import assert from "node:assert/strict";
import {readPublicCountryRuntime} from "../lib/195x3-public-runtime-read.mjs";

const response=(status,body={ok:true})=>new Response(JSON.stringify(body),{
  status,headers:{"content-type":"application/json"},
});
test("503 and 429 are bounded and recover only after a real healthy response",async()=>{
  let calls=0,pauses=0;
  const result=await readPublicCountryRuntime("source-runtime",{
    fetcher:async()=>{calls++;return calls<3?response(calls===1?503:429):response(200,{ok:true,contexts:[1,2,3]});},
    pause:async()=>{pauses++;},
  });
  assert.deepEqual(result,{ok:true,contexts:[1,2,3]});
  assert.equal(calls,3);
  assert.equal(pauses,2);
});
test("persistent transient error remains unavailable and never silently returns quiet",async()=>{
  let calls=0;
  await assert.rejects(readPublicCountryRuntime("source-runtime",{
    fetcher:async()=>{calls++;return response(503);},
    pause:async()=>{},
  }),/COUNTRY_RUNTIME_PROVIDER_UNAVAILABLE/);
  assert.equal(calls,3);
});
test("401 or 403 never receives extra authorization requests",async()=>{
  for(const status of [401,403]){
    let calls=0;
    await assert.rejects(readPublicCountryRuntime("automated-finds",{
      fetcher:async()=>{calls++;return response(status);},pause:async()=>{},
    }),/COUNTRY_RUNTIME_AUTH_OR_ACCESS_DENIED/);
    assert.equal(calls,1);
  }
});
test("network timeouts recover at most twice without inventing source proofs",async()=>{
  let calls=0;
  await assert.rejects(readPublicCountryRuntime("source-runtime",{
    fetcher:async()=>{calls++;throw Error("private endpoint and bearer text");},
    pause:async()=>{},
  }),error=>error.message==="COUNTRY_RUNTIME_TRANSPORT_UNAVAILABLE");
  assert.equal(calls,3);
});
test("oversized, malformed and unapproved paths fail closed",async()=>{
  await assert.rejects(readPublicCountryRuntime("source-runtime",{
    maxBytes:10,fetcher:async()=>response(200,{huge:"very long"}),
  }),/COUNTRY_RUNTIME_RESPONSE_TOO_LARGE/);
  await assert.rejects(readPublicCountryRuntime("source-runtime",{
    fetcher:async()=>new Response("not-json",{status:200}),
  }),/COUNTRY_RUNTIME_JSON_INVALID/);
  await assert.rejects(readPublicCountryRuntime("../private",{
    fetcher:async()=>{throw Error("must not call");},
  }),/COUNTRY_RUNTIME_READ_BOUNDS_INVALID/);
});
