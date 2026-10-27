import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {
  PUBLIC_NEWS_R2_KEY,validatePublicNewsR2Bundle,
  readPublicNewsR2Snapshot,publishPublicNewsR2Snapshot
} from "../../workers/control-plane/src/public-news-r2-offload.mjs";
import {buildPublicNewsR2Snapshot,publishPublicNewsR2Snapshot as exportSnapshot}
  from "../ops/publish-public-news-r2-snapshot.mjs";

const sha="a".repeat(40);
const now=Date.parse("2026-10-27T08:00:00.000Z");
const time=new Date(now).toISOString();
const domains=["geopolitics","macro","rare_earth"];
const news=()=>({
  ok:true,schema:"geomacro.website-derived-news-feed.v1",
  delivery_scope:"free_website_only",retention_hours:72,
  original_release_delay_minutes:0,page_offset:0,page_size:250,
  has_more:false,next_offset:null,scored:false,chargeable:false,
  checked_at:time,signals:[]
});
const machine=()=>({
  ok:true,schema:"geomacro.derived-news-structural-feed.v1",
  projection:"source_neutral",chargeable:false,scored:false,signed:false,
  commercial_rights_verified:false,
  partner_resale_or_commercial_redistribution_authorized:false,
  raw_upstream_delivered:false,
  items:[],counts:Object.fromEntries(domains.map(x=>[x,0])),
  availability_by_category:Object.fromEntries(domains.map(x=>[x,{}]))
});
const bundle=()=>({
  schema:"geomacro.public-source-neutral-r2-bundle.v1",
  produced_at:time,origin_deployed_source_sha:sha,
  pages:{"0":news()},machine:machine()
});
const base="https://geomacro-control-plane.example";
const json=x=>Response.json(x);

test("valid, bounded, empty real journal snapshot is not a fabricated event",()=>{
  assert.deepEqual(validatePublicNewsR2Bundle(bundle(),now),{
    total:0,neutral:0,produced_at:time
  });
  assert.throws(()=>validatePublicNewsR2Bundle(bundle(),now+9*60_000),
    /PUBLIC_NEWS_R2_CONTRACT_INVALID/);
  assert.throws(()=>validatePublicNewsR2Bundle({...bundle(),machine:{
    ...machine(),commercial_rights_verified:true
  }},now),/PUBLIC_NEWS_R2_CONTRACT_INVALID/);
  assert.throws(()=>validatePublicNewsR2Bundle({...bundle(),pages:{
    "0":{...news(),has_more:true,next_offset:250}
  }},now),/PUBLIC_NEWS_R2_CONTRACT_INVALID/);
});

test("R2 only handles permitted anonymous public immediate and source-neutral paths",async()=>{
  let reads=0;
  const env={PUBLIC_NEWS_OFFLOAD_ENABLED:"1",
    PUBLIC_NEWS_R2:{async get(k){
      reads++;assert.equal(k,PUBLIC_NEWS_R2_KEY);
      return {size:300,async text(){return JSON.stringify(bundle())}};
    }}
  };
  for(const q of ["/v1/public/website-derived-news-immediate",
    "/v1/public/derived-structural-72h",
    "/v1/public/derived-structural-72h?domain=macro"]){
    const response=await readPublicNewsR2Snapshot(new Request(base+q),env,now);
    assert.equal(response.status,200);
    assert.equal(response.headers.get("X-GeoMacro-Public-Offload"),"r2");
    assert.equal((await response.json()).ok,true);
  }
  assert.equal(reads,3);
  for(const [q,headers] of [
    ["/v1/partner/predge/derived-structural-72h",{}],
    ["/v1/public/website-derived-news",{}],
    ["/v1/public/derived-structural-72h?country=USA",{}],
    ["/v1/public/derived-structural-72h",{Authorization:"Bearer private"}],
    ["/v1/public/derived-structural-72h",{"Cache-Control":"no-cache"}]
  ]){
    assert.equal(await readPublicNewsR2Snapshot(new Request(base+q,{headers}),env,now),null);
  }
  assert.equal(reads,3);
});

test("R2 unavailable/stale/invalid never returns fake success, always yields D1 fallback",async()=>{
  const req=new Request(base+"/v1/public/website-derived-news-immediate");
  assert.equal(await readPublicNewsR2Snapshot(req,{},now),null);
  const env={PUBLIC_NEWS_OFFLOAD_ENABLED:"1",
    PUBLIC_NEWS_R2:{async get(){return {size:123,async text(){
      return JSON.stringify(bundle());
    }}}}};
  const old=await readPublicNewsR2Snapshot(req,env,now+9*60_000);
  assert.equal(old.status,200);
  assert.equal(old.headers.get("X-GeoMacro-Canonical-Status"),"last-known-snapshot");
  assert.equal(old.headers.get("X-GeoMacro-Public-Offload"),"r2");
  assert.ok(old.headers.get("Warning").includes("canonical D1 freshness not verified"));
  assert.equal(await readPublicNewsR2Snapshot(req,env,now+25*60*60_000),null);
  env.PUBLIC_NEWS_R2.get=async()=>{throw Error("R2 billing or outage")};
  assert.equal(await readPublicNewsR2Snapshot(req,env,now),null);
  env.PUBLIC_NEWS_R2.get=async()=>({size:5,async text(){return "{"}});
  assert.equal(await readPublicNewsR2Snapshot(req,env,now),null);
});

