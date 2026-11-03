import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {riskCountryFromOriginalTitle,readIndexedRiskCountryOriginals,
 backfillRiskCountryIndex,RISK_COUNTRY_BACKFILL_LIMIT,RISK_UNATTRIBUTED_ISO3}
 from "../../workers/control-plane/src/phase2h-risk-country-index.mjs";

const NOW=Date.parse("2026-11-03T10:00:00.000Z");
const iso=n=>new Date(n).toISOString();
function fixture(){
 const sqlite=new DatabaseSync(":memory:");
 for(const file of ["0035_phase2h_private_raw_news.sql","0111_phase2h_risk_country_materialization.sql"]){
  sqlite.exec(readFileSync(new URL("../../workers/control-plane/migrations/"+file,import.meta.url),"utf8"));
 }
 const env={DB:{prepare(sql){
  const statement=sqlite.prepare(sql);
  return {bind(...args){return {
   all:async()=>({results:statement.all(...args)}),
   run:async()=>{const info=statement.run(...args);return {success:true,meta:{changes:info.changes}}}
  }}};
 }}};
 return {sqlite,env};
}
function insert(db,number,{title="France manufacturing release",category="macro",
 at=iso(NOW-60_000),country="FRA",ingested=iso(NOW-40_000),bad=false}={}){
 const id=number.toString(16).padStart(64,"0");
 const rawSha=(number+50000).toString(16).padStart(64,"0");
 const raw={record_id:id,category,raw_sha256:rawSha,
  original:{original_title:title,original_published_at:at},
  _padding:"source-fixture".repeat(40)};
 db.prepare("INSERT INTO phase2h_private_raw_news(record_id,category,original_published_at,first_ingested_at,raw_sha256,raw_json,risk_country_iso3) VALUES(?,?,?,?,?,?,?)")
  .run(id,category,at,ingested,rawSha,bad?"not-json".repeat(40):JSON.stringify(raw),country);
 return id;
}

test("same 195-country resolver indexes original headline, never source host",()=>{
 assert.equal(riskCountryFromOriginalTitle("China announces new domestic monetary policy"),"CHN");
 assert.equal(riskCountryFromOriginalTitle("India announces new manufacturing measures"),"IND");
 assert.equal(riskCountryFromOriginalTitle("Worldwide headline with no national attribution"),RISK_UNATTRIBUTED_ISO3);
 assert.equal(RISK_COUNTRY_BACKFILL_LIMIT,40);
});

test("real D1 SQLite composite index finds China even after 70 newer unrelated global headlines",async()=>{
 const {sqlite,env}=fixture();
 const older=insert(sqlite,1,{title:"China announces domestic production report",country:"CHN",at:iso(NOW-5*60_000)});
 for(let i=2;i<=71;i++)insert(sqlite,i,{at:iso(NOW-i*1000),country:"FRA"});
 const plan=sqlite.prepare("EXPLAIN QUERY PLAN SELECT record_id FROM phase2h_private_raw_news INDEXED BY idx_phase2h_risk_country_category_clock WHERE risk_country_iso3=? AND category=? AND original_published_at>=? AND original_published_at<=? ORDER BY original_published_at DESC,record_id DESC LIMIT 40")
  .all("CHN","macro",iso(NOW-60*60_000),iso(NOW));
 assert.ok(plan.some(x=>String(x.detail).includes("idx_phase2h_risk_country_category_clock")));
 const found=await readIndexedRiskCountryOriginals(env,{countryId:"CHN",category:"macro",since:iso(NOW-60*60_000),until:iso(NOW)});
 assert.deepEqual(found.map(x=>x.record_id),[older],"country-before-LIMIT must retain the true older original");
 await assert.rejects(()=>readIndexedRiskCountryOriginals(env,{countryId:"ZZZ",category:"macro",since:iso(NOW-60*60_000),until:iso(NOW)}),/INVALID_TARGET/);
 sqlite.close();
});

test("bounded backfill indexes only real recent originals and verifies all row receipts",async()=>{
 const {sqlite,env}=fixture();
 const ind=insert(sqlite,88,{title:"India announces domestic mining review",country:null});
 const unknown=insert(sqlite,89,{title:"Regional regulatory briefing from a multilateral body",country:null});
 for(let i=100;i<156;i++)insert(sqlite,i,{title:"France announces local fiscal measures",country:null});
 const first=await backfillRiskCountryIndex(env,{now:NOW});
 assert.equal(first.ok,true);
 assert.equal(first.indexed,40);
 assert.equal(first.country_index_receipts_verified,true);
 const second=await backfillRiskCountryIndex(env,{now:NOW});
 assert.equal(second.ok,true);
 assert.equal(second.indexed,18);
 const third=await backfillRiskCountryIndex(env,{now:NOW});
 assert.equal(third.ok,true);
 assert.equal(third.indexed,0);
 assert.equal(sqlite.prepare("SELECT risk_country_iso3 country FROM phase2h_private_raw_news WHERE record_id=?").get(ind).country,"IND");
 assert.equal(sqlite.prepare("SELECT risk_country_iso3 country FROM phase2h_private_raw_news WHERE record_id=?").get(unknown).country,RISK_UNATTRIBUTED_ISO3);
 assert.equal(sqlite.prepare("SELECT COUNT(*) c FROM phase2h_private_raw_news WHERE risk_country_iso3 IS NULL").get().c,0);
 sqlite.close();
});

test("corrupt existing raw identity fails closed and does not produce country evidence",async()=>{
 const {sqlite,env}=fixture();
 const id=insert(sqlite,257,{country:null,bad:true});
 const result=await backfillRiskCountryIndex(env,{now:NOW});
 assert.equal(result.ok,false);
 assert.equal(result.error,"RISK_COUNTRY_BACKFILL_CORRUPT_ORIGINAL");
 assert.equal(sqlite.prepare("SELECT risk_country_iso3 FROM phase2h_private_raw_news WHERE record_id=?").get(id).risk_country_iso3,null);
 sqlite.close();
});

test("risk source writer and unified generator both use exact indexed title attribution",()=>{
 const writer=readFileSync(new URL("../../workers/control-plane/src/phase2h-private-raw-news.mjs",import.meta.url),"utf8");
 const gate=readFileSync(new URL("../../workers/control-plane/src/unified-risk-gate.mjs",import.meta.url),"utf8");
 const worker=readFileSync(new URL("../../workers/control-plane/src/index.mjs",import.meta.url),"utf8");
 assert.match(writer,/riskCountryFromOriginalTitle\(row\.original\.original_title\)/);
 assert.match(writer,/raw_sha256,raw_json,risk_country_iso3/);
 assert.match(gate,/readIndexedRiskCountryOriginals\(env/);
 assert.match(gate,/ORDER BY generated_at LIMIT 12/);
 assert.match(worker,/utc\.getUTCMinutes\(\)%5===0/);
 assert.match(worker,/utc\.getUTCMinutes\(\)%2===1/);
});
