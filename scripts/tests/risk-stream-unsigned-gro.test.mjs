import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {webcrypto} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {issueUnsignedDailyNewsBatch,makeUnsignedDailyNewsGro,
 readUnsignedDailyNewsGros,pruneUnsignedDailyNewsGros} from "../../workers/control-plane/src/risk-stream-unsigned-gro.mjs";
globalThis.crypto??=webcrypto;
const NOW=Date.parse("2026-11-14T12:00:00.000Z");
const signal={country_iso3:"IND",category:"GEOPOLITICS",event_fingerprint:"a".repeat(64),
 published_at:"2026-11-14T11:50:00.000Z",original_verified:false,
 derived:{what:"Unverified SANCTIONS signal for IND"}};
function database(){
 const db=new DatabaseSync(":memory:");
 db.exec(readFileSync("workers/control-plane/migrations/0221_hot50_unsigned_news_gro.sql","utf8"));
 const env={DB:{
  prepare(sql){const stmt=db.prepare(sql);return {bind(...values){
   return {first:async()=>stmt.get(...values)??null,
    all:async()=>({results:stmt.all(...values)}),
    run:async()=>stmt.run(...values)};}}},
  async batch(statements){return Promise.all(statements.map(async s=>{
   const result=await s.run();return {success:true,meta:{changes:Number(result.changes)}};
  }));}
 },RISK_STREAM_HOT50_AUTONOMOUS_ENABLED:"1"};
 return {db,env};
}
test("unsigned Hot50 GRO schema prevents signature, rights, sale and execution claims",()=>{
 const {db}=database();
 const schema=db.prepare("SELECT sql FROM sqlite_schema WHERE name='risk_stream_unsigned_news_gro'").get().sql;
 for(const clause of ["CHECK(signature_status='UNSIGNED')",
  "CHECK(commercial_sale_authorized=0)","CHECK(source_rights_verified=0)",
  "CHECK(raw_source_disclosed=0)","CHECK(execution_authorized=0)"])
  assert.ok(schema.includes(clause),clause);
 const triggers=db.prepare("SELECT name FROM sqlite_schema WHERE type='trigger'").all().map(x=>x.name);
 assert.deepEqual(triggers.sort(),[
  "trg_risk_stream_unsigned_news_expired_delete_only",
  "trg_risk_stream_unsigned_news_no_update"
 ]);
});
test("news event creates one immutable unsigned object for each tier with no raw source fields",async()=>{
 const {db,env}=database();
 const receipt=await issueUnsignedDailyNewsBatch(env,[signal],{now:NOW});
 assert.equal(receipt.status,"UNSIGNED_GRO_D1_READBACK_PASS");
 assert.equal(receipt.created,3);
 assert.equal(receipt.signature_created,false);
 assert.equal(receipt.commercial_sale_authorized,false);
 const rows=db.prepare("SELECT * FROM risk_stream_unsigned_news_gro ORDER BY tier").all();
 assert.equal(rows.length,3);
 assert.throws(()=>db.exec("UPDATE risk_stream_unsigned_news_gro SET tier='standard'"));
 assert.throws(()=>db.exec("DELETE FROM risk_stream_unsigned_news_gro"));
 for(const row of rows){
  const payload=JSON.parse(row.payload_json);
  assert.equal(payload.signed,false);
  assert.equal(payload.signature_status,"UNSIGNED");
  assert.equal(payload.evidence_status,"UNVERIFIED_SIGNAL");
  assert.equal(payload.billable,false);
  assert.equal(payload.source_rights_verified,false);
  assert.equal(payload.customer_delivery_authorized,false);
  assert.equal(payload.execution_authorized,false);
  assert.equal(row.signature_status,"UNSIGNED");
  assert.equal(row.commercial_sale_authorized,0);
  assert.equal(row.raw_source_disclosed,0);
  assert.equal(payload.customer_price_usdc,undefined);
  assert.doesNotMatch(row.payload_json,/https?:|source_url|publisher_root_domain|raw_payload|signature_b64|signing_key_id/iu);
 }
 const retry=await issueUnsignedDailyNewsBatch(env,[signal],{now:NOW+120000});
 assert.equal(retry.created,0);
 assert.equal(retry.idempotent,3);
 assert.equal(db.prepare("SELECT count(*) AS n FROM risk_stream_unsigned_news_gro").get().n,3);
});
test("global-search lead remains unverified and cannot promote Standard or Complex",async()=>{
 const {db,env}=database();
 const lead={...signal,event_fingerprint:"b".repeat(64),original_verified:false,
  derived:undefined};
 await issueUnsignedDailyNewsBatch(env,[lead],{now:NOW});
 const rows=db.prepare("SELECT tier,payload_json FROM risk_stream_unsigned_news_gro").all();
 assert.equal(rows.length,3);
 for(const row of rows){
  const p=JSON.parse(row.payload_json);
  assert.equal(p.evidence_status,"UNVERIFIED_SIGNAL");
  assert.equal(p.tier_status,row.tier==="basic_focused"?
   "NEWS_ANALYSIS_AVAILABLE":row.tier==="standard"?
   "EVIDENCE_RECOVERY_REQUIRED":"CONTRACTUAL_COMPLEX_HISTORY_REVIEW_REQUIRED");
  assert.equal(p.commercial_sale_authorized,false);
  assert.equal(p.billable,false);
 }
});
test("protected private readback returns unsigned objects and rejects query expansion",async()=>{
 const {env}=database();
 await issueUnsignedDailyNewsBatch(env,[signal],{now:NOW});
 const ok=await readUnsignedDailyNewsGros(
  new Request("https://worker/v1/internal/risk-stream/unsigned-news-gros?country_iso3=IND&limit=3"),
  env,NOW);
 assert.equal(ok.status,200);
 const body=await ok.json();
 assert.equal(body.signature_created,false);
 assert.equal(body.items.length,3);
 assert.ok(body.items.every(x=>x.signature_status==="UNSIGNED"));
 const bad=await readUnsignedDailyNewsGros(
  new Request("https://worker/v1/internal/risk-stream/unsigned-news-gros?url=https://publisher.example"),
  env,NOW);
 assert.equal(bad.status,400);
});
test("automation flag off is fail-closed and writes nothing",async()=>{
 const {db,env}=database();
 env.RISK_STREAM_HOT50_AUTONOMOUS_ENABLED="0";
 const r=await issueUnsignedDailyNewsBatch(env,[signal],{now:NOW});
 assert.equal(r.status,"UNSIGNED_GRO_AUTOMATION_HELD");
 assert.equal(db.prepare("SELECT count(*) AS n FROM risk_stream_unsigned_news_gro").get().n,0);
});

