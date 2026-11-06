import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {putUnifiedEvents,readUnifiedEvents,reserveUnifiedEventArchiveSlot,verifyUnifiedB2Archive} from "../../workers/control-plane/src/unified-event-stream.mjs";
import {eligiblePublicFreeD1CacheRequest} from "../../workers/control-plane/src/public-free-d1-cache.mjs";

class MockD1 {
  rows=new Map(); slots=new Map();
  prepare(sql){
    const owner=this;
    return {sql,args:[],bind(...args){this.args=args;return this},
      async run(){return owner.run(sql,this.args)},
      async all(){return owner.all(sql,this.args)},
      async first(){return owner.first(sql,this.args)}};
  }
  async batch(statements){return Promise.all(statements.map(s=>this.run(s.sql,s.args)))}
  async run(sql,a){
    if(sql.startsWith("INSERT OR IGNORE INTO events")){
      const [id,source_type,source_name,source_url,credibility_score,title,summary,raw_payload_ref,country_iso,risk_category,independently_verified,sentiment_score,published_at]=a;
      if(this.rows.has(id))return {success:true,meta:{changes:0}};
      this.rows.set(id,{id,source_type,source_name,source_url,credibility_score,title,summary,raw_payload_ref,country_iso,risk_category,independently_verified,sentiment_score,published_at,created_at:1,archived_at:null});
      return {success:true,meta:{changes:1}};
    }
    if(sql.startsWith("INSERT OR IGNORE INTO unified_event_archive_slots")){
      const [hour,reserved_at]=a;const changed=!this.slots.has(hour);
      if(changed)this.slots.set(hour,{hour_utc:hour,state:"RESERVED",reserved_at});
      return {success:true,meta:{changes:Number(changed)}};
    }
    return {success:true,meta:{changes:0}};
  }
  async all(sql,a){
    if(sql.includes("FROM events WHERE id IN"))return {results:a.map(id=>this.rows.get(id)).filter(Boolean)};
    if(sql.includes("FROM events WHERE risk_category")){
      const [category,min,cutoff,...tail]=a;const country=tail.length>1?tail[0]:null;const limit=tail.at(-1);
      return {results:[...this.rows.values()].filter(x=>x.risk_category===category&&x.credibility_score>=min&&x.published_at>=cutoff&&(!country||x.country_iso===country)).slice(0,limit??50)};
    }
    return {results:[]};
  }
  async first(sql,a){const [hour]=a;return this.slots.get(hour)||null}
}

const event=(source,title,published_at,overrides={})=>({
  id:createHash("sha256").update(`${source}\n${title.normalize("NFC").trim().replace(/\s+/gu," ").toLowerCase()}\n${published_at}`).digest("hex"),
  source_type:"verified_media",source_name:source,source_url:"https://news.example/story",
  credibility_score:.8,title,summary:null,raw_payload_ref:null,country_iso:"US",
  risk_category:"macro_economics",sentiment_score:null,published_at,...overrides,
});

test("batched D1 upsert deduplicates deterministically and verifies exact readback",async()=>{
  const DB=new MockD1(),row=event("wire-a","Fed holds policy rate",Math.floor(Date.now()/1000)-60);
  const response=await putUnifiedEvents({DB},{schema:"geomacro.unified-event-batch.v1",items:[row,row]});
  const body=await response.json();
  assert.equal(response.status,200);assert.equal(body.accepted,1);
  assert.equal(body.duplicate_batch_ids,1);assert.equal(body.d1_exact_readback_verified,true);
  const retry=await putUnifiedEvents({DB},{schema:"geomacro.unified-event-batch.v1",items:[row]});
  assert.equal((await retry.json()).unchanged,1);
});

test("invalid identity is held before any D1 write",async()=>{
  const DB=new MockD1(),row=event("wire-b","Sanctions announced",Math.floor(Date.now()/1000)-60);row.id="0".repeat(64);
  const response=await putUnifiedEvents({DB},{schema:"geomacro.unified-event-batch.v1",items:[row]});
  assert.equal(response.status,503);assert.equal((await response.json()).held,1);assert.equal(DB.rows.size,0);
});

test("canonical public feed maps macro alias and applies credibility and seven-day bounds",async()=>{
  const DB=new MockD1(),now=1_800_000_000_000;
  DB.rows.set("a",{...event("wire-c","Fresh macro event",Math.floor(now/1000)-60),id:"a"});
  DB.rows.set("b",{...event("wire-d","Low score event",Math.floor(now/1000)-60,{credibility_score:.4}),id:"b"});
  const response=await readUnifiedEvents({DB},new URL("https://example/api/v1/feed?category=macro&min_credibility=0.7"),now);
  const body=await response.json();
  assert.equal(response.status,200);assert.equal(body.events.length,1);
  assert.equal(body.events[0].id,"a");assert.equal(body.retention_days,7);
});

test("one D1 archive slot can be reserved once per UTC hour",async()=>{
  const DB=new MockD1(),now=Date.parse("2026-11-06T23:35:00Z"),body={
    schema:"geomacro.unified-event-archive-slot.v1",hour_utc:"2026-11-06T23"};
  const first=await reserveUnifiedEventArchiveSlot({DB},body,now);
  const second=await reserveUnifiedEventArchiveSlot({DB},body,now+1000);
  assert.equal(first.status,200);assert.equal((await first.json()).reserved,true);
  assert.equal(second.status,409);
});

test("only fixed unified feed queries enter the public edge cache",()=>{
  assert.equal(eligiblePublicFreeD1CacheRequest(new Request("https://example/api/v1/feed?category=macro&min_credibility=0.7")),true);
  assert.equal(eligiblePublicFreeD1CacheRequest(new Request("https://example/api/v1/feed?category=macro&min_credibility=0.7&country=US")),false);
  assert.equal(eligiblePublicFreeD1CacheRequest(new Request("https://example/api/v1/feed?category=macro&min_credibility=0.2")),false);
});

test("B2 archive parity requires a quota-reserved exact SHA-256 body readback",async()=>{
  const bytes=new TextEncoder().encode("gzip fixture bytes"),sha=createHash("sha256").update(bytes).digest("hex");
  let calls=0,headers;
  const result=await verifyUnifiedB2Archive({DB:{prepare(){}},
    B2_S3_ENDPOINT:"https://s3.us-east-005.backblazeb2.com",B2_SPOOL_BUCKET:"geomacro-private-archive",
    B2_KEY_ID:"access-key",B2_APPLICATION_KEY:"secret-key-value-long-enough"},{
    archive_object_key:`archive/events/20261106T23-${sha}.ndjson.gz`,archive_sha256:sha,
  },{
    now:new Date("2026-11-06T23:35:00Z"),
    reserve:async()=>({ok:true,reserved:true}),
    fetchImpl:async(url,init)=>{calls++;headers=init.headers;return new Response(bytes,{status:200})},
  });
  assert.equal(result.status,200);assert.equal((await result.json()).b2_exact_readback_verified,true);
  assert.equal(calls,1);assert.match(headers.Authorization,/AWS4-HMAC-SHA256/u);
});

test("B2 exact readback fails closed when shared quota is held",async()=>{
  let calls=0;
  const response=await verifyUnifiedB2Archive({DB:{prepare(){}}},{
    archive_object_key:"archive/events/20261106T23-"+"a".repeat(64)+".ndjson.gz",
    archive_sha256:"a".repeat(64),
  },{now:new Date("2026-11-06T23:35:00Z"),reserve:async()=>({ok:false,reserved:false}),
    fetchImpl:async()=>{calls++;return new Response("never")}});
  assert.equal(response.status,503);assert.equal(calls,0);
});
