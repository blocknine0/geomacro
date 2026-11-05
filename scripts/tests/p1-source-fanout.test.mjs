import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {dispatchP1DueSources,consumeP1SourcePollBatch,p1SourceCoverageHealth,
 p1Shard,p1UpsertSourceCellMap} from "../../workers/control-plane/src/p1-source-fanout.mjs";
import {p1SourceContentFingerprintFields,fetchP0aSource,
 listP0aSourceRegistry} from "../../workers/control-plane/src/p0a-source-registry.mjs";
import {normalizeP0aPayload} from "../../workers/control-plane/src/p0a-source-format.mjs";
const now=Date.parse("2026-11-04T16:10:00.000Z"),last=()=>new Date(now).toISOString();
const migrations=["0113_p0a_source_registry.sql","0119_p1_source_fanout_585.sql","0127_p1_bundled_source_dispatch.sql"];
function fixture(count=0){
 const db=new DatabaseSync(":memory:");
 for(const name of migrations)db.exec(readFileSync(
  new URL("../../workers/control-plane/migrations/"+name,import.meta.url),"utf8"));
 db.exec("CREATE TABLE phase2h_private_raw_news("+
  "risk_country_iso3 TEXT,category TEXT,original_published_at TEXT,"+
  "first_ingested_at TEXT,b2_object_sha256 TEXT)");
 const prepare=(sql,args=[])=>({
  sql,args,bind(...v){return prepare(sql,v)},
  async run(){const x=db.prepare(sql).run(...args);return {meta:{changes:x.changes}}},
  async all(){return {results:db.prepare(sql).all(...args)}},
  async first(){return db.prepare(sql).get(...args)??null}
 });
 const DB={prepare,async batch(stmts){
  db.exec("BEGIN");
  try{const ret=[];for(const s of stmts)ret.push(await s.run());db.exec("COMMIT");return ret;}
  catch(e){db.exec("ROLLBACK");throw e}
 }};
 if(count){
  db.exec("BEGIN");
  const q=db.prepare("INSERT INTO source_registry("+
   "source_id,canonical_endpoint,parser_type,intended_category,"+
   "country_iso3,rights_tier,polling_interval_sec,rate_limit_backoff) "+
   "VALUES (?,?,?,?,?,?,?,?)");
  for(let n=0;n<count;n++){
   const id="private_source_"+String(n).padStart(4,"0");
   q.run(id,"https://official.example.org/feed/"+n,"RSS_2",
    "GEOPOLITICS","GLOBAL","RESEARCH_ONLY",3600,
    JSON.stringify({max_retries:0,base_delay_ms:100,respect_retry_after:true}));
  }
  db.exec("COMMIT");
 }
 return {db,DB,close:()=>db.close()};
}
test("P1 private D1 migration provides exactly 195 x 3 countries and 10 logical shards",()=>{
 const f=fixture();
 try{
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM p1_country_category_cells").get().n,585);
  assert.equal(f.db.prepare("SELECT COUNT(DISTINCT country_iso3) AS n FROM p1_country_category_cells").get().n,195);
  assert.equal(f.db.prepare("SELECT COUNT(DISTINCT primary_category) AS n FROM p1_country_category_cells").get().n,3);
  const shards=new Set(Array.from({length:200},(_,i)=>p1Shard("private_source_"+i)));
  assert.equal(shards.size,10);
  assert.equal(f.db.prepare("SELECT name FROM sqlite_master WHERE name='p1_source_cell_mapping_health'").get().name,
   "p1_source_cell_mapping_health");
 }finally{f.close()}
});
test("P1 1077 due sources fan out through max 108 per minute and ten isolated Queue shards in an hour",async()=>{
 const f=fixture(1077),batches=[];let attempted=0;
 try{
  const env={DB:f.DB,GEOMACRO_P1_FANOUT_ENABLED:"1",
   SOURCE_POLL_QUEUE:{async sendBatch(messages){batches.push(messages)}}};
  for(let minute=0;minute<10;minute++){
   const t=now+minute*60000,before=batches.length;
   const r=await dispatchP1DueSources(env,{now:t});
   assert.ok(r.queued<=108);assert.equal(r.queued,r.selected);
   const produced=batches.slice(before);
   assert.ok(produced.length<=20);
   assert.ok(new Set(produced.flatMap(g=>g.map(m=>m.body.shard))).size<=10);
   assert.ok(produced.every(g=>g.length<=15));
   for(const batch of produced){
    const messages=batch.map(x=>({
     body:x.body,acked:0,ack(){this.acked++},retry(){throw Error("NO_RETRY")}
    }));
    const out=await consumeP1SourcePollBatch({
     queue:"geomacro-source-poll",messages
    },env,{
     now:t,poll:async(_, {sourceIds})=>{
      const update=f.db.prepare("UPDATE source_registry "+
       "SET last_polled_at=?,next_poll_at=? WHERE source_id=?");
      const receipt=[];
      for(const id of sourceIds){
       update.run(new Date(t).toISOString(),new Date(t+3600000).toISOString(),id);
       attempted++;receipt.push({source_id:id,state:"UNCHANGED"});
      }
      return {ok:true,receipts:receipt};
     }
    });
    assert.equal(out.attempts,messages.length);
    assert.ok(messages.every(m=>m.acked===1));
   }
  }
  assert.equal(attempted,1077);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM source_registry WHERE last_polled_at IS NOT NULL").get().n,1077);
  const idle=await dispatchP1DueSources(env,{now:now+10*60000});
  assert.equal(idle.queued,0);
  const listing=await listP0aSourceRegistry({DB:f.DB},new URLSearchParams({limit:"250"}));
  const list=await listing.json();
  assert.equal(list.sources.length,250);assert.equal(list.has_more,true);
  const next=await (await listP0aSourceRegistry({DB:f.DB},
   new URLSearchParams({limit:"250",after:list.next_after}))).json();
  assert.equal(next.sources.length,250);
 }finally{f.close()}
});
test("P1 585-cell dashboard distinguishes configured sources from independently B2 archived evidence",async()=>{
 const f=fixture(1);
 try{
  const env={DB:f.DB};
  const empty=await (await p1SourceCoverageHealth(env,{now})).json();
  assert.equal(empty.cells_total,585);
  assert.equal(empty.cells_with_fresh_b2_original_6h,0);
  assert.equal(empty.missing_mapping_cells,585);
  assert.equal(empty.target_95_percent_met,false);
  const row=f.db.prepare("SELECT source_id FROM source_registry LIMIT 1").get();
  f.db.prepare("UPDATE source_registry SET country_iso3='AFG' WHERE source_id=?")
   .run(row.source_id);
  let put=await p1UpsertSourceCellMap(env,{links:[{category:"GEOPOLITICS",
   country_iso3:"AFG",rank:1,source_id:row.source_id}]});
  assert.equal(put.status,200);assert.equal((await put.json()).readback_verified,true);
  f.db.prepare("INSERT INTO phase2h_private_raw_news "+
   "(risk_country_iso3,category,original_published_at,first_ingested_at,b2_object_sha256) "+
   "VALUES (?,?,?,?,?)").run("AFG","geopolitics",last(),last(),"a".repeat(64));
  const updated=await (await p1SourceCoverageHealth(env,{now})).json();
  assert.equal(updated.cells_with_fresh_b2_original_6h,1);
  assert.equal(updated.gaps,584);
  assert.equal(updated.matrix.find(x=>x.country_iso3==="AFG"&&x.category==="GEOPOLITICS").mapping_complete,false);
  assert.equal(updated.target_95_percent_met,false);
 }finally{f.close()}
});
test("P1 transport refuses HTML soft 404 masquerading as RSS without promoting an origin",async()=>{
 const config={
  canonical_endpoint:"https://www.example.org/rss",parser_type:"RSS_2",
  last_cursor:null,rate_limit_backoff:{max_retries:0,base_delay_ms:100,
   respect_retry_after:true}
 };
 const html=await fetchP0aSource(config,{now,fetchImpl:async()=>new Response(
  "<html><title>404 Not Found</title></html>",{status:200,headers:{
   "Content-Type":"text/html"}})});
 assert.equal(html.state,"MALFORMED");
 const withNoTimezone=await normalizeP0aPayload("JSON_REST",new TextEncoder().encode(
  JSON.stringify({items:[{title:"Country announces new minerals policy",
   url:"https://www.example.org/minerals",
   date_published:"2026-11-04 12:00:00"}]})
 ));
 assert.equal(withNoTimezone[0].native_published_at,null);
 assert.equal(p1SourceContentFingerprintFields({title:" New POLICY ",
  original_url:"https://example.org/item?utm_source=social#section"}),
  p1SourceContentFingerprintFields({title:"new policy",
   original_url:"https://example.org/item"}));
});