test("writer requires exact R2 readback before optional ONE KV pointer",async()=>{
  const records=new Map(),pointers=new Map();
  const env={
    PUBLIC_NEWS_OFFLOAD_ENABLED:"1",GEOMACRO_SOURCE_SHA:sha,
    PUBLIC_NEWS_R2:{
      async put(key,value){records.set(key,value)},
      async get(key){const value=records.get(key);return value?{
        size:value.length,async text(){return value}
      }:null}
    },
    PUBLIC_NEWS_KV:{async put(k,v){pointers.set(k,v)}}
  };
  const res=await publishPublicNewsR2Snapshot(env,bundle(),now);
  const value=await res.json();
  assert.equal(res.status,200);
  assert.equal(value.r2_exact_readback_verified,true);
  assert.equal(value.kv_pointer_updated,true);
  assert.equal(value.d1_writes,0);
  assert.equal(value.b2_requests,0);
  assert.equal(value.sha256,createHash("sha256").update(JSON.stringify(bundle())).digest("hex"));
  assert.equal(records.size,1);
  assert.equal(pointers.size,1);
  const changed=await publishPublicNewsR2Snapshot({
    ...env,GEOMACRO_SOURCE_SHA:"b".repeat(40)
  },bundle(),now);
  assert.equal(changed.status,409);
  const corrupted=await publishPublicNewsR2Snapshot({
    ...env,PUBLIC_NEWS_R2:{
      async put(){},async get(){return {async text(){return "corrupt"}}}
    }
  },bundle(),now);
  assert.equal(corrupted.status,503);
  assert.equal((await corrupted.json()).ok,false);
});

test("GitHub batch reads the real D1-origin contracts with no-cache and publishes only normalized public bundle",async()=>{
  let requests=0,published=0;
  const fetchImpl=async(url,init)=>{
    requests++;
    if(init.method==="GET"){
      assert.equal(init.headers["Cache-Control"],"no-cache");
      if(url.endsWith("/health"))return json({ok:true,deployed_source_sha:sha});
      if(url.endsWith("/website-derived-news-immediate"))return json(news());
      if(url.endsWith("/derived-structural-72h"))return json(machine());
      assert.fail("unexpected D1 read "+url);
    }
    assert.equal(init.method,"PUT");published++;
    assert.match(init.headers.Authorization,/^Bearer [a-f0-9]{64}$/);
    const b=JSON.parse(init.body);
    assert.deepEqual(validatePublicNewsR2Bundle(b,now),{
      total:0,neutral:0,produced_at:time
    });
    return json({ok:true,schema:"geomacro.public-source-neutral-r2-receipt.v1",
      sha256:"f".repeat(64),stored_records:0,source_neutral_items:0,
      r2_exact_readback_verified:true,kv_pointer_updated:false});
  };
  const proof=await buildPublicNewsR2Snapshot({now:new Date(now),fetchImpl});
  assert.equal(proof.metrics.total,0);
  const receipt=await exportSnapshot({fetchImpl,now:new Date(now),
    env:{GEOMACRO_COMMERCE_LEDGER_TOKEN:"secret".repeat(8)}});
  assert.equal(receipt.d1_writes,0);assert.equal(receipt.b2_requests,0);
  assert.equal(receipt.new_upstream_reads,0);
  assert.equal(receipt.sha256,"f".repeat(64));
  assert.equal(published,1);assert.equal(requests,7);
});

test("anonymous bundle served from source-native-time-validated R2 without any D1 query",async()=>{
 let r2Reads=0,reads=0;
 const env={PUBLIC_NEWS_OFFLOAD_ENABLED:"1",GEOMACRO_SOURCE_SHA:sha,
  PUBLIC_NEWS_R2:{async get(key){r2Reads++;return {
   size:300,async text(){return JSON.stringify(bundle())}
  }}}};
 const req=new Request(base+"/v1/public/website-derived-news-bundle");
 const hit=await readPublicNewsR2Snapshot(req,env,now);
 assert.equal(hit.status,200);
 const decoded=await hit.json();
 assert.equal(decoded.schema,"geomacro.website-derived-news-bundle.v1");
 assert.equal(decoded.complete,true);
 assert.equal(decoded.returned_rows,0);
 assert.deepEqual(decoded.first_ingest,[]);
 assert.deepEqual(decoded.signals,[]);
 assert.equal(r2Reads,1);assert.equal(reads,0);
 const old=await readPublicNewsR2Snapshot(req,env,now+90*60_000);
 assert.equal(old.status,200);
 assert.equal(old.headers.get("X-GeoMacro-Canonical-Status"),"last-known-snapshot");
 assert.equal(old.headers.get("X-GeoMacro-Snapshot-At"),time);
 const invalid=await readPublicNewsR2Snapshot(req,{
  ...env,GEOMACRO_SOURCE_SHA:"b".repeat(40)},now);
 assert.equal(invalid,null,"mismatched worker SHA must not serve old snapshots");
 const protectedReq=new Request(req.url,{headers:{Authorization:"Bearer owner"}});
 assert.equal(await readPublicNewsR2Snapshot(protectedReq,env,now),null);
 assert.equal(await readPublicNewsR2Snapshot(new Request(
  base+"/v1/partner/predge/derived-structural-72h"),env,now),null);
});
test("fallback cannot falsely extend 72-hour native item validity",async()=>{
 const valid=new Date(now-70*60*60_000).toISOString();
 const real=bundle();
 // Put an invalid publisher event into otherwise empty snapshot. Such item is
 // refused, not rewritten to a current timestamp to make readback pass.
 real.pages["0"].signals=[{category:"macro",published_at:valid}];
 const env={PUBLIC_NEWS_OFFLOAD_ENABLED:"1",
  PUBLIC_NEWS_R2:{async get(){return {
   size:450,async text(){return JSON.stringify(real)}
  }}}};
 const res=await readPublicNewsR2Snapshot(new Request(
  base+"/v1/public/website-derived-news-immediate"),env,now+6*60*60_000);
 assert.equal(res,null);
});
