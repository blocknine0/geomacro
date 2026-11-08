import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {decideStep2WebsiteReconcile} from "../ops/step2-website-reconcile-dedup.mjs";
import {evaluateStep2Headroom} from "../ops/step2-d1-headroom-telemetry.mjs";
import {groEvidenceBackfill} from "../../workers/control-plane/src/gro-evidence-enrichment.mjs";
const NOW=Date.parse("2026-11-08T12:00:00.000Z");
const env={GITHUB_EVENT_NAME:"schedule",GITHUB_REPOSITORY:"blocknine0/geomacro",
 GITHUB_REF:"refs/heads/main",GITHUB_TOKEN:"mock-repo-read-only-token"};
const step="Catch up 72h archived Website IDs to the common D1 partner journal";
const mockGitHub=({stepSuccess=true,runSuccess=true,ageMinutes=20,missing=false}={})=>
 async url=>{
  if(missing)return {ok:false,status:503};
  if(url.includes("/workflows/"))return {ok:true,json:async()=>({workflow_runs:[{
   id:123,head_branch:"main",status:"completed",
   conclusion:runSuccess?"success":"failure",
   updated_at:new Date(NOW-ageMinutes*60000).toISOString()}]})};
  if(url.includes("/runs/123/jobs"))return {ok:true,json:async()=>({jobs:[{
   conclusion:"success",steps:[{name:step,status:"completed",
    conclusion:stepSuccess?"success":"skipped",
    completed_at:new Date(NOW-ageMinutes*60000).toISOString()}]
  }]})};
  throw Error("UNEXPECTED_URL");
 };