test("P1 V2 leases 108 sources with two physical row changes, never 108 row leases",async()=>{
 const f=fixture(1077),batches=[];let processed=0;
 try{
  const env={DB:f.DB,GEOMACRO_P1_FANOUT_ENABLED:"1",
   GEOMACRO_P1_BUNDLED_LEASES_ENABLED:"1",
   SOURCE_POLL_QUEUE:{async sendBatch(messages){batches.push(messages)}}};
  const baseline=f.db.prepare("SELECT total_changes() AS n").get().n;
  const first=await dispatchP1DueSources(env,{now});
  assert.equal(first.status,"P1_BUNDLE_QUEUED");
  assert.equal(first.selected,108);
  assert.equal(first.queued,108);
  assert.equal(first.physical_dispatch_lease_rows,1);
  assert.equal(f.db.prepare("SELECT total_changes() AS n").get().n-baseline,2);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM source_registry WHERE poll_dispatch_token IS NOT NULL").get().n,0);
  assert.ok(batches.flat().every(m=>m.body.kind==="P1_SOURCE_POLL_V2"));
  const same=await dispatchP1DueSources(env,{now});
  assert.equal(same.status,"P1_BUNDLE_DISPATCH_BUSY");
  for(let minute=0;minute<10;minute++){
   const t=now+minute*60000,before=minute===0?0:batches.length;
   if(minute>0){
    const result=await dispatchP1DueSources(env,{now:t});
    assert.ok(result.queued<=108);assert.equal(result.selected,result.queued);
   }
   const start=minute===0?0:before;
   const parts=batches.slice(start);
   for(const part of parts){
    const messages=part.map(x=>({body:x.body,ackCount:0,
     ack(){this.ackCount++},retry(){throw Error("UNEXPECTED_V2_RETRY")}}));
    const res=await consumeP1SourcePollBatch({
     queue:"geomacro-source-poll",messages
    },env,{now:t,poll:async(_, {sourceIds})=>{
     const stmt=f.db.prepare("UPDATE source_registry SET last_polled_at=?,next_poll_at=? WHERE source_id=?");
     const receipts=[];
     for(const id of sourceIds){
      stmt.run(new Date(t).toISOString(),new Date(t+3600000).toISOString(),id);
      processed++;
      receipts.push({source_id:id,state:"UNCHANGED"});
     }
     return {ok:true,receipts};
    }});
    assert.equal(res.attempts,messages.length);
    assert.ok(messages.every(m=>m.ackCount===1));
   }
  }
  assert.equal(processed,1077);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM source_registry WHERE poll_dispatch_token IS NOT NULL").get().n,0);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM source_registry WHERE last_polled_at IS NOT NULL").get().n,1077);
 }finally{f.close()}
});