test("queue arrivals and the rotating Hot50 scanner both drive unsigned GRO creation",()=>{
 const pipeline=readFileSync("workers/control-plane/src/risk-stream-pipeline.mjs","utf8");
 const scanner=readFileSync("workers/control-plane/src/risk-stream-autonomous-hot50.mjs","utf8");
 assert.match(pipeline,/issueUnsignedDailyNewsBatch\(env,signals/);
 assert.match(pipeline,/unsigned_news_gro_signature_created:false/);
 assert.match(scanner,/planHot50StreamCells\(now,perTick\)/);
 assert.match(scanner,/issueUnsignedDailyNewsBatch\(env,events/);
 assert.match(scanner,/total_cells:150/);
});
test("unsigned GRO retention keeps the seven-day progression window and prunes bounded expired rows",async()=>{
 const {db,env}=database();
 const oldNow=Date.parse("2026-11-01T00:00:00.000Z");
 const oldSignal={...signal,published_at:"2026-11-01T00:00:00.000Z",event_fingerprint:"c".repeat(64)};
 await issueUnsignedDailyNewsBatch(env,[oldSignal],{now:oldNow});
 assert.equal(await pruneUnsignedDailyNewsGros(env,oldNow),0);
 const pruneAt=Date.parse("2026-11-09T00:05:00.000Z");
 assert.equal(await pruneUnsignedDailyNewsGros(env,pruneAt),3);
 assert.equal(db.prepare("SELECT count(*) AS n FROM risk_stream_unsigned_news_gro").get().n,0);
});
