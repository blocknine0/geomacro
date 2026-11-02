import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {countPrivateOsintCountryEvidence,
 PRIVATE_OSINT_RISK_EVIDENCE_LANE,PRIVATE_OSINT_RISK_STATUS}
 from "../../workers/control-plane/src/unified-risk-private-osint-bridge.mjs";
import {generateUnifiedSnapshot}
 from "../../workers/control-plane/src/unified-risk-gate.mjs";

const NOW=Date.parse("2026-11-03T07:00:00.000Z"),AT=new Date(NOW-60_000).toISOString();
const H="a".repeat(64),I="b".repeat(64);
function seededDb(){
 const db=new DatabaseSync(":memory:");
 db.exec(readFileSync(new URL("../../workers/control-plane/migrations/0028_private_osint_15m_durable.sql",import.meta.url),"utf8"));
 db.exec(readFileSync(new URL("../../workers/control-plane/migrations/0110_unified_private_osint_evidence_index.sql",import.meta.url),"utf8"));
 const insert=db.prepare("INSERT INTO private_osint_news_25h"+
  "(item_id,category,country_iso3,native_feed_published_at,projection_json,first_seen_at,last_seen_at,verification_status)"+
  " VALUES (?,?,?,?,?,?,?,?)");
 const put=(id,category,country,when=AT,verification=PRIVATE_OSINT_RISK_STATUS)=>
  insert.run(id,category,country,when,"{"+'"research_only":"'+"x".repeat(410)+'"}',AT,AT,verification);
 const env={DB:{prepare(sql){const statement=db.prepare(sql);
  return {bind(...values){return {all:async()=>({results:statement.all(...values)})}}}
 }}};
 return {db,put,env};
}

test("0110 enables indexed bounded country/category lookups without extra raw/news storage",()=>{
 const {db}=seededDb();
 const plan=db.prepare("EXPLAIN QUERY PLAN SELECT item_id,native_feed_published_at,verification_status "+
 "FROM private_osint_news_25h WHERE country_iso3=? AND category=? "+
 "AND native_feed_published_at>=? AND native_feed_published_at<=? "+
 "ORDER BY native_feed_published_at DESC,item_id DESC LIMIT 21")
 .all("BGD","geopolitics",new Date(NOW-86_400_000).toISOString(),new Date(NOW).toISOString());
 assert.ok(plan.some(p=>String(p.detail).includes("idx_private_osint_unified_country_category_clock")));
 db.close();
});

test("three categories and country are exact, stale/future and malformed statuses ignored",async()=>{
 const {db,put,env}=seededDb();
 put(H,"geopolitics","BGD");
 put(I,"macro","BGD");
 put("c".repeat(64),"rare_earth","BGD");
 put("d".repeat(64),"geopolitics","IND");
 put("e".repeat(64),"geopolitics","BGD",new Date(NOW-86_400_001).toISOString());
 put("f".repeat(64),"geopolitics","BGD",new Date(NOW+1_000).toISOString());
 const geo=await countPrivateOsintCountryEvidence(env,{countryId:"BGD",category:"GEOPOLITICS",now:NOW});
 const macro=await countPrivateOsintCountryEvidence(env,{countryId:"BGD",category:"MACRO_FX",now:NOW});
 const minerals=await countPrivateOsintCountryEvidence(env,{countryId:"BGD",category:"CRITICAL_MINERALS",now:NOW});
 assert.equal(geo.observed_count,1);
 assert.equal(macro.observed_count,1);
 assert.equal(minerals.observed_count,1);
 assert.equal(geo.source_lane,PRIVATE_OSINT_RISK_EVIDENCE_LANE);
 assert.equal(geo.original_page_verified,false);
 assert.equal(geo.event_verified,false);
 assert.equal(geo.scored,false);
 await assert.rejects(()=>countPrivateOsintCountryEvidence(env,{countryId:"BAD!",category:"GEOPOLITICS",now:NOW}),/TARGET_INVALID/);
 await assert.rejects(()=>countPrivateOsintCountryEvidence(env,{countryId:"BGD",category:"OTHER",now:NOW}),/TARGET_INVALID/);
 db.close();
});

test("private OSINT bridge rejects broken D1 readback and never manufactures zero on transport failure",async()=>{
 const input={countryId:"BGD",category:"GEOPOLITICS",now:NOW};
 await assert.rejects(()=>countPrivateOsintCountryEvidence({},input),/D1_UNAVAILABLE/);
 await assert.rejects(()=>countPrivateOsintCountryEvidence({
  DB:{prepare:()=>({bind:()=>({all:async()=>({results:null})})})}},input
 ),/READBACK_INVALID/);
});

