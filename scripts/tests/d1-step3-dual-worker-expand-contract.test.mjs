import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {createHash,createHmac} from "node:crypto";
import {readPhase2hReferenceOrLegacy}
 from "../../workers/control-plane/src/phase2h-raw-object-refs.mjs";
import {pointerEnvelope} from "../lib/d1-step3-crypto-proof.mjs";

const SHA=x=>createHash("sha256").update(x).digest("hex");
const NOW="2026-11-08T10:00:00.000Z";
const ID_A="a".repeat(64), ID_B="b".repeat(64),ID_C="c".repeat(64);
const KEY="f".repeat(64);
const record=id=>({
 record_id:id,category:"macro",raw_sha256:SHA(id),
 ingested_at:NOW,original:{original_published_at:NOW},
 original_url:"https://example.org/nonproduction",
 fixture_padding:"Offline simulation only; no genuine archived original. ".repeat(8)
});
const adapt=db=>({prepare:sql=>({
 bind(...args){const q=db.prepare(sql);return {
  first:async()=>q.get(...args)??null,
  all:async()=>({results:q.all(...args)}),
  run:async()=>q.run(...args)
 }}
})});
test("offline SQLite expand/contract: real staged 0213 DDL leaves legacy reads/writes and new R2 hydration usable",async()=>{
 const db=new DatabaseSync(":memory:");
 try{
  db.exec("CREATE TABLE phase2h_private_raw_news "+
   "(record_id TEXT PRIMARY KEY,raw_sha256 TEXT NOT NULL,"+
   "raw_json TEXT NOT NULL,first_ingested_at TEXT NOT NULL)");
  const insert=db.prepare("INSERT INTO phase2h_private_raw_news "+
    "(record_id,raw_sha256,raw_json,first_ingested_at) VALUES(?,?,?,?)");
  const a=record(ID_A),rawA=JSON.stringify(a);
  insert.run(a.record_id,a.raw_sha256,rawA,a.ingested_at);
  const before=db.prepare("SELECT raw_json FROM phase2h_private_raw_news WHERE record_id=?")
    .get(ID_A);
  assert.equal(before.raw_json,rawA);
  const ddl=readFileSync(
   "workers/control-plane/staged-migrations/0213_phase2h_raw_ref_only_v1.sql","utf8");
  db.exec(ddl);
  assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check,"ok");
  assert.equal(db.prepare("SELECT raw_json FROM phase2h_private_raw_news WHERE record_id=?")
    .get(ID_A).raw_json,rawA);
  // The legacy source writer remains operational AFTER the expand-only DDL.
  const c=record(ID_C),rawC=JSON.stringify(c);
  insert.run(c.record_id,c.raw_sha256,rawC,c.ingested_at);
  assert.equal(db.prepare("SELECT raw_json FROM phase2h_private_raw_news WHERE record_id=?")
    .get(ID_C).raw_json,rawC);
  const b=record(ID_B),rawB=JSON.stringify(b),bundle=JSON.stringify({
   schema:"geomacro.phase2h.r2-private-reference-bundle.v1",
   records:[rawB]
  });
  const bundleBytes=Buffer.from(bundle),objectHash=SHA(bundleBytes);
  const pointer={
   record_id:ID_B,category:b.category,original_published_at:NOW,
   first_ingested_at:NOW,raw_sha256:b.raw_sha256,
   object_sha256:objectHash,
   object_key:"geomacro/private/phase2h/ref-only/v1/"+objectHash+".json",
   bundle_bytes:bundleBytes.length,record_sha256:SHA(rawB),
   record_bytes:Buffer.byteLength(rawB),bundle_index:0,signed_at:NOW,
   pointer_hmac_sha256:"0".repeat(64),risk_country_iso3:"USA",
   storage_backend:"private_r2"
  };
  pointer.pointer_hmac_sha256=createHmac("sha256",Buffer.from(KEY,"hex"))
    .update(pointerEnvelope(pointer)).digest("hex");
  const fields=Object.keys(pointer);
  db.prepare("INSERT INTO phase2h_raw_object_refs_v1("+
    fields.join(",")+") VALUES("+fields.map(()=>"?").join(",")+")")
   .run(...fields.map(k=>pointer[k]));
  const env={DB:adapt(db),PHASE2H_R2_REFERENCE_HMAC_KEY:KEY,
   PHASE2H_PRIVATE_R2:{get:async key=>key===pointer.object_key?{
    size:bundleBytes.length,
    arrayBuffer:async()=>Uint8Array.from(bundleBytes).buffer
   }:null}};
  const validation=async r=>JSON.stringify(r); // OFFLINE_ONLY fake validation
  const readOld=await readPhase2hReferenceOrLegacy(env,ID_A,validation,Date.parse(NOW));
  assert.equal(readOld.legacy_fallback,true);
  assert.deepEqual(readOld.record,a);
  const readNew=await readPhase2hReferenceOrLegacy(env,ID_B,validation,Date.parse(NOW));
  assert.equal(readNew.legacy_fallback,false);
  assert.deepEqual(readNew.record,b);
  // Storage schema does not prevent legacy Worker from continuing to write.
  assert.equal(db.prepare("SELECT raw_json FROM phase2h_private_raw_news WHERE record_id=?")
   .get(ID_C).raw_json,rawC);
  // Tamper is rejected; new reader never falls back to unverified D1.
  db.prepare("UPDATE phase2h_raw_object_refs_v1 SET pointer_hmac_sha256=? WHERE record_id=?")
   .run("0".repeat(64),ID_B);
  await assert.rejects(
   readPhase2hReferenceOrLegacy(env,ID_B,validation,Date.parse(NOW)),
   /PHASE2H_REF_POINTER_SIGNATURE_MISMATCH/u);
 }finally{db.close()}
});
test("offline contract: legacy 100% rollback requires ref-only production write switch remain disabled during coexistence",()=>{
 const worker=readFileSync("workers/control-plane/src/phase2h-raw-object-refs.mjs","utf8");
 assert.match(worker,/env\?\.GEOMACRO_PHASE2H_REF_ONLY_V1!=="1"/u);
 assert.match(worker,/readPhase2hReferenceOrLegacy/u);
 const ddl=readFileSync("workers/control-plane/staged-migrations/0213_phase2h_raw_ref_only_v1.sql","utf8");
 assert.doesNotMatch(ddl,/DROP\s+TABLE|ALTER\s+TABLE\s+phase2h_private_raw_news/iu);
});
