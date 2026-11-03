import test from "node:test";
import assert from "node:assert/strict";
import {createHash,createHmac} from "node:crypto";
import {syncUnifiedRiskSupabase,UNIFIED_SCHEMA}
 from "../../workers/control-plane/src/unified-risk-gate.mjs";

const DAY="2026-11-03",NOW=Date.parse("2026-11-03T08:30:00.000Z");
const SECRET="test-separate-hmac-secret-for-real-backlog-readback-32-bytes";
const ids=[["COUNTRY","CHN"],["COUNTRY","TWN"],["CORRIDOR","bab-el-mandeb"]];
function row(type,id,n=0){
 const snapshot={schema:UNIFIED_SCHEMA,target_type:type,target_id:id,
  day_utc:DAY,generated_at:new Date(NOW-n*1000).toISOString(),
  categories:{GEOPOLITICS:{risk_score:null},MACRO_FX:{risk_score:null},
   CRITICAL_MINERALS:{risk_score:null}},
  assessment_status:"INSUFFICIENT_VERIFIED_CATEGORY_COVERAGE",unified_risk_score:null};
 const content_sha256=createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
 const timestamp_utc=snapshot.generated_at;
 const signature="hmac_sha256:"+createHmac("sha256",SECRET).update(JSON.stringify({
  schema:UNIFIED_SCHEMA,content_sha256,timestamp_utc
 })).digest("hex");
 const proof={content_sha256,timestamp_utc,signature,
  signature_scope:"SNAPSHOT_INTEGRITY_NOT_EVENT_VERIFICATION"};
 return {entity_type:type,entity_id:id,day_utc:DAY,
  snapshot_json:JSON.stringify(snapshot),audit_proof_json:JSON.stringify(proof),
  content_sha256,generated_at:snapshot.generated_at,supabase_synced_at:null};
}
function setup({selected=ids.map(([t,id],i)=>row(t,id,i)),
 corrupt=false,remoteMismatch=false,remoteFailure=false}={}){
 const hugeBacklog=Array.from({length:20},(_,i)=>row("COUNTRY","BACKLOG"+i,100+i));
 let posted=[],remoteReads=0,updates=0,exactQueries=0,backlogQueries=0;
 const env={RISK_GATE_OBSERVATION_HMAC_KEY:SECRET,
  RISK_GATE_SUPABASE_ACCEPTANCE:"ACCEPTED_PRIVATE_RISK_GATE_DAILY",
  RISK_GATE_SUPABASE_URL:"https://receipt-test.supabase.co",
  RISK_GATE_SUPABASE_SERVICE_ROLE_KEY:"test-only-nonproduction-service-role-key-32-or-more",
  DB:{prepare(sql){
   return {bind(...args){return {
    async all(){
     if(sql.includes("WHERE day_utc=?")){
      exactQueries++;assert.equal(args[0],DAY);
      assert.doesNotMatch(sql,/WHERE supabase_synced_at IS NULL/);
      return {results:selected};
     }
     backlogQueries++;
     assert.match(sql,/WHERE supabase_synced_at IS NULL ORDER BY generated_at LIMIT 12/);
     return {results:hugeBacklog.slice(0,12)};
    },
    async run(){
     assert.match(sql,/UPDATE unified_risk_snapshots SET supabase_synced_at=/);
     updates++;return {success:true};
    }
   }}}
  }}
 };
 const fetcher=async(url,opts)=>{
  if(opts.method==="POST"){
   assert.match(url,/on_conflict=entity_type,entity_id,day_utc/);
   posted=JSON.parse(opts.body);
   if(corrupt)assert.fail("tampered local HMAC must never touch remote Supabase");
   return new Response("",{status:201});
  }
  remoteReads++;
  if(remoteFailure)return new Response("unavailable",{status:503});
  const result=posted.map(x=>({
   entity_type:x.entity_type,entity_id:x.entity_id,day_utc:x.day_utc,
   content_sha256:remoteMismatch?"f".repeat(64):x.content_sha256
  }));
  return Response.json(result);
 };
 return {env,fetcher,inspect:()=>({
  posted,remoteReads,updates,exactQueries,backlogQueries
 })};
}
test("owner canary exact scope bypasses unrelated 20-row backlog with verified real SHA receipts",async()=>{
 const x=setup();
 const out=await syncUnifiedRiskSupabase(x.env,{now:NOW,fetcher:x.fetcher,scope:"CANARY_EXACT"});
 assert.equal(out.ok,true);
 assert.equal(out.synced,3);
 assert.equal(out.exact_target_count,3);
 assert.equal(out.hash_readback_verified,true);
 const state=x.inspect();
 assert.deepEqual(state.posted.map(x=>x.entity_id).sort(),["CHN","TWN","bab-el-mandeb"]);
 assert.equal(state.remoteReads,1);
 assert.equal(state.updates,3);
 assert.equal(state.exactQueries,1);
 assert.equal(state.backlogQueries,0);
 assert.equal(state.posted.every(x=>x.snapshot.unified_risk_score===null),true);
});
test("already-synced local canary still re-posts and independently rechecks remote SHA",async()=>{
 const selected=ids.map(([t,id],i)=>({...row(t,id,i),supabase_synced_at:new Date(NOW-3000).toISOString()}));
 const x=setup({selected});
 const out=await syncUnifiedRiskSupabase(x.env,{now:NOW,fetcher:x.fetcher,scope:"CANARY_EXACT"});
 assert.equal(out.ok,true);
 assert.equal(x.inspect().posted.length,3);
});
test("missing genuine canary cannot be replaced by unrelated daily backlog row",async()=>{
 const x=setup({selected:ids.slice(1).map(([t,id],i)=>row(t,id,i))});
 const out=await syncUnifiedRiskSupabase(x.env,{now:NOW,fetcher:x.fetcher,scope:"CANARY_EXACT"});
 assert.equal(out.ok,false);
 assert.equal(out.error,"UNIFIED_CANARY_EXACT_D1_SET_INCOMPLETE");
 assert.equal(x.inspect().posted.length,0);
});
test("forged local HMAC fails before any private Supabase network request",async()=>{
 const selected=ids.map(([t,id],i)=>row(t,id,i));
 selected[0]={...selected[0],snapshot_json:JSON.stringify({...JSON.parse(selected[0].snapshot_json),
   assessment_status:"FORGED_VERIFIED"})};
 const x=setup({selected,corrupt:true});
 const out=await syncUnifiedRiskSupabase(x.env,{now:NOW,fetcher:x.fetcher,scope:"CANARY_EXACT"});
 assert.equal(out.ok,false);
 assert.equal(out.error,"UNIFIED_SUPABASE_LOCAL_HMAC_OR_ID_INVALID");
 assert.equal(x.inspect().posted.length,0);
 assert.equal(x.inspect().updates,0);
});
test("remote SHA mismatch and HTTP 503 leave D1 sync flags unacknowledged",async()=>{
 for(const opts of [{remoteMismatch:true},{remoteFailure:true}]){
  const x=setup(opts);
  const out=await syncUnifiedRiskSupabase(x.env,{now:NOW,fetcher:x.fetcher,scope:"CANARY_EXACT"});
  assert.equal(out.ok,false);
  assert.equal(x.inspect().updates,0);
 }
});
test("invalid scope cannot turn owner canary into payment or arbitrary row selection",async()=>{
 const x=setup();
 const out=await syncUnifiedRiskSupabase(x.env,{scope:"ARBITRARY",now:NOW,fetcher:x.fetcher});
 assert.equal(out.ok,false);
 assert.equal(out.error,"UNIFIED_SUPABASE_SYNC_SCOPE_INVALID");
 assert.equal(x.inspect().posted.length,0);
});
