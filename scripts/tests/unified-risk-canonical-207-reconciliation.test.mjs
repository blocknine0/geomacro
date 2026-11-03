import test from "node:test";
import assert from "node:assert/strict";
import {createHash,createHmac} from "node:crypto";
import {CANONICAL_UNIFIED_TARGETS,syncUnifiedRiskSupabase,UNIFIED_SCHEMA}
 from "../../workers/control-plane/src/unified-risk-gate.mjs";
import {RISK_207_CANONICAL_ORIGIN,reconcileRisk207Production,risk207PageExpected}
 from "../ops/reconcile-unified-risk-207-production.mjs";

const NOW=Date.parse("2026-11-03T09:00:00.000Z");
const DAY="2026-11-03",SECRET="unit-test-real-mac-protection-32-byte-hmac-secret";
const ordered=[...CANONICAL_UNIFIED_TARGETS].sort((x,y)=>
 x.type===y.type?(x.id<y.id?-1:x.id>y.id?1:0):x.type<y.type?-1:1);
function item(type,id){
 const snapshot={schema:UNIFIED_SCHEMA,target_type:type,target_id:id,
  day_utc:DAY,generated_at:new Date(NOW).toISOString(),
  categories:{GEOPOLITICS:{risk_score:null},MACRO_FX:{risk_score:null},
   CRITICAL_MINERALS:{risk_score:null}},
  unified_risk_score:null};
 const content_sha256=createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
 const timestamp_utc=snapshot.generated_at;
 const signature="hmac_sha256:"+createHmac("sha256",SECRET)
  .update(JSON.stringify({schema:UNIFIED_SCHEMA,content_sha256,timestamp_utc})).digest("hex");
 const audit_proof={content_sha256,timestamp_utc,signature,
  signature_scope:"SNAPSHOT_INTEGRITY_NOT_EVENT_VERIFICATION"};
 return {entity_type:type,entity_id:id,day_utc:DAY,
  snapshot_json:JSON.stringify(snapshot),audit_proof_json:JSON.stringify(audit_proof),
  content_sha256,generated_at:timestamp_utc};
}
function fixture(page,{tamper=false,corruptRemote=false,remoteCount=0}={}){
 const rows=ordered.slice(page*12,page*12+12).map(x=>item(x.type,x.id));
 if(tamper)rows[0].snapshot_json=JSON.stringify({...JSON.parse(rows[0].snapshot_json),
  unified_risk_score:0.99});
 const remote=new Map(rows.slice(0,remoteCount).map(x=>[x.entity_type+"|"+x.entity_id,x.content_sha256]));
 let puts=0,updates=0,gets=0,seenSQL="";
 const env={
  RISK_GATE_SUPABASE_ACCEPTANCE:"ACCEPTED_PRIVATE_RISK_GATE_DAILY",
  RISK_GATE_SUPABASE_URL:"https://receipt-test.supabase.co",
  RISK_GATE_SUPABASE_SERVICE_ROLE_KEY:"not-a-real-service-role-key-for-tests-only-32",
  RISK_GATE_OBSERVATION_HMAC_KEY:SECRET,
  DB:{prepare(sql){seenSQL=sql;return {bind(day,offset){return {
   async all(){
    assert.equal(day,DAY);
    assert.equal(offset,page*12);
    return {results:rows};
   },
   async run(){updates++;return {success:true}}
  }}}}}
 };
 const fetcher=async(url,opts)=>{
  if(opts.method==="POST"){
   puts++;
   const payload=JSON.parse(opts.body);
   for(const p of payload)remote.set(p.entity_type+"|"+p.entity_id,p.content_sha256);
   return new Response("",{status:201});
  }
  gets++;
  if(corruptRemote)return Response.json(rows.map(x=>({entity_type:x.entity_type,
   entity_id:x.entity_id,day_utc:DAY,content_sha256:"f".repeat(64)})));
  return Response.json(rows.filter(x=>remote.has(x.entity_type+"|"+x.entity_id)).map(x=>({
   entity_type:x.entity_type,entity_id:x.entity_id,day_utc:DAY,
   content_sha256:remote.get(x.entity_type+"|"+x.entity_id)
  })));
 };
 return {env,fetcher,state:()=>({puts,updates,gets,seenSQL})};
}
test("207 canonical identities are exact 18 immutable pages, last 3, never TWN",()=>{
 assert.equal(ordered.length,207);
 assert.equal(new Set(ordered.map(x=>x.type+"|"+x.id)).size,207);
 assert.equal(ordered.some(x=>x.id==="TWN"),false);
 assert.equal(ordered.slice(17*12).length,3);
 assert.equal(Array.from({length:18},(_,i)=>risk207PageExpected(i)).reduce((a,b)=>a+b,0),207);
});
test("already identical remote SHA is read-only; no fake new row or duplicate paid write",async()=>{
 const f=fixture(0,{remoteCount:12});
 const result=await syncUnifiedRiskSupabase(f.env,{scope:"CANONICAL_PAGE",page:0,now:NOW,fetcher:f.fetcher});
 assert.equal(result.ok,true);assert.equal(result.remote_rows_repaired,0);
 assert.equal(result.canonical_page_count,12);
 assert.equal(f.state().puts,0);
 assert.equal(f.state().gets,1);
 assert.equal(f.state().updates,12);
 assert.match(f.state().seenSQL,/UPDATE unified_risk_snapshots SET supabase_synced_at=/);
});
test("repair only 2 genuine missing remote rows and prove all 12 SHA receipts",async()=>{
 const f=fixture(1,{remoteCount:10});
 const result=await syncUnifiedRiskSupabase(f.env,{scope:"CANONICAL_PAGE",page:1,now:NOW,fetcher:f.fetcher});
 assert.equal(result.ok,true);assert.equal(result.remote_rows_repaired,2);
 assert.equal(result.canonical_page,1);
 assert.equal(f.state().puts,1);
 assert.equal(f.state().gets,2);
 assert.equal(f.state().updates,12);
});
test("canonical page 17 reads exactly 3 real corridor/country snapshots",async()=>{
 const f=fixture(17);
 const r=await syncUnifiedRiskSupabase(f.env,{scope:"CANONICAL_PAGE",page:17,now:NOW,fetcher:f.fetcher});
 assert.equal(r.ok,true);assert.equal(r.canonical_page_count,3);
 assert.equal(r.remote_rows_repaired,3);
});
test("invalid page, tampered local HMAC or persistently mismatched remote digest always red",async()=>{
 const f=fixture(0);
 const bad=await syncUnifiedRiskSupabase(f.env,{scope:"CANONICAL_PAGE",page:18,now:NOW,fetcher:f.fetcher});
 assert.equal(bad.ok,false);assert.equal(bad.error,"UNIFIED_SUPABASE_CANONICAL_PAGE_INVALID");
 const t=fixture(0,{tamper:true});
 const rejected=await syncUnifiedRiskSupabase(t.env,{scope:"CANONICAL_PAGE",page:0,now:NOW,fetcher:t.fetcher});
 assert.equal(rejected.ok,false);
 assert.equal(rejected.error,"UNIFIED_SUPABASE_LOCAL_HMAC_OR_ID_INVALID");
 assert.equal(t.state().puts,0);
 const m=fixture(0,{corruptRemote:true});
 const failed=await syncUnifiedRiskSupabase(m.env,{scope:"CANONICAL_PAGE",page:0,now:NOW,fetcher:m.fetcher});
 assert.equal(failed.ok,false);
 assert.equal(failed.error,"UNIFIED_SUPABASE_HASH_MISMATCH");
 assert.equal(m.state().updates,0);
});
function census(complete){
 return {schema:"geomacro.unified-risk-census.v1",ok:true,
  expected:{total:207},country_count:195,corridor_count:12,
  country_synced:complete?195:121,corridor_synced:complete?12:1,
  supabase_live_readback_verified:complete,remote_count:complete?207:122,
  remote_hash_matches:complete?207:122,remote_readback_status:complete?"MATCHED":"INCOMPLETE_OR_UNAVAILABLE",
  complete,commercial_activation:false};
}
test("owner process reconciles all exact pages with strict authenticated final census",async()=>{
 let checked=0,getCount=0;
 const fetcher=async(url,options)=>{
  assert.ok(url.startsWith(RISK_207_CANONICAL_ORIGIN+"/v1/internal/risk-gate/"));
  assert.equal(options.headers.Authorization,"Bearer "+"a".repeat(64));
  if(options.method==="POST"){
   const {page}=JSON.parse(options.body);
   assert.equal(page,checked++,"never skip a canonical page");
   return Response.json({schema:"geomacro.unified-risk-reconcile-page.v1",
    ok:true,page,receipt_count:risk207PageExpected(page),
    remote_rows_repaired:page%2,remote_hash_readback_verified:true,
    no_funds:true,commercial_activation:false});
  }
  return Response.json(census(++getCount===2));
 };
 const verified=await reconcileRisk207Production({fetcher,token:"a".repeat(64)});
 assert.equal(verified.ok,true);assert.equal(verified.verified,207);
 assert.equal(verified.pages_checked,18);assert.equal(checked,18);
 assert.equal(verified.remote_sha_matches,207);
});
test("owner reconciliation refuses fabricated page, invalid origin and incomplete final census",async()=>{
 await assert.rejects(()=>reconcileRisk207Production({token:"a".repeat(64),origin:"https://example.com"}),/RISK_207_OWNER_AUTH_OR_ORIGIN_INVALID/);
 const bad=async(url,options)=>options.method==="POST"?
  Response.json({schema:"geomacro.unified-risk-reconcile-page.v1",
   ok:true,page:0,receipt_count:12,remote_hash_readback_verified:false,
   remote_rows_repaired:0,no_funds:true,commercial_activation:false}):
  Response.json(census(false));
 await assert.rejects(()=>reconcileRisk207Production({token:"a".repeat(64),fetcher:bad}),/RISK_207_EXACT_PAGE_SHA_READBACK_FAILED_0/);
});
