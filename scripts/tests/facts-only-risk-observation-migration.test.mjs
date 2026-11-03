import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";

const base=readFileSync("workers/control-plane/migrations/0108_unified_risk_categories.sql","utf8");
const migration=readFileSync("workers/control-plane/migrations/0112_facts_only_risk_observation_text_guard.sql","utf8");
const sha="a".repeat(64);
const row=(json,id=sha)=>[
 id,"COUNTRY","USA","MACRO_FX","2026-11-03",null,null,JSON.stringify(json),1,0,
 "OBSERVED_UNVERIFIED",null,"2026-11-03T10:00:00.000Z"];

test("D1 historical mutable text scrub preserves immutable snapshot SHA and observation identity",()=>{
 const db=new DatabaseSync(":memory:");
 try{
  db.exec(base);
  const insert=db.prepare("INSERT INTO risk_observations VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)");
  const original={schema:"geomacro.risk-observation.v1",
   headline:"Old republished publisher headline",
   article_body:"Publisher prose to remove",sources:[{id:"source-1",title_hash:sha}]};
  insert.run(...row(original));
  const baseline=JSON.stringify({schema:"geomacro.unified-risk-snapshot.v1"});
  db.prepare("INSERT INTO unified_risk_snapshots VALUES(?,?,?,?,?,?,?,?)")
   .run("COUNTRY","USA","2026-11-03",baseline,"HMAC_PROOF_UNCHANGED",
    sha,"2026-11-03T10:00:00.000Z",null);
  db.exec(migration);
  const saved=db.prepare("SELECT id,evidence_payload FROM risk_observations").get();
  assert.equal(saved.id,sha);
  const cleaned=JSON.parse(saved.evidence_payload);
  assert.equal(cleaned.headline,undefined);
  assert.equal(cleaned.article_body,undefined);
  assert.deepEqual(cleaned.sources,[{id:"source-1",title_hash:sha}]);
  assert.equal(db.prepare("SELECT content_sha256 FROM unified_risk_snapshots").get().content_sha256,sha);
  db.exec(migration); // repeated migration is idempotent
  assert.equal(db.prepare("SELECT evidence_payload FROM risk_observations").get().evidence_payload,
   saved.evidence_payload);
 }finally{db.close()}
});
test("D1 rejects nested copied article prose, oversized narrative and malformed JSON on new writes",()=>{
 const db=new DatabaseSync(":memory:");
 try{
  db.exec(base);db.exec(migration);
  const insert=db.prepare("INSERT INTO risk_observations VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)");
  for(const [i,unsafe] of [
   {sources:[{article_body:"copyright"}]},
   {analysis:{metadata:{source_headline:"borrowed"}}},
   {sources:[{notes:"N".repeat(251)}]},
  ].entries())assert.throws(()=>insert.run(...row(unsafe,"b".repeat(63)+i)),
   /RISK_OBSERVATION_FACTS_ONLY_REQUIRED/);
  const valid={schema:"geomacro.risk-observation.v1",sources:[],
   private_osint_original_page_verified:false,provenance:"METADATA_ONLY_NO_ORIGINAL_ARTICLE_CONTENT"};
  insert.run(...row(valid));
  assert.throws(()=>db.prepare("UPDATE risk_observations SET evidence_payload=? WHERE id=?")
   .run(JSON.stringify({sources:[{original_title:"borrowed"}]}),sha),
   /RISK_OBSERVATION_FACTS_ONLY_REQUIRED/);
 }finally{db.close()}
});
