import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {registerUntrustedShadowIndexSources}
 from "../../workers/risk-stream-shadow/src/untrusted-index-source-registry.mjs";
const migration=readFileSync(new URL("../../workers/control-plane/migrations/0214_risk_stream_event_driven.sql",import.meta.url),"utf8");
function openDb(){
 const raw=new DatabaseSync(":memory:");
 raw.exec("PRAGMA foreign_keys=ON;");
 raw.exec(migration);
 const db={
  prepare(sql){
   let args=[];
   return {
    bind(...values){args=values;return this},
    async run(){return raw.prepare(sql).run(...args)},
    async all(){return {results:raw.prepare(sql).all(...args)}}
   };
  },
  async batch(statements){
   raw.exec("BEGIN IMMEDIATE");
   try{
    const out=[];
    for(const s of statements)out.push(await s.run());
    raw.exec("COMMIT");
    return out;
   }catch(e){raw.exec("ROLLBACK");throw e}
  }
 };
 return {raw,db};
}
const candidate=(id="rss_bbc_source_1")=>({
 schema:"geomacro.risk-stream-candidate.v1",kind:"INDEX_ONLY",
 source_id:id,publisher_root_domain:"www.bbc.com",
 parent_media_entity:"rss_bbc_source_1",source_role:"INDEPENDENT_REGIONAL"
});
test("SQLite migration 0214 FK rejects missing source, accepts index-only as disabled/unapproved",async()=>{
 const {raw,db}=openDb();
 raw.exec("CREATE TABLE shadow_fk_probe (source_id TEXT REFERENCES risk_stream_sources(source_id))");
 assert.throws(()=>raw.prepare("INSERT INTO shadow_fk_probe(source_id) VALUES (?)").run("rss_bbc_source_1"),
  /FOREIGN KEY constraint failed/iu);
 const result=await registerUntrustedShadowIndexSources(db,[candidate()]);
 assert.equal(result.untrusted_source_registry_count,1);
 assert.equal(result.rights_approved_by_registration,false);
 raw.prepare("INSERT INTO shadow_fk_probe(source_id) VALUES (?)").run("rss_bbc_source_1");
 const trust=raw.prepare("SELECT enabled,commercial_rights_approved FROM risk_stream_sources WHERE source_id=?")
  .get("rss_bbc_source_1");
 assert.equal(trust.enabled,0);
 assert.equal(trust.commercial_rights_approved,0);
 await registerUntrustedShadowIndexSources(db,[candidate()]);
 assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM risk_stream_sources").get().n,1);
 raw.close();
});
test("index-only source ID reused for different publisher fails rather than corrupting trust",async()=>{
 const {raw,db}=openDb();
 await registerUntrustedShadowIndexSources(db,[candidate()]);
 await assert.rejects(registerUntrustedShadowIndexSources(db,[{
  ...candidate(),publisher_root_domain:"example.org"}]),/SHADOW_INDEX_SOURCE_READBACK_MISMATCH/);
 raw.close();
});
test("verified original does not create new source approval or keys",async()=>{
 const {raw,db}=openDb();
 const result=await registerUntrustedShadowIndexSources(db,[{
  ...candidate(),kind:"VERIFIED_ORIGINAL"}]);
 assert.equal(result.untrusted_source_registry_count,0);
 assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM risk_stream_sources").get().n,0);
 raw.close();
});
