import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../../workers/control-plane/migrations/0214_risk_stream_event_driven.sql",import.meta.url),"utf8");
test("0214 migration is valid native SQLite and creates indexed global stream and token budget",()=>{
 const db=new DatabaseSync(":memory:");
 db.exec("PRAGMA foreign_keys=ON");
 db.exec(sql);
 for(const table of ["risk_stream_sources","risk_stream_category_policy",
  "risk_stream_evidence","risk_stream_signed_gro",
  "risk_stream_delivery_outbox","risk_stream_internal_delivery_receipts",
  "risk_stream_b2_token_bucket"]){
  const row=db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name=?").get(table);
  assert.equal(row?.name,table);
 }
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM risk_stream_category_policy WHERE enabled=1").get().n,3);
 const cat=db.prepare("SELECT required_role_a,required_role_b FROM risk_stream_category_policy WHERE category='GEOPOLITICS'").get();
 assert.equal(cat.required_role_a,"GOVERNMENT_WIRE");
 assert.equal(cat.required_role_b,"INDEPENDENT_REGIONAL");
 db.prepare("INSERT INTO risk_stream_sources "+
  "(source_id,publisher_root_domain,parent_media_entity,source_role,reviewed_at) "+
  "VALUES ('agency','agency.example','media_parent','GOVERNMENT_WIRE',?)").run(new Date().toISOString());
 const row=db.prepare("SELECT enabled,commercial_rights_approved FROM risk_stream_sources WHERE source_id='agency'").get();
 assert.equal(row.enabled,0);assert.equal(row.commercial_rights_approved,0);
 const indexes=db.prepare("SELECT name FROM sqlite_schema WHERE type='index'").all().map(x=>x.name);
 for(const name of ["idx_risk_stream_corrob","idx_risk_stream_country_category",
  "idx_risk_stream_signed_current","idx_risk_stream_delivery_due"])
  assert(indexes.includes(name),name);
 db.close();
});
