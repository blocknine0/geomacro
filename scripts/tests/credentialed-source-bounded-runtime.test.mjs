import test from 'node:test';
import assert from 'node:assert/strict';
import {probeCredentialedSource,fetchWtoCanonical} from '../../global-intelligence/adapters/credentialed-sources.mjs';
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

test('denial status is preserved before body limits and credentialed errors omit URL/token/body',async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async()=>new Response('private-body'.repeat(200),{status:403,headers:{'content-length':'100000'}});
  await assert.rejects(getJson('https://example.invalid?key=private-token',{maxBytes:1000,redirect:'error'}),e=>e.message==='HTTP 403 for bounded credentialed request');
  globalThis.fetch=async()=>new Response('private-malformed-body');
  await assert.rejects(getJson('https://example.invalid?key=private-token',{maxBytes:1000,redirect:'error'}),e=>e.message==='Non-JSON response from bounded credentialed request');
 }finally{globalThis.fetch=original;}
});

test('WTO permits one exact same-origin trailing-slash canonicalization without changing credential or query scope',async()=>{
 const url='https://api.wto.org/timeseries/v1/data?i=ITS_MTV_AX&r=000&ps=2024&subscription-key=private-token';
 const init={headers:{accept:'application/json'},signal:AbortSignal.timeout(15000)},calls=[];
 const result=await fetchWtoCanonical(url,init,async(target,options)=>{
  calls.push(target);assert.equal(options.signal,init.signal);
  if(calls.length===1){assert.equal(options.redirect,'manual');return new Response(null,{status:301,headers:{location:'/timeseries/v1/data/'}});}
  assert.equal(options.redirect,'error');assert.equal(new URL(target).search,new URL(url).search);
  return Response.json({Dataset:[]});
 },async ms=>assert.equal(ms,1100));
 assert.equal(result.status,200);assert.equal(calls.length,2);
 for(const status of [401,403,429]){
  let n=0;const response=await fetchWtoCanonical(url,init,async()=>{n++;return new Response('',{status});},async()=>{});
  assert.equal(response.status,status);assert.equal(n,1);
 }
 for(const location of ['http://api.wto.org/timeseries/v1/data/','https://api.wto.org.evil.example/timeseries/v1/data/','/timeseries/v1/data/?i=OTHER','https://user@api.wto.org/timeseries/v1/data/','/timeseries/v1/other/','/timeseries/v1/data/#fragment']){
  let n=0;
  await assert.rejects(fetchWtoCanonical(url,init,async()=>{n++;return new Response(null,{status:302,headers:{location}});},async()=>{}),/WTO_CANONICAL_REDIRECT_REFUSED/);
  assert.equal(n,1);
 }
});
