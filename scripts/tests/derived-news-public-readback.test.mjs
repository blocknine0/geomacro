import test from "node:test";
import assert from "node:assert/strict";
import {
  DERIVED_NEWS_PUBLIC_READBACK_ENDPOINT,
  verifyDerivedNewsPublicReadback,
} from "../ops/verify-derived-news-public-readback.mjs";

const now=new Date("2026-10-26T00:00:00.000Z");
const signal=(category,id,published="2026-10-25T11:00:00.000Z",overrides={})=>({
  id:category+"-"+id,category,
  title:"Geomacro finds official monetary and economic policy developments",
  what_changed:"An official publisher issued a dated monetary policy update. Effects require separate evidence.",
  why_it_matters:"This official publication may inform financing conditions, but it does not establish a verified market outcome.",
  topic:"monetary policy",geography:null,development_type:"policy update",
  published_at:published,status:"official_release_observed_unscored",
  sources_credited:["Bank of Canada"],severity:null,same_event_corrob_verified:false,
  ...overrides,
});
const body=(signals=[signal("macro","1234abcd")])=>({
  ok:true,schema:"geomacro.website-derived-news-feed.v1",
  retention_days:3,retention_hours:72,original_release_delay_minutes:0,
  delivery_scope:"free_website_only",signals,
});
const ok=doc=>Response.json(doc);

test("D1 readback recovers from a transient DNS/network failure and verifies the second live response",async()=>{
  let calls=0;const delays=[];
  const receipt=await verifyDerivedNewsPublicReadback({
    now,baseDelayMs:7,sleepImpl:async ms=>delays.push(ms),
    fetchImpl:async(url,init)=>{
      calls++;
      assert.equal(url,DERIVED_NEWS_PUBLIC_READBACK_ENDPOINT);
      assert.equal(init.method,"GET");
      assert.equal(init.redirect,"error");
      assert.equal(init.cache,"no-store");
      assert.equal(init.headers.Accept,"application/json");
      assert.equal(init.headers["Cache-Control"],"no-cache");
      if(calls===1)throw Error("ENOTFOUND raw-host-and-response-must-not-be-logged");
      return ok(body([
        signal("geopolitics","aaaa1111"),
        signal("macro","bbbb2222"),
        signal("rare_earth","cccc3333","2026-10-25T23:45:00.000Z"),
      ]));
    },
  });
  assert.equal(calls,2);
  assert.deepEqual(delays,[7]);
  assert.deepEqual(receipt,{
    schema:"geomacro.website-derived-news-readback-receipt.v1",
    verified:true,http_status:200,read_attempts:2,derived_rows:3,
    categories:{
      geopolitics:{stored_72h:1,original_last_24h:1},
      macro:{stored_72h:1,original_last_24h:1},
      rare_earth:{stored_72h:1,original_last_24h:1},
    },
    original_release_delay_minutes:0,retention_hours_verified:72,
    original_clock_window_verified:true,source_content_logged:false,
    raw_upstream_disclosed:false,supabase_dependency:false,payments_performed:0,
  });
});

test("D1 readback retries a transient 503 but never retries a redirect or permission error",async()=>{
  let calls=0;const delays=[];
  const receipt=await verifyDerivedNewsPublicReadback({
    now,baseDelayMs:5,sleepImpl:async ms=>delays.push(ms),
    fetchImpl:async()=>{
      calls++;
      return calls===1?new Response("temporary",{status:503}):ok(body([]));
    },
  });
  assert.equal(receipt.verified,true);
  assert.equal(receipt.read_attempts,2);
  assert.deepEqual(delays,[5]);

  let forbiddenCalls=0;
  await assert.rejects(()=>verifyDerivedNewsPublicReadback({
    now,sleepImpl:async()=>{},
    fetchImpl:async()=>{forbiddenCalls++;return new Response("private",{status:403});},
  }),/DERIVED_NEWS_PUBLIC_READBACK_HTTP_403/u);
  assert.equal(forbiddenCalls,1);
});

test("persistent transport failure is bounded, source-neutral and fails closed",async()=>{
  let calls=0;
  await assert.rejects(()=>verifyDerivedNewsPublicReadback({
    now,baseDelayMs:1,sleepImpl:async()=>{},
    fetchImpl:async()=>{calls++;throw Error("ENOTFOUND private-domain-secret");},
  }),error=>{
    assert.equal(error.message,"DERIVED_NEWS_PUBLIC_READBACK_TRANSPORT_FAILED");
    assert.equal(error.message.includes("private-domain-secret"),false);
    return true;
  });
  assert.equal(calls,4);
});

test("rejects invalid schema, stale/future originals, URL leakage and duplicate IDs",async()=>{
  const bad=[
    body([signal("macro","id1","2026-10-22T23:00:00.000Z")]),
    body([signal("macro","id1","2026-10-26T00:00:01.000Z")]),
    body([signal("macro","id1","2026-10-25T23:00:00.000Z",{what_changed:"See https://publisher.example/article for details."})]),
    body([signal("macro","same"),signal("macro","same")]),
    {...body([]),delivery_scope:"commercial"},
    {...body([]),retention_hours:24},
  ];
  for(const doc of bad){
    let calls=0;
    await assert.rejects(()=>verifyDerivedNewsPublicReadback({
      now,sleepImpl:async()=>{},
      fetchImpl:async()=>{calls++;return ok(doc);},
    }),/DERIVED_NEWS_PUBLIC_READBACK_CONTRACT_INVALID/u);
    assert.equal(calls,1);
  }
});

test("malformed JSON is retried within the fixed attempt budget, then a valid response is accepted",async()=>{
  let calls=0;
  const receipt=await verifyDerivedNewsPublicReadback({
    now,maxAttempts:2,baseDelayMs:1,sleepImpl:async()=>{},
    fetchImpl:async()=>{
      calls++;
      return calls===1?new Response("{",{status:200}):ok(body([]));
    },
  });
  assert.equal(calls,2);
  assert.equal(receipt.verified,true);
  assert.equal(receipt.read_attempts,2);
});

test("repeated malformed JSON fails with a stable sanitized code after bounded retries",async()=>{
  let calls=0;
  await assert.rejects(()=>verifyDerivedNewsPublicReadback({
    now,maxAttempts:2,baseDelayMs:1,sleepImpl:async()=>{},
    fetchImpl:async()=>{calls++;return new Response("{",{status:200});},
  }),/DERIVED_NEWS_PUBLIC_READBACK_JSON_INVALID/u);
  assert.equal(calls,2);
});

test("rejects invalid retry configuration and oversized bodies",async()=>{
  await assert.rejects(()=>verifyDerivedNewsPublicReadback({now,maxAttempts:5}),
    /DERIVED_NEWS_PUBLIC_READBACK_CONFIGURATION_INVALID/u);
  await assert.rejects(()=>verifyDerivedNewsPublicReadback({
    now,fetchImpl:async()=>new Response("x".repeat(900_001),{status:200}),
  }),/DERIVED_NEWS_PUBLIC_READBACK_OVERSIZE/u);
});
