import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {generateKeyPairSync,webcrypto} from "node:crypto";
import {makeDailyNewsGro,issueDailyNewsBatch,issueDailyNewsGro,readDailyNewsGros,validateDailyNewsSignal}
 from "../../workers/control-plane/src/risk-stream-news-gro.mjs";
globalThis.crypto??=webcrypto;
const NOW=Date.parse("2026-11-14T12:00:00.000Z");
const fp="a".repeat(64);
const src={country_iso3:"IND",category:"GEOPOLITICS",event_fingerprint:fp,
 published_at:"2026-11-14T11:50:00Z",original_verified:false,
 derived:{what:"Unverified SANCTIONS event signal reported for IND"}};
const pem=(k,type)=>k.export({format:"der",type}).toString("base64");
function database(){
 const db=new DatabaseSync(":memory:");
 db.exec(readFileSync("workers/control-plane/migrations/0219_hot50_daily_news_signed_gro.sql","utf8"));
 const {privateKey,publicKey}=generateKeyPairSync("ed25519");
 const env={DB:{prepare(sql){const stmt=db.prepare(sql);return {
  bind(...values){return {first:async()=>stmt.get(...values)??null,
   run:async()=>stmt.run(...values),
   all:async()=>({results:stmt.all(...values)})}}
 }}},RISK_STREAM_ACTIVE:"1",STREAM_INGESTION_ENABLED:"true",
 RISK_STREAM_HOT50_AUTONOMOUS_ENABLED:"1",
 RISK_GATE_DECISION_ED25519_KEY_ID:"test-news-key-v1",
 RISK_GATE_DECISION_ED25519_PRIVATE_KEY_PKCS8_B64:pem(privateKey,"pkcs8"),
 RISK_GATE_DECISION_ED25519_PUBLIC_KEY_SPKI_B64:pem(publicKey,"spki")};
 return {db,env,publicKey};
}
test("0219 immutable D1 news-gro schema never permits commercial authorization",()=>{
 const {db}=database();
 const t=db.prepare("SELECT sql FROM sqlite_schema WHERE name='risk_stream_daily_news_gro'").get();
 assert.match(t.sql,/CHECK\(commercial_sale_authorized=0\)/u);
 assert.match(t.sql,/CHECK\(raw_source_disclosed=0\)/u);
});
test("only current UTC news, Hot50 countries and three categories",()=>{
 assert.throws(()=>validateDailyNewsSignal({...src,published_at:"2026-11-13T23:59:59Z"},NOW),/NOT_TODAYS_NEWS/u);
 assert.throws(()=>validateDailyNewsSignal({...src,country_iso3:"ZZZ"},NOW),/COUNTRY_CATEGORY/u);
 assert.throws(()=>validateDailyNewsSignal({...src,category:"UNKNOWN"},NOW),/COUNTRY_CATEGORY/u);
 assert.throws(()=>validateDailyNewsSignal({...src,corroborated_signed_original:true},NOW),/CORROBORATION_WITHOUT_ORIGINAL/u);
});
test("each daily news signal creates three truly signed, readback-verified, no-funds GROs",async()=>{
 const {db,env,publicKey}=database();
 const r=await issueDailyNewsBatch(env,[src],{now:NOW});
 assert.equal(r.signed,3);
 assert.equal(r.commercial_deliveries_performed,0);
 const rows=db.prepare("SELECT * FROM risk_stream_daily_news_gro").all();
 assert.equal(rows.length,3);
 for(const row of rows){
  const p=JSON.parse(row.payload_json);
  assert.equal(p.country_iso3,"IND");
  assert.equal(p.evidence_status,"UNVERIFIED_SIGNAL");
  assert.equal(p.billable,false);
  assert.equal(p.raw_source_disclosed,false);
  assert.equal(p.assessment.previous_day_state_used,false);
  assert.equal(p.day_utc,"2026-11-14");
  assert.equal(row.commercial_sale_authorized,0);
  assert.equal(await webcrypto.subtle.verify("Ed25519",
   await webcrypto.subtle.importKey("spki",publicKey.export({format:"der",type:"spki"}),
    {name:"Ed25519"},false,["verify"]),
   Buffer.from(row.signature_b64,"base64"),new TextEncoder().encode(row.payload_json)),true);
  assert.doesNotMatch(row.payload_json,/http|source_url|publisher_root_domain|original_title|raw_payload/iu);
 }
 const again=await issueDailyNewsBatch(env,[src],{now:NOW+120000});
 assert.equal(again.signed,0);
 assert.equal(again.idempotent,3);
 assert.equal(db.prepare("SELECT count(*) AS n FROM risk_stream_daily_news_gro").get().n,3);
});
test("original proof and verified corroboration are separately signable upgrades",async()=>{
 const {db,env}=database();
 await issueDailyNewsGro(env,{...src,original_verified:true},"standard",{now:NOW});
 await issueDailyNewsGro(env,{...src,original_verified:true,
  corroborated_signed_original:true},"standard",{now:NOW});
 const rows=db.prepare("SELECT evidence_status,payload_json FROM risk_stream_daily_news_gro").all();
 assert.deepEqual(rows.map(r=>r.evidence_status).sort(),[
 "CORROBORATED_INTERNAL_GRO","DUAL_ATTESTED_ORIGINAL"]);
 assert.equal(JSON.parse(rows.find(r=>r.evidence_status==="CORROBORATED_INTERNAL_GRO").payload_json)
  .tier_status,"INTERNAL_CORROBORATED_REVIEW_REQUIRED");
});
test("immutable retry rejects a D1 row signed under an unexpected key id",async()=>{
 const {db,env}=database();
 await issueDailyNewsGro(env,src,"standard",{now:NOW});
 db.prepare("UPDATE risk_stream_daily_news_gro SET signing_key_id='other-key' ").run();
 await assert.rejects(issueDailyNewsGro(env,src,"standard",{now:NOW}),
  /EXISTING_SIGNATURE_INVALID/u);
});
test("feature-off never issues, signer missing fails closed",async()=>{
 const {env}=database();
 assert.equal((await issueDailyNewsBatch({...env,RISK_STREAM_HOT50_AUTONOMOUS_ENABLED:"0"},
  [src],{now:NOW})).status,"NEWS_GRO_AUTOMATION_HELD");
 await assert.rejects(issueDailyNewsGro({...env,RISK_GATE_DECISION_ED25519_PRIVATE_KEY_PKCS8_B64:""},
  src,"basic_focused",{now:NOW}),/SIGNER_INVALID/u);
});

test("owner-only retrieval verifies pinned Ed25519 signature and excludes raw content",async()=>{
 const {env}=database();
 await issueDailyNewsBatch(env,[src],{now:NOW});
 const request=new Request("https://internal.example/v1/internal/risk-stream/daily-news-gros?"+
  "country_iso3=IND&category=GEOPOLITICS&limit=12");
 const reply=await readDailyNewsGros(request,env,NOW);
 assert.equal(reply.status,200);
 assert.equal(reply.headers.get("cache-control"),"private, no-store");
 const body=await reply.json();
 assert.equal(body.signed_count,3);
 assert.equal(body.signature_readback_verified,true);
 assert.equal(body.commercial_delivery,false);
 assert.ok(body.items.every(x=>x.payload.billable===false&&
  x.signature_algorithm==="Ed25519"));
 assert.doesNotMatch(JSON.stringify(body.items),/source_url|publisher_root_domain|original_title|raw_payload/iu);
 const invalid=await readDailyNewsGros(new Request(
  "https://internal.example/v1/internal/risk-stream/daily-news-gros?country_iso3=ZZZ&category=MACRO_FX"
 ),env,NOW);
 assert.notEqual(invalid.status,200);
});
