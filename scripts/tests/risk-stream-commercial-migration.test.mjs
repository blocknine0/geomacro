import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
const root="../../workers/control-plane/migrations/";
const base=readFileSync(new URL(root+"0214_risk_stream_event_driven.sql",import.meta.url),"utf8");
const additive=readFileSync(new URL(root+"0216_risk_stream_commercial_derived_outbox.sql",import.meta.url),"utf8");
const pull=readFileSync(new URL(root+"0220_predge_paid_pull_licenses.sql",import.meta.url),"utf8");
test("0216 and 0220 add webhook and Predge pull delivery stores independently",()=>{
 const db=new DatabaseSync(":memory:");
 db.exec("PRAGMA foreign_keys=ON");
 db.exec(base);
 db.exec(additive);
 db.exec(pull);
 const now=new Date().toISOString(),h="a".repeat(64);
 for(const name of ["risk_stream_commercial_subscriptions",
  "risk_stream_commercial_outbox","risk_stream_commercial_delivery_receipts",
  "risk_stream_commercial_risk_chain","risk_stream_predge_pull_licenses"]){
  assert.equal(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name=?")
   .get(name)?.name,name);
 }
 for(const name of ["idx_risk_stream_commercial_due","idx_risk_stream_commercial_history_7d",
  "idx_predge_pull_license_lookup"]){
  assert(db.prepare("SELECT name FROM sqlite_schema WHERE type='index' AND name=?")
   .get(name),name);
 }
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM risk_stream_commercial_outbox").get().n,0);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM risk_stream_predge_pull_licenses").get().n,0);
 assert.throws(()=>db.prepare("INSERT INTO risk_stream_predge_pull_licenses "+
  "(license_id,client_id,gro_id,country_iso3,category,license_envelope_json,"+
  "license_payload_sha256,release_receipt_sha256,created_at,expires_at) "+
  "VALUES (?,?,?,?,?,?,?,?,?,?)").run("a".repeat(64),"other-client","b".repeat(64),
  "USA","GEOPOLITICS","{}","c".repeat(64),"d".repeat(64),now,now),/constraint/iu);
 db.prepare("INSERT INTO risk_stream_commercial_subscriptions "+
  "(client_id,endpoint_url,approved_host,entitlement_expires_at,approved_at,release_receipt_sha256) "+
  "VALUES (?,?,?,?,?,?)").run("client_research_01","https://example.org/hooks","example.org",now,now,h);
 const x=db.prepare("SELECT enabled FROM risk_stream_commercial_subscriptions "+
  "WHERE client_id='client_research_01'").get();
 assert.equal(x.enabled,0,"new customers must start inactive");
 assert.throws(()=>db.prepare("INSERT INTO risk_stream_commercial_outbox "+
  "(job_id,client_id,gro_id,license_envelope_json,license_payload_sha256,"+
  "release_receipt_sha256,next_attempt_at,created_at) VALUES (?,?,?,?,?,?,?,?)")
   .run(h,"client_research_01","b".repeat(64),"{}",h,h,now,now),/FOREIGN KEY|constraint/iu);
 // Never mutate 0214 source rights defaults or the existing original signing schema.
 const roles=db.prepare("SELECT required_role_a,required_role_b FROM "+
  "risk_stream_category_policy WHERE category='MACRO_FX'").get();
 assert.equal(roles.required_role_a,"OFFICIAL_STATISTICS");
 assert.equal(roles.required_role_b,"MARKET_PRICE");
 assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys,1);
 db.close();
});
