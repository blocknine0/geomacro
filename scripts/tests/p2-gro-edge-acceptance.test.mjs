import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {groEvidenceTick,groEvidenceBackfill,groEvidenceStatus}
 from "../../workers/control-plane/src/gro-evidence-enrichment.mjs";
import {readIncrementalWebsiteCategoryFeed}
 from "../../workers/control-plane/src/website-incremental-feed.mjs";

const NOW=Date.parse("2026-11-04T18:00:00.000Z");
const hash="a".repeat(64);
const archiveMigration=readFileSync(
 "workers/control-plane/migrations/0120_gro_archival_evidence_outbox.sql","utf8");
test("B2 archive ACK atomically enqueues GRO; verified requires independent evidence and score",()=>{
 assert.match(archiveMigration,/AFTER UPDATE OF b2_object_sha256 ON phase2h_private_raw_news/u);
 assert.match(archiveMigration,/OLD\.b2_object_sha256 IS NULL/u);
 assert.match(archiveMigration,/NEW\.b2_archived_at IS NOT NULL/u);
 assert.match(archiveMigration,/INSERT OR IGNORE INTO gro_evidence_jobs/u);
 assert.match(archiveMigration,/independent_event_verified=1/u);
 assert.match(archiveMigration,/impact_score_0_100 IS NOT NULL/u);
 assert.match(archiveMigration,/independent_score_attestation_sha256 IS NOT NULL/u);
 assert.match(archiveMigration,/fact_cross_check='VERIFIED'/u);
 assert.match(archiveMigration,/CHECK\(is_gro_verified = 0 OR/u);
 assert.match(archiveMigration,/five_part_filled/u);
});

test("bounded backlog keyset checks B2-acked rows and advances independently",async()=>{
 let position="",jobs=[],writes=[];
 const env={DB:{
  prepare(sql){
   let args=[];
   const statement={
    _sql:sql,get _args(){return args;},
    bind(...params){args=params;return statement;},
    async first(){
     if(sql.includes("FROM gro_evidence_backfill_state"))
      return position?{last_record_id:position}:null;
     throw Error("unexpected first");
    },
    async all(){
     if(sql.includes("FROM phase2h_private_raw_news WHERE record_id>?"))
      return {results:[{
       record_id:hash,raw_sha256:"b".repeat(64),
       b2_object_sha256:"c".repeat(64),
       b2_archived_at:new Date(NOW-60000).toISOString(),
      }]};
     throw Error("unexpected all");
    },
   };
   return statement;
  },
  async batch(stmts){
   writes.push(stmts.map(s=>s._sql));
   for(const s of stmts){
    if(s._sql.includes("INSERT OR IGNORE INTO gro_evidence_jobs"))
      jobs=JSON.parse(s._args[0]);
    if(s._sql.includes("INSERT INTO gro_evidence_backfill_state"))
      position=s._args[0]||"RESET";
   }
   // Reset cursor is an empty string (not absent).
   position="";
   return stmts.map(()=>({success:true}));
  },
 }};
 const r=await groEvidenceBackfill(env,NOW);
 assert.equal(r.ok,true);
 assert.equal(r.scanned,1);
 assert.equal(r.archive_jobs_recovered,1);
 assert.equal(r.backfill_cycle_complete,true);
 assert.equal(r.provider_requests,0);
 assert.equal(jobs.length,1);
 assert.equal(jobs[0][0],hash);
 assert.equal(writes.length,1);
});
test("empty private GRO enrichment queue does not fabricate signatures or scores",async()=>{
 const env={DB:{
  prepare(sql){
   return {bind(){return this},async all(){
    if(sql.includes("FROM gro_evidence_jobs"))return {results:[]};
    throw Error();
   }};
  },async batch(){throw Error("no write for empty queue")},
 }};
 const r=await groEvidenceTick(env,NOW);
 assert.equal(r.ok,true);
 assert.equal(r.archived_jobs_examined,0);
 assert.equal(r.verified_gro_generated,0);
 assert.equal(r.paid_delivery_authorized,false);
 assert.equal(r.b2_requests,0);
});
test("protected GRO status cannot infer verification from raw counts",async()=>{
 const env={DB:{prepare(sql){
  return {async first(){
   if(sql.includes("WHERE is_gro_verified=1"))
    return {pending:14,quarantined:1,verified:0,unverified:22,filled:10};
   if(sql.includes("FROM gro_evidence_jobs j LEFT JOIN gro_evidence"))
    return {eligible:3,verified_within_15m:0,draft_within_15m:2};
   throw Error("unexpected status query");
  }};
 }}};
 const r=await groEvidenceStatus(env,NOW);
 assert.equal(r.status,200);
 const data=await r.json();
 assert.equal(data.pending,14);
 assert.equal(data.verified,0);
 assert.equal(data.unverified,22);
 assert.equal(data.acceptance.verified_15m_ratio,0);
 assert.equal(data.acceptance.verified_90pct_target_met,false);
 assert.equal(data.acceptance.draft_ready_within_15m,2);
 assert.equal(data.verified_requires_independent_source_and_score,true);
});
test("edge category feed refuses missing D1 even if legacy archive exists",async()=>{
 const env={DB:{prepare(){throw Error("D1 provider unavailable")}}};
 const r=await readIncrementalWebsiteCategoryFeed(env,"macro",NOW);
 assert.equal(r.status,503);
 const json=await r.json();
 assert.equal(json.canonical_read_failed,true);
 assert.deepEqual(json.signals,[]);
 assert.equal(r.headers.get("Cache-Control"),"no-store");
});
test("three category 60s D1 readback uses no website build or B2 calls",async()=>{
 const seen=[];
 const env={DB:{prepare(sql){
  seen.push(sql);
  return {bind(...args){assert(args[0]==="rare_earth");return this},
   async all(){return {results:[]}}};
 }}};
 const r=await readIncrementalWebsiteCategoryFeed(env,"rare_earth",NOW);
 assert.equal(r.status,200);
 const doc=await r.json();
 assert.equal(doc.ok,true);
 assert.equal(doc.gro_verified_publication,false);
 assert.equal(doc.scored,false);
 assert.equal(doc.chargeable,false);
 assert.equal(doc.source,"CANONICAL_WEBSITE_D1_JOURNAL");
 assert.equal(r.headers.get("Cache-Control"),"public, max-age=60");
 assert.equal(r.headers.get("X-GeoMacro-Data-Origin"),"canonical-d1");
 assert(seen.length===1&&seen[0].includes("website_derived_intelligence"));
 assert(!seen[0].includes("B2"));
});
test("invalid category is rejected and cannot amplify D1 reads",async()=>{
 let calls=0;
 const env={DB:{prepare(){calls++;throw Error()}}};
 const r=await readIncrementalWebsiteCategoryFeed(env,"../../private",NOW);
 assert.equal(r.status,400);assert.equal(calls,0);
});