test("20-observation ceiling and unique primary identity preserve bounded free D1 reads",async()=>{
 const {db,put,env}=seededDb();
 for(let i=0;i<35;i++)put(i.toString(16).padStart(64,"0"),"geopolitics","BGD");
 const r=await countPrivateOsintCountryEvidence(env,{countryId:"BGD",category:"GEOPOLITICS",now:NOW});
 assert.equal(r.observed_count,20);
 db.close();
});

test("actual unified snapshot uses private OSINT only as unverified fallback; no URLs, IDs, event claims or numeric scores",async()=>{
 const items=new Map(),riskRows=new Map(),snapshots=new Map(),seenSql=[],fetches=[];
 const researchRows=[
  {item_id:H,native_feed_published_at:AT,verification_status:PRIVATE_OSINT_RISK_STATUS},
  {item_id:H,native_feed_published_at:AT,verification_status:PRIVATE_OSINT_RISK_STATUS},
  {item_id:I,native_feed_published_at:AT,verification_status:PRIVATE_OSINT_RISK_STATUS},
 ];
 const DB={prepare(sql){seenSql.push(sql);return {bind(...args){return {
  async first(){
   if(sql.startsWith("SELECT snapshot_json"))
    return snapshots.get(args[0]+"|"+args[1]+"|"+args[2])??null;
   return null;
  },
  async all(){
   if(sql.includes("FROM private_osint_news_25h"))
    return {results:args[1]==="geopolitics"?researchRows:[]};
   return {results:[]};
  },
  async run(){
   if(sql.startsWith("INSERT OR IGNORE INTO risk_observations"))
    riskRows.set(args[3],{payload:JSON.parse(args[7]),sourceCount:args[8],status:args[10]});
   if(sql.startsWith("INSERT OR IGNORE INTO unified_risk_snapshots")){
    snapshots.set(args[0]+"|"+args[1]+"|"+args[2],{
     snapshot_json:args[3],audit_proof_json:args[4],content_sha256:args[5],
     generated_at:args[6],supabase_synced_at:null,
    });
   }
   return {success:true};
  }
 }}},all:async()=>({results:[]})}}};
 const env={DB,RISK_GATE_OBSERVATION_HMAC_KEY:"unit-test-domain-separated-hmac-secret-32bytes-plus"};
 const fetcher=async url=>{fetches.push(url);return Response.json({},{status:503})};
 const {snapshot,audit_proof}=await generateUnifiedSnapshot(env,{type:"COUNTRY",id:"BGD"},{now:NOW,fetcher});
 assert.equal(snapshot.categories.GEOPOLITICS.status,"OBSERVED_UNVERIFIED");
 assert.equal(snapshot.categories.GEOPOLITICS.source_count,2);
 assert.equal(snapshot.categories.GEOPOLITICS.private_osint_research_only,true);
 assert.equal(snapshot.categories.GEOPOLITICS.source_lane,PRIVATE_OSINT_RISK_EVIDENCE_LANE);
 assert.equal(snapshot.categories.MACRO_FX.source_count,0);
 assert.equal(snapshot.categories.CRITICAL_MINERALS.source_count,0);
 assert.equal(snapshot.unified_risk_score,null);
 assert.equal(snapshot.assessment_status,"INSUFFICIENT_VERIFIED_CATEGORY_COVERAGE");
 assert.equal(snapshot.tiers.core.gate_decision,"GATE_INSUFFICIENT_EVIDENCE");
 assert.equal(snapshot.chargeable,false);
 assert.equal(fetches.length,2,"Google remains last resort for genuinely missing categories");
 assert.equal(riskRows.get("GEOPOLITICS").payload.private_osint_research_observation_count,2);
 assert.deepEqual(riskRows.get("GEOPOLITICS").payload.sources,[]);
 assert.equal(riskRows.get("GEOPOLITICS").sourceCount,2);
 assert.equal(riskRows.get("GEOPOLITICS").status,"OBSERVED_UNVERIFIED");
 const stored=JSON.stringify([...riskRows.values()])+JSON.stringify(snapshot);
 assert.ok(!stored.includes(H)&&!stored.includes(I),"raw research identities never stored in risk outputs");
 assert.ok(!stored.includes("example.org")&&!stored.includes("projection_json"));
 assert.match(audit_proof.signature,/^hmac_sha256:[a-f0-9]{64}$/);
 assert.equal(seenSql.filter(q=>q.includes("FROM private_osint_news_25h")).length,3);
 assert.equal(seenSql.some(q=>q.includes("SELECT projection_json FROM private_osint_news_25h")),false);
});
