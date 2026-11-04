import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {buildP1SourceRegistration,renderP1SourceRegistrationSQL}
 from "../ops/seed-p1-1077-source-registry.mjs";
test("real working manifests produce exactly 1069 research OSINT and eight GOV.UK atom source/category lanes",()=>{
 const rows=buildP1SourceRegistration();
 assert.equal(rows.length,1077);
 assert.equal(new Set(rows.map(x=>x.source_id)).size,1077);
 assert.equal(new Set(rows.map(x=>x.canonical_endpoint)).size,377);
 assert.equal(rows.filter(x=>x.parser_type==="ATOM").length,11);
 assert.equal(rows.filter(x=>x.rights_tier!=="RESEARCH_ONLY").length,0);
 assert.ok(rows.every(x=>["GEOPOLITICS","MACRO_FX","CRITICAL_MINERALS"].includes(x.intended_category)));
});
test("1077 source lanes idempotently populate canonical D1 with zero independent rights promotion",()=>{
 const db=new DatabaseSync(":memory:");
 try{
  for(const name of ["0113_p0a_source_registry.sql",
   "0119_p1_source_fanout_585.sql"])
   db.exec(readFileSync(new URL("../../workers/control-plane/migrations/"+name,import.meta.url),"utf8"));
  const rows=buildP1SourceRegistration();
  const statements=renderP1SourceRegistrationSQL(rows);
  assert.doesNotMatch(statements,/COMMERCIAL_APPROVED|PENDING_AUDIT/u);
  db.exec(statements);
  const first=db.prepare("SELECT COUNT(*) AS n FROM p1_source_seed_manifest").get().n;
  assert.equal(first,1077);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM source_registry").get().n,1077);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM source_registry WHERE enabled=1").get().n,1077);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM source_registry WHERE rights_tier!='RESEARCH_ONLY'").get().n,0);
  db.exec(statements);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM p1_source_seed_manifest").get().n,1077);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM source_registry").get().n,1077);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM p1_country_category_cells").get().n,585);
  assert.ok(db.prepare("SELECT COUNT(*) AS n FROM p1_source_to_cell").get().n>0);
 }finally{db.close()}
});
