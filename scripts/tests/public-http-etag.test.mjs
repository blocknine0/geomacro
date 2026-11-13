import test from "node:test";
import assert from "node:assert/strict";
import {withPublicEtag} from "../../workers/control-plane/src/public-http-etag.mjs";

test("public response has a content ETag and matching conditional request is a bodyless 304",async()=>{
 const body={ok:true,signals:[{category:"rare_earth",status:"osint_feed_observed_unverified"}]};
 const first=await withPublicEtag(new Request("https://worker.test/feed"),
  Response.json(body,{headers:{"Cache-Control":"public, max-age=60, stale-while-revalidate=300"}}));
 const etag=first.headers.get("etag");
 assert.match(etag,/^"sha256-[a-f0-9]{64}"$/u);
 assert.deepEqual(await first.json(),body);
 const second=await withPublicEtag(new Request("https://worker.test/feed",{
  headers:{"If-None-Match":etag}}),
  Response.json(body,{headers:{"Cache-Control":"public, max-age=60, stale-while-revalidate=300"}}));
 assert.equal(second.status,304);
 assert.equal(await second.text(),"");
 assert.equal(second.headers.get("etag"),etag);
});

test("weak and unrelated validators do not change the response body",async()=>{
 const body={ok:true,signals:[]};
 const initial=await withPublicEtag(new Request("https://worker.test/feed"),
  Response.json(body));
 const etag=initial.headers.get("etag");
 const response=await withPublicEtag(new Request("https://worker.test/feed",{
  headers:{"If-None-Match":"W/"+etag+", \"other\""}}),Response.json(body));
 assert.equal(response.status,304);
});