test("daily duplicate is isolated only when primary exact reconciliation step succeeded",async()=>{
 const r=await decideStep2WebsiteReconcile({env,now:NOW,fetchImpl:mockGitHub()});
 assert.equal(r.should_run,false);
 assert.equal(r.reason,"PRIMARY_EXACT_D1_RECONCILE_STEP_RECENTLY_VERIFIED");
 assert.equal(r.provider_d1_queries,0);
 assert.equal(r.skipped_primary_ingestion,false);
 assert.equal(r.skipped_b2_archive,false);
});
test("green workflow without actual step proof never suppresses needed recovery",async()=>{
 for(const x of [{stepSuccess:false},{runSuccess:false},
  {ageMinutes:200},{missing:true}]){
  const r=await decideStep2WebsiteReconcile({env,now:NOW,fetchImpl:mockGitHub(x)});
  assert.equal(r.should_run,true);
  assert.equal(r.provider_d1_queries,0);
 }
 const manual=await decideStep2WebsiteReconcile({
  env:{...env,GITHUB_EVENT_NAME:"workflow_dispatch"},now:NOW,
  fetchImpl:async()=>{throw Error("NO_GITHUB_FETCH_ON_MANUAL")}});
 assert.equal(manual.should_run,true);
});
test("Step 2 workflow gates ONLY redundant restore and never protected collectors",()=>{
 const yml=readFileSync(".github/workflows/website-finds-canonical-d1-reconcile.yml","utf8");
 assert.match(yml,/step2-website-reconcile-dedup\.mjs/u);
 assert.match(yml,/steps\.step2-dedup\.outputs\.should_run == 'true'/u);
 const intake=[
  "five-minute-original-news-fastlane.yml",
  "private-global-osint-15m.yml",
  "hot50-direct-original-news-20m.yml",
  "all-source-reusable-news-json.yml"
 ];
 for(const name of intake){
  const original=readFileSync(".github/workflows/"+name,"utf8");
  assert.doesNotMatch(original,/GEOMACRO_STEP2_SUPPRESS_PRIMARY/u);
 }
});
test("0214 opt-in historical GRO backfill completes once, retains B2 enqueue independently",async()=>{
 const db=new DatabaseSync(":memory:");
 try{
  db.exec("CREATE TABLE phase2h_private_raw_news ("+
   "record_id TEXT PRIMARY KEY,raw_sha256 TEXT,b2_object_sha256 TEXT,b2_archived_at TEXT);"+
   "CREATE TABLE gro_evidence_jobs (record_id TEXT PRIMARY KEY,"+
   "raw_sha256 TEXT,b2_object_sha256 TEXT,archived_at TEXT,enqueued_at TEXT,state TEXT);"+
   "CREATE TABLE gro_evidence_backfill_state ("+
   "singleton INTEGER PRIMARY KEY,last_record_id TEXT NOT NULL,"+
   "updated_at TEXT NOT NULL,scan_complete INTEGER NOT NULL DEFAULT 0);");
  const id="a".repeat(64),raw="b".repeat(64),b2="c".repeat(64),
   at=new Date(NOW-60_000).toISOString();
  db.prepare("INSERT INTO phase2h_private_raw_news VALUES(?,?,?,?)")
   .run(id,raw,b2,at);
  let sourceReads=0,writes=0;
  const DB={
   prepare(sql){
    const statement={args:[],bind(...args){statement.args=args;return statement},
     async first(){return db.prepare(sql).get(...statement.args)},
     async all(){
      if(sql.includes("FROM phase2h_private_raw_news WHERE record_id>?"))sourceReads++;
      return {results:db.prepare(sql).all(...statement.args)};
     },
     async run(){writes++;const res=db.prepare(sql).run(...statement.args);
      return {success:true,changes:res.changes}};
    };return statement;
   },
   async batch(stmts){
    db.exec("BEGIN");
    try{
     for(const s of stmts){db.prepare(s.args&&s.sql?s.sql:s._sql).run(...s.args)}
     db.exec("COMMIT");writes++;
     return stmts.map(()=>({success:true}));
    }catch(e){db.exec("ROLLBACK");throw e}
   }
  };
  // D1 statements are closed-over fixtures, retain SQL for batch().
  const prep=DB.prepare.bind(DB);
  DB.prepare=sql=>{const st=prep(sql);st.sql=sql;return st};
  const e={DB,GEOMACRO_GRO_BACKFILL_ONCE_V1:"1"};
  const first=await groEvidenceBackfill(e,NOW);
  assert.equal(first.ok,true);
  assert.equal(first.scanned,1);
  assert.equal(sourceReads,1);
  assert.equal(db.prepare("SELECT scan_complete FROM gro_evidence_backfill_state WHERE singleton=1").get().scan_complete,1);
  const second=await groEvidenceBackfill(e,NOW+120_000);
  assert.equal(second.scanned,0);
  assert.equal(second.source_probe_skipped,true);
  assert.equal(sourceReads,1,"completed backfill cannot re-enumerate a growing raw table");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM gro_evidence_jobs").get().n,1);
 }finally{db.close()}
});

test("60k owner headroom uses only provider GraphQL receipt and never certifies intraday acceptance",()=>{
 const make=(rr,rw)=>({observed_at_utc:"2026-11-08T12:00:00.000Z",
  provider:{verified:true,day_utc:"2026-11-08",
   rows_read:rr,rows_written:rw}});
 const s=evaluateStep2Headroom(make(59000,59999),{now:new Date(NOW)});
 assert.equal(s.state,"INTRADAY_SAMPLE_ONLY_FULL_DAY_NOT_PROVEN");
 assert.equal(s.remaining_to_target_rows_read,1000);
 assert.equal(s.remaining_to_target_rows_written,1);
 assert.equal(s.provider_queries_by_this_telemetry,0);
 assert.equal(s.daily_60k_acceptance_verified,false);
 assert.equal(evaluateStep2Headroom(make(60000,100),{now:new Date(NOW)}).state,
  "TARGET_CROSSED_HOLD_NONESSENTIAL_WORK");
 assert.throws(()=>evaluateStep2Headroom({provider:{verified:false}}),
  /STEP2_PROVIDER_COUNTERS_UNVERIFIED/u);
});
