import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";

// Guard against reintroducing a global GROUP BY scan in the Hot50 20m tick.
// The general 195-country/corridor mode intentionally remains unchanged.
const src=readFileSync(new URL("../../workers/control-plane/src/risk-gap-enrichment.mjs",import.meta.url),"utf8");
const migration=readFileSync(new URL("../../workers/control-plane/migrations/0207_hot50_bounded_enrichment_reads.sql",import.meta.url),"utf8");
const hot50=JSON.stringify(["USA","IND"]);
const cutoff="2026-11-06T00:00:00.000Z";

test("Hot50 recent presence reads use the 50-country scope, not global GROUP BY",()=>{
 assert.match(src,/const hot50Ids=hot50\?JSON\.stringify\(/u);
 assert.match(src,/entity_type='COUNTRY' AND entity_id IN \(SELECT value FROM json_each\(\?\)\)/u);
 assert.match(src,/\.bind\(\.\.\.\(hot50\?\[hot50Ids,cutoff\]:\[cutoff\]\)\)/u);
 assert.match(src,/const recentSql=hot50\?/u);
 assert.match(src,/const observedSql=hot50\?/u);
});

test("new additive indexes support bounded country/date range scans and preserve quiet, stale and corridor semantics",()=>{
 const db=new DatabaseSync(":memory:");
 try{
  db.exec(`CREATE TABLE unverified_observations(observation_id TEXT PRIMARY KEY,entity_type TEXT,entity_id TEXT,category TEXT,discovered_at TEXT);
   CREATE TABLE risk_observations(entity_type TEXT,entity_id TEXT,category TEXT,created_at TEXT,evidence_status TEXT);`);
  db.exec(migration);
  db.exec(migration);
  db.exec(`INSERT INTO unverified_observations VALUES
   ('a','COUNTRY','USA','GEOPOLITICS','2026-11-06T02:00:00.000Z'),
   ('b','COUNTRY','IND','MACRO_FX','2026-11-06T01:00:00.000Z'),
   ('c','COUNTRY','BEL','GEOPOLITICS','2026-11-06T03:00:00.000Z'),
   ('d','CORRIDOR','USA','GEOPOLITICS','2026-11-06T02:00:00.000Z'),
   ('e','COUNTRY','USA','CRITICAL_MINERALS','2026-11-05T02:00:00.000Z');
   INSERT INTO risk_observations VALUES
   ('COUNTRY','USA','GEOPOLITICS','2026-11-06T02:00:00.000Z','VERIFIED_SIGNED_GRO'),
   ('COUNTRY','IND','MACRO_FX','2026-11-06T02:00:00.000Z','OBSERVED_UNVERIFIED'),
   ('COUNTRY','BEL','GEOPOLITICS','2026-11-06T02:00:00.000Z','VERIFIED_SIGNED_GRO'),
   ('COUNTRY','USA','CRITICAL_MINERALS','2026-11-06T02:00:00.000Z','REJECTED'),
   ('CORRIDOR','USA','GEOPOLITICS','2026-11-06T02:00:00.000Z','VERIFIED_SIGNED_GRO');`);
  const recent="SELECT entity_type,entity_id,category FROM unverified_observations WHERE entity_type='COUNTRY' AND entity_id IN (SELECT value FROM json_each(?)) AND discovered_at>=? GROUP BY entity_type,entity_id,category";
  const observed="SELECT entity_type,entity_id,category FROM risk_observations WHERE entity_type='COUNTRY' AND entity_id IN (SELECT value FROM json_each(?)) AND created_at>=? AND evidence_status IN ('VERIFIED_SIGNED_GRO','OBSERVED_UNVERIFIED') GROUP BY entity_type,entity_id,category";
  for(const [sql,indexName] of [[recent,"idx_unverified_hot50_country_discovered"],[observed,"idx_risk_obs_hot50_country_created"]]){
   const plan=db.prepare("EXPLAIN QUERY PLAN "+sql).all(hot50,cutoff).map(x=>x.detail).join("\n");
   assert.match(plan,new RegExp("USING (?:COVERING )?INDEX "+indexName));
   assert.doesNotMatch(plan,/SCAN (?:unverified_observations|risk_observations)\b/u);
   const values=db.prepare(sql).all(hot50,cutoff).map(x=>x.entity_id+"|"+x.category).sort();
   assert.deepEqual(values,["IND|MACRO_FX","USA|GEOPOLITICS"]);
  }
 }finally{db.close()}
});