test("P1 V2 failed queue send retains short lease then automatically re-dispatches",async()=>{
 const f=fixture(1);let sent=0;
 try{
  const env={DB:f.DB,GEOMACRO_P1_FANOUT_ENABLED:"1",
   GEOMACRO_P1_BUNDLED_LEASES_ENABLED:"1",
   SOURCE_POLL_QUEUE:{async sendBatch(){sent++;throw Error("QUEUE_TEMP_FAILURE")}}};
  const first=await dispatchP1DueSources(env,{now});
  assert.equal(first.status,"P1_BUNDLE_QUEUED_PARTIAL");
  assert.equal(first.selected,1);assert.equal(first.queued,0);assert.equal(first.failed,1);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM p1_source_poll_bundles").get().n,1);
  const held=await dispatchP1DueSources(env,{now:now+60000});
  assert.equal(held.status,"P1_BUNDLE_IDLE");
  assert.equal(sent,1);
  const replay=await dispatchP1DueSources(env,{now:now+121000});
  assert.equal(replay.selected,1);assert.equal(replay.failed,1);
  assert.equal(sent,2);
 }finally{f.close()}
});

test("P1 V2 rejects unknown/expired lease without polling and retries D1 read failures",async()=>{
 const f=fixture(1),msgs=[];
 try{
  const env={DB:f.DB,GEOMACRO_P1_FANOUT_ENABLED:"1",
   GEOMACRO_P1_BUNDLED_LEASES_ENABLED:"1",
   SOURCE_POLL_QUEUE:{async sendBatch(piece){msgs.push(...piece)}}};
  assert.equal((await dispatchP1DueSources(env,{now})).queued,1);
  let calls=0;
  const expired={body:msgs[0].body,acked:0,ack(){this.acked++},
   retry(){throw Error("UNEXPECTED_EXPIRED_RETRY")}};
  const r=await consumeP1SourcePollBatch({queue:"geomacro-source-poll",
   messages:[expired]},env,{now:now+121000,poll:async()=>{calls++;throw Error("SHOULD_NOT_POLL")}});
  assert.equal(r.status,"P1_CONSUME_LEASE_EXPIRED");assert.equal(expired.acked,1);
  assert.equal(calls,0);
  const bad={body:{...msgs[0].body,lease_token:"00000000-0000-4000-8000-000000000000"},
   acked:0,ack(){this.acked++},retry(){throw Error("UNEXPECTED_TAMPER_RETRY")}};
  const b=await consumeP1SourcePollBatch({queue:"geomacro-source-poll",
   messages:[bad]},env,{now:now+15000,poll:async()=>{calls++;throw Error("SHOULD_NOT_POLL")}});
  assert.equal(b.status,"P1_CONSUME_LEASE_EXPIRED");assert.equal(bad.acked,1);
  const failure={body:msgs[0].body,acked:0,retries:0,ack(){this.acked++},
   retry(){this.retries++}};
  const unavailable=await consumeP1SourcePollBatch({queue:"geomacro-source-poll",
   messages:[failure]},{DB:{prepare(){throw Error("D1_UNAVAILABLE")}}},
   {now:now+15000});
  assert.equal(unavailable.status,"P1_CONSUME_BUNDLE_LEASE_D1_UNAVAILABLE");
  assert.equal(failure.acked,0);assert.equal(failure.retries,1);
 }finally{f.close()}
});

test("P1 consumer never acknowledges unverified source storage",async()=>{
 const f=fixture(1),msgs=[];
 try{
  const env={DB:f.DB,GEOMACRO_P1_FANOUT_ENABLED:"1",
   GEOMACRO_P1_BUNDLED_LEASES_ENABLED:"1",
   SOURCE_POLL_QUEUE:{async sendBatch(part){msgs.push(...part)}}};
  assert.equal((await dispatchP1DueSources(env,{now})).queued,1);
  const item={body:msgs[0].body,acked:0,retries:0,
   ack(){this.acked++},retry(){this.retries++}};
  const result=await consumeP1SourcePollBatch({queue:"geomacro-source-poll",
   messages:[item]},env,{now,poll:async()=>({ok:true,
    receipts:[{source_id:msgs[0].body.source_id,state:"UNAVAILABLE",
      storage_readback_verified:false}]})});
  assert.equal(result.status,"P1_CONSUME_PARTIAL");
  assert.equal(item.acked,0);assert.equal(item.retries,1);
 }finally{f.close()}
});
