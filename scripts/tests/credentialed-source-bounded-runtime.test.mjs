import test from 'node:test';
import assert from 'node:assert/strict';
import {probeCredentialedSource} from '../../global-intelligence/adapters/credentialed-sources.mjs';
import {getJson} from '../../global-intelligence/adapters/http.mjs';

test('UCDP uses one pinned official version, header-only token, and no guessed monthly publication',async()=>{
 const originalFetch=globalThis.fetch,old=process.env.UCDP_API_TOKEN;
 process.env.UCDP_API_TOKEN='private-ucdp-token';let calls=0;
 try{
  globalThis.fetch=async(url,options)=>{
   calls++;assert.equal(url,'https://ucdpapi.pcr.uu.se/api/gedevents/26.1?pagesize=1&page=1&Id=4');
   assert.equal(options.redirect,'error');assert.equal(options.headers['x-ucdp-access-token'],'private-ucdp-token');
   return Response.json({TotalCount:1,Result:[{id:4,date_end:'2010-09-25',source_article:'private-original'}]});
  };
  const r=await probeCredentialedSource('ucdp_ged');
  assert.equal(calls,1);assert.equal(r.source_id,'ucdp_ged');assert.equal(r.category,'GEOPOLITICS');
  assert.equal(r.published_at,undefined);assert.ok(!r.summary.includes('private-original'));
 }finally{globalThis.fetch=originalFetch;if(old===undefined)delete process.env.UCDP_API_TOKEN;else process.env.UCDP_API_TOKEN=old;}
});
test('credentialed HTTP body bound covers header and streamed bytes, never follows redirects',async()=>{
 const original=globalThis.fetch;
 try{
  for(const response of [new Response('x',{headers:{'content-length':'1001'}}),new Response('x'.repeat(1001))]){
   globalThis.fetch=async(_url,options)=>{assert.equal(options.redirect,'error');return response;};
   await assert.rejects(getJson('https://example.invalid',{maxBytes:1000,redirect:'error'}),/HTTP_BODY_LIMIT/);
  }
 }finally{globalThis.fetch=original;}
});
