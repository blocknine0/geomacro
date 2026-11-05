import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {
 P0A_ITEM_BUNDLE_SIZE,P0A_DUPLICATE_REFRESH_MS,
 p0aBuildBundledItemStatements,P0A_SOURCE_ITEM_BUNDLE_SQL
} from "../../workers/control-plane/src/p0a-source-item-bundled-write.mjs";
const ONE_HOUR=3600000;
const START=Date.parse("2026-11-05T10:00:00.000Z");
function fixture(){
 const db=new DatabaseSync(":memory:");
 db.exec(readFileSync(new URL(
  "../../workers/control-plane/migrations/0113_p0a_source_registry.sql",
  import.meta.url),"utf8"));
 db.exec("ALTER TABLE p0a_normalized_source_items ADD COLUMN observed_at TEXT;");
 db.exec("ALTER TABLE p0a_normalized_source_items ADD COLUMN clock_provenance TEXT;");
 db.exec("ALTER TABLE p0a_normalized_source_items ADD COLUMN content_sha256 TEXT;");
 const adapter={prepare:sql=>({bind:(...args)=>({sql,args})})};
 function apply(statements){
  let changes=0;
  db.exec("BEGIN");
  try{
   for(const stmt of statements)changes+=db.prepare(stmt.sql).run(...stmt.args).changes;
   db.exec("COMMIT");
   return changes;
  }catch(e){db.exec("ROLLBACK");throw e;}
 }
 return {db,adapter,apply};
}
function rows(n,now,headline="Official news release"){
 const at=new Date(now).toISOString();
 return Array.from({length:n},(_,i)=>[
  "id-"+String(i).padStart(4,"0"),"source_100","GEOPOLITICS","GLOBAL",
  "RESEARCH_ONLY",headline,"https://example.org/official/"+i,
  "item-"+i,"2026-11-05T09:00:00.000Z",at,at,at,
  "SOURCE_NATIVE","a".repeat(64)
 ]);
}
test("25 source observations share one SQL; 100 items use four bounded statements",()=>{
 const f=fixture();
 try{
  assert.equal(P0A_ITEM_BUNDLE_SIZE,25);
  assert.equal(P0A_DUPLICATE_REFRESH_MS,6*ONE_HOUR);
  const statements=p0aBuildBundledItemStatements(f.adapter,rows(100,START),START);
  assert.equal(statements.length,4);
  assert.ok(statements.every(x=>x.sql===P0A_SOURCE_ITEM_BUNDLE_SQL));
  assert.ok(statements.every(x=>x.args.length===2));
  assert.ok(statements.every(x=>JSON.parse(x.args[0]).length===25));
  assert.equal(f.apply(statements),100);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM p0a_normalized_source_items").get().n,100);
 }finally{f.db.close();}
});
test("unchanged 100 records create zero physical row changes on 20-minute repoll",()=>{
 const f=fixture();
 try{
  assert.equal(f.apply(p0aBuildBundledItemStatements(f.adapter,rows(100,START),START)),100);
  const first=f.db.prepare("SELECT first_seen_at,last_seen_at,native_published_at FROM p0a_normalized_source_items WHERE item_id='id-0000'").get();
  assert.equal(f.apply(p0aBuildBundledItemStatements(f.adapter,rows(100,START+20*60000),START+20*60000)),0);
  const again=f.db.prepare("SELECT first_seen_at,last_seen_at,native_published_at FROM p0a_normalized_source_items WHERE item_id='id-0000'").get();
  assert.deepEqual(again,first);
  const later=START+P0A_DUPLICATE_REFRESH_MS+60000;
  assert.equal(f.apply(p0aBuildBundledItemStatements(f.adapter,rows(100,later),later)),100);
  const refreshed=f.db.prepare("SELECT first_seen_at,last_seen_at,native_published_at FROM p0a_normalized_source_items WHERE item_id='id-0000'").get();
  assert.equal(refreshed.first_seen_at,first.first_seen_at);
  assert.equal(refreshed.native_published_at,first.native_published_at);
  assert.equal(refreshed.last_seen_at,new Date(later).toISOString());
 }finally{f.db.close();}
});
test("25-item bounds and byte limit fail closed without attempting SQL",()=>{
 const f=fixture();
 try{
  assert.throws(()=>p0aBuildBundledItemStatements(f.adapter,[],START),/P0A_ITEM_BUNDLE_INVALID/);
  assert.throws(()=>p0aBuildBundledItemStatements(f.adapter,rows(101,START),START),/P0A_ITEM_BUNDLE_INVALID/);
  assert.throws(()=>p0aBuildBundledItemStatements(f.adapter,[[1,2]],START),/P0A_ITEM_BUNDLE_INVALID/);
  assert.throws(()=>p0aBuildBundledItemStatements(f.adapter,rows(25,START,"X".repeat(12000)),START),/P0A_ITEM_BUNDLE_BYTES_EXCEEDED/);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM p0a_normalized_source_items").get().n,0);
 }finally{f.db.close();}
});
