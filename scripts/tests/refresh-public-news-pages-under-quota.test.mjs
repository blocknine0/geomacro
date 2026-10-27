import test from "node:test";
import assert from "node:assert/strict";
import {refreshBoundedPublicNewsPages} from "../ops/refresh-public-news-pages-under-quota.mjs";
const env={GEOMACRO_COMMERCE_LEDGER_TOKEN:"a".repeat(64)};
const valid={ok:true,schema:"geomacro.public-derived-materialization-refresh.v1",
 state:"MATERIALIZED_COMMIT_VERIFIED",pages:3,read_queries:3,canonical_count:525,
 publisher_sources_polled:0,publisher_events_inserted:0,
 b2_requests:0,signed_products_created:0};
test("authenticated bounded one-call refresh never requests sources or B2",async()=>{
 let requests=0;
 const x=await refreshBoundedPublicNewsPages({env,fetchImpl:async(url,opts)=>{
  requests++;assert.match(url,/\/v1\/internal\/public-news-page-refresh$/);
  assert.equal(opts.method,"PUT");assert.equal(opts.cache,"no-store");
  assert.match(opts.headers.Authorization,/^Bearer [0-9a-f]{64}$/);
  assert.equal(opts.headers["Cache-Control"],"no-cache");
  return Response.json(valid);
 }});
 assert.equal(requests,1);
 assert.equal(x.verified_current_revision,true);
 assert.equal(x.source_news_writes,0);
 assert.equal(x.b2_requests,0);
});
test("no source or storage activity permitted in fake success",async()=>{
 for(const mutation of [
  {publisher_events_inserted:1},{signed_products_created:1},
  {b2_requests:1},{canonical_count:601},{state:"MATERIALIZED_REVISION_RACE_HELD"}
 ]){
  await assert.rejects(refreshBoundedPublicNewsPages({env,
   fetchImpl:async()=>Response.json({...valid,...mutation})}),/CONTRACT_INVALID/);
 }
});
test("Worker 503 or 409 is never converted to success or retried",async()=>{
 for(const status of [503,409]){
  let calls=0;
  await assert.rejects(refreshBoundedPublicNewsPages({env,
    fetchImpl:async()=>{calls++;return Response.json({private_article:"SECRET"}, {status})}}),
    new RegExp("PUBLIC_PAGE_REFRESH_HTTP_"+status));
  assert.equal(calls,1);
 }
});
