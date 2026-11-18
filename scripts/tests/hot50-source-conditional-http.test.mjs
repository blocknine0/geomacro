import test from 'node:test';
import assert from 'node:assert/strict';
import {boundedMacroGet} from '../lib/macro-fx-metals.mjs';
const lastModified='Wed, 18 Nov 2026 14:10:00 GMT';
const xml='<rss><channel></channel></rss>';
test('conditional ETag and Last-Modified are preserved with transparent UA and bounded response',async()=>{
 let call;
 const result=await boundedMacroGet('https://www.ecb.europa.eu/rss/press.html',{
  etag:'"abc123"',lastModified,fetchImpl:async(url,opts)=>{
   call={url,opts};return new Response(xml,{headers:{ETag:'"abc456"','Last-Modified':lastModified}})}
 });
 assert.equal(call.opts.headers['If-None-Match'],'"abc123"');
 assert.equal(call.opts.headers['If-Modified-Since'],lastModified);
 assert.match(call.opts.headers['User-Agent'],/^GeomacroOSINT/);
 assert.equal(call.opts.redirect,'error');
 assert.equal(result.lastModified,lastModified);
 assert.equal(result.etag,'"abc456"');
 assert.equal(result.text,xml);
});
test('304 saves the prior cursor without ingesting old native releases',async()=>{
 const result=await boundedMacroGet('https://www.ecb.europa.eu/rss/press.html',{
  etag:'"fresh"',lastModified,
  fetchImpl:async()=>new Response(null,{status:304})});
 assert.equal(result.notModified,true);assert.equal(result.text,null);
 assert.equal(result.lastModified,lastModified);
});
test('untrusted conditional headers rejected, 403 access denied never bypassed',async()=>{
 let captured;
 await assert.rejects(boundedMacroGet('https://www.adb.org/rss.xml',{
  etag:'foo\r\nMalicious: yes',lastModified:'Wed, 18 Nov 2026 14:10:00 GMT\r\nX-Extra: 1',
  fetchImpl:async(url,opts)=>{captured=opts.headers;return new Response(null,{status:403})}}),/ACCESS_DENIED/);
 assert.equal(captured['If-None-Match'],undefined);
 assert.equal(captured['If-Modified-Since'],undefined);
});
