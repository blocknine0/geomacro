import test from "node:test";
import assert from "node:assert/strict";
import {PHASE2H_COUNTRIES_195} from "../../scripts/lib/phase2h-country-originals-195.mjs";
import {DAILY_RG_CORRIDORS} from "../../workers/control-plane/src/daily-risk-gate-generator.mjs";
import {CATEGORIES,validatedSignedCategoryScores} from "../../workers/control-plane/src/unified-risk-categories.mjs";
import {calculateUnifiedRisk,generateCommercialTiers,categoryView} from "../../workers/control-plane/src/unified-risk-engine.mjs";
import {scheduledUnifiedRisk,unifiedRiskGateEvaluate,generateUnifiedSnapshot,selectUnifiedRecoveryTarget,CANONICAL_UNIFIED_TARGETS,cleanupUnifiedRiskSupabase} from "../../workers/control-plane/src/unified-risk-gate.mjs";

test("canonical 195 x 3 plus 12 corridor registry",()=>{
 assert.equal(PHASE2H_COUNTRIES_195.length,195);
 assert.deepEqual(CATEGORIES,["GEOPOLITICS","MACRO_FX","CRITICAL_MINERALS"]);
 assert.equal(DAILY_RG_CORRIDORS.length,12);
 assert.equal(new Set(PHASE2H_COUNTRIES_195.map(x=>x.iso3)).size,195);
});
test("known weighted score and corridor multiplier",()=>{
 const s=calculateUnifiedRisk({GEOPOLITICS:.82,MACRO_FX:.45,CRITICAL_MINERALS:.88});
 assert.equal(s.unifiedScore,.7055);
 assert.equal(s.dominantFactor,"CRITICAL_MINERALS");
 const b=calculateUnifiedRisk({GEOPOLITICS:.82,MACRO_FX:.45,CRITICAL_MINERALS:.88},{corridorExposureMultiplier:1.2});
 assert.equal(b.unifiedScore,.8466);
});
test("unverified and unknown never silently mean zero risk",()=>{
 const s=calculateUnifiedRisk({GEOPOLITICS:.82,MACRO_FX:null,CRITICAL_MINERALS:0});
 assert.equal(s.unifiedScore,null);
 assert.equal(generateCommercialTiers(s).core.gate_decision,"GATE_INSUFFICIENT_EVIDENCE");
 assert.equal(generateCommercialTiers(s).signal.alert_level,"UNKNOWN");
 assert.equal(categoryView("MACRO_FX",2,null,null).status,"OBSERVED_UNVERIFIED");
});
test("source counts and authority host alone never hard block/pass",()=>{
 const s=calculateUnifiedRisk({GEOPOLITICS:.9,MACRO_FX:.8,CRITICAL_MINERALS:.7});
 assert.equal(generateCommercialTiers(s,{groVerified:false,confidence:1,
   policy:{block_at:.7,pass_below:.3,minimum_confidence:.8}}).core.gate_decision,"GATE_INSUFFICIENT_EVIDENCE");
 assert.deepEqual(validatedSignedCategoryScores({verification:{status:"UNVERIFIED"},attribution:[
  {driver:"conflict",score_contribution:90}]}),{});
});
test("verified signed-GRO driver contributions map only known categories",()=>{
 const g={verification:{status:"VERIFIED"},commercial_eligibility:{status:"VERIFIED"},attribution:[
  {driver:"conflict",score_contribution:40},{driver:"currency_fx",score_contribution:20},
  {driver:"critical_minerals",score_contribution:10},{driver:"shipping_logistics",score_contribution:30}]};
 assert.deepEqual(validatedSignedCategoryScores(g),
  {GEOPOLITICS:.4,MACRO_FX:.2,CRITICAL_MINERALS:.1});
});
test("unified route requires private token and valid 195-country target",async()=>{
 const env={RISK_GATE_TIERED_TOKEN:"a".repeat(64)};
 const req=(body,token="a".repeat(64))=>new Request("https://example.org/v1/risk-gate/unified/evaluate",{
  method:"POST",headers:{authorization:"Bearer "+token},body:JSON.stringify(body)});
 const unauthorized=await unifiedRiskGateEvaluate(req({target_type:"COUNTRY",target_id:"TWN"},"b".repeat(64)),env);
 assert.equal(unauthorized.status,401);
 const unknown=await unifiedRiskGateEvaluate(req({target_type:"COUNTRY",target_id:"ZZZ"}),env);
 assert.equal(unknown.status,400);
});
test("scheduler outside windows never triggers D1",async()=>{
 const env={};const output=await scheduledUnifiedRisk(env,Date.parse("2026-11-03T03:00:00Z"));
 assert.equal(output.not_due,true);
});

test("TWN country three-category D1-first daily snapshot and tamper-evident HMAC",async()=>{
 const now=Date.parse("2026-11-03T05:00:00Z"),days="2026-11-03",store=new Map(),categories=[];
 const rss='<rss><channel><item><title>Taiwan naval blockade alert - Example Wire</title>'+
  '<link>https://news.google.com/rss/articles/verified-link-no-event-proof</link>'+
  '<pubDate>Tue, 03 Nov 2026 04:00:00 GMT</pubDate>'+
  '<source url="https://www.example.com">Example Publisher</source></item></channel></rss>';
 const env={RISK_GATE_TIERED_TOKEN:"a".repeat(64),
 RISK_GATE_OBSERVATION_HMAC_KEY:"test-strong-separate-signing-key-32bytes-min",
 DB:{prepare(sql){return {
  bind(...params){return {
   async first(){
    if(sql.startsWith("SELECT snapshot_json"))return store.get(params[0]+"|"+params[1]+"|"+params[2])??null;
    if(sql.startsWith("SELECT * FROM country_gro_verified_hot"))return null;
    return null;
   },
   async all(){if(sql.includes("FROM phase2h_private_raw_news"))return {results:[]};return {results:[]}},
   async run(){
    if(sql.startsWith("INSERT OR IGNORE INTO risk_observations"))categories.push(params[3]);
    if(sql.startsWith("INSERT OR IGNORE INTO unified_risk_snapshots")){
      const [entity_type,entity_id,day_utc,snapshot_json,audit_proof_json,content_sha256,generated_at]=params;
      store.set(entity_type+"|"+entity_id+"|"+day_utc,
       {snapshot_json,audit_proof_json,content_sha256,generated_at,supabase_synced_at:null});
    }
    return {success:true};
   }
  }},
  async all(){return {results:[]}}
 }}}};
 const fetcher=async()=>new Response(rss,{status:200});
 const req=new Request("https://example.org/v1/risk-gate/unified/evaluate",{
  method:"POST",headers:{authorization:"Bearer "+"a".repeat(64)},
  body:JSON.stringify({target_type:"COUNTRY",target_id:"TWN",client_policy:"STRICT"})});
 const result=await unifiedRiskGateEvaluate(req,env,{now,fetcher});
 assert.equal(result.status,200);
 const data=await result.json();
 assert.equal(data.target_id,"TWN");
 assert.equal(data.tiers.core.gate_decision,"GATE_INSUFFICIENT_EVIDENCE");
 assert.equal(data.unified_risk_score,null);
 assert.equal(data.verified_live_scoring.status,"CURRENT_SIGNED_GRO_UNAVAILABLE");
 assert.equal(data.verified_live_scoring.unified_risk_score,null);
 assert.equal(data.verified_live_scoring.trusted_signed_gro_verified,false);
 assert.equal(data.verified_live_scoring.included_in_daily_snapshot_hmac,false);
 assert.equal(data.policy_evaluation_has_complete_verified_score,false);
 assert.equal(data.categories.GEOPOLITICS.status,"OBSERVED_UNVERIFIED");
 assert.equal(data.categories.MACRO_FX.risk_score,null);
 assert.equal(data.categories.CRITICAL_MINERALS.risk_score,null);
 assert.deepEqual(categories,CATEGORIES);
 assert.equal(store.size,1);
 assert.match(data.audit_proof.signature,/^hmac_sha256:[a-f0-9]{64}$/);
 const again=await generateUnifiedSnapshot(env,{type:"COUNTRY",id:"TWN"},{now,fetcher});
 assert.equal(again.existing,true);
 assert.equal(store.size,1);
});
test("lenient override requires explicit client acknowledgment",async()=>{
 const token="a".repeat(64),env={RISK_GATE_TIERED_TOKEN:token};
 const r=await unifiedRiskGateEvaluate(new Request("https://example.org/v1/risk-gate/unified/evaluate",{
  method:"POST",headers:{authorization:"Bearer "+token},
  body:JSON.stringify({target_type:"COUNTRY",target_id:"TWN",client_policy:"LENIENT"})
 }),env);
 assert.equal(r.status,400);
});

test("rotating recovery selects ungenerated canonical cells but never optional TWN",()=>{
 const now=Date.parse("2026-11-03T09:00:00Z");
 assert.equal(CANONICAL_UNIFIED_TARGETS.length,207);
 assert.equal(new Set(CANONICAL_UNIFIED_TARGETS.map(x=>x.type+"|"+x.id)).size,207);
 assert.equal(CANONICAL_UNIFIED_TARGETS.some(x=>x.id==="TWN"),false);
 const remaining=CANONICAL_UNIFIED_TARGETS[0];
 const completed=CANONICAL_UNIFIED_TARGETS.slice(1)
  .map(x=>({entity_type:x.type,entity_id:x.id}));
 assert.deepEqual(selectUnifiedRecoveryTarget(completed,[],now),remaining);
 assert.equal(selectUnifiedRecoveryTarget(completed,[{
  entity_type:remaining.type,entity_id:remaining.id,attempt_count:3,
  next_retry_at:new Date(now-1000).toISOString()
 }],now),null);
 assert.equal(selectUnifiedRecoveryTarget(completed,[{
  entity_type:remaining.type,entity_id:remaining.id,attempt_count:1,
  next_retry_at:new Date(now+60000).toISOString()
 }],now),null);
 assert.deepEqual(selectUnifiedRecoveryTarget(completed,[{
  entity_type:remaining.type,entity_id:remaining.id,attempt_count:1,
  next_retry_at:new Date(now-60000).toISOString()
 }],now),remaining);
 assert.deepEqual(selectUnifiedRecoveryTarget(completed,[],Date.parse("2026-11-03T18:14:00Z")),remaining);
 assert.equal(selectUnifiedRecoveryTarget(completed,[],Date.parse("2026-11-03T18:15:00Z")),null);
 assert.equal(selectUnifiedRecoveryTarget([],[],Date.parse("2026-11-03T19:00:00Z")),null);
});
test("missed-slot catch-up fails closed if remote D1 is unavailable",async()=>{
 const r=await scheduledUnifiedRisk({},Date.parse("2026-11-03T09:30:00Z"));
 assert.equal(r.ok,false);
 assert.equal(r.error,"UNIFIED_RECOVERY_D1_UNAVAILABLE");
});

test("hourly seven-day retention uses remote readback before any D1 prune",async()=>{
 const now=Date.parse("2026-11-13T08:35:00Z"),sqlCalls=[];
 let remoteDelete=0,remoteRead=0,remoteOldRows=[];
 const env={RISK_GATE_SUPABASE_ACCEPTANCE:"ACCEPTED_PRIVATE_RISK_GATE_DAILY",
  RISK_GATE_SUPABASE_URL:"https://rg-example.supabase.co",
  RISK_GATE_SUPABASE_SERVICE_ROLE_KEY:"test-private-not-a-production-key-32bytes",
  DB:{prepare(query){return {bind(...params){return {
   async run(){sqlCalls.push({query,params});return {success:true}}
  }}}}}
 };
 const fetcher=async(url,opt)=>{
  assert.match(url,/generated_at=lt/);
  assert.match(url,/2026-11-06/);
  if(opt.method==="DELETE"){remoteDelete++;return new Response(null,{status:204})}
  remoteRead++;return Response.json(remoteOldRows);
 };
 const cleaned=await cleanupUnifiedRiskSupabase(env,{now,fetcher});
 assert.equal(cleaned.ok,true);
 assert.equal(cleaned.verified,true);
 assert.equal(cleaned.interval_hours,1);
 assert.equal(cleaned.retention_days,7);
 assert.equal(remoteDelete,1);
 assert.equal(remoteRead,1);
 assert.ok(sqlCalls.some(x=>x.query.startsWith("DELETE FROM unified_risk_generation_attempts")));
 assert.ok(sqlCalls.some(x=>x.query.startsWith("DELETE FROM risk_observations")));
 assert.ok(sqlCalls.some(x=>x.query.startsWith("DELETE FROM unified_risk_snapshots")&&
   x.query.includes("supabase_synced_at IS NOT NULL")));
 assert.ok(sqlCalls.some(x=>x.query.startsWith("INSERT INTO risk_gate_daily_housekeeping")));
 sqlCalls.length=0;
 remoteOldRows=[{entity_id:"STALE"}];
 const blocked=await cleanupUnifiedRiskSupabase(env,{now,fetcher});
 assert.equal(blocked.ok,false);
 assert.equal(blocked.error,"UNIFIED_CLEANUP_READBACK_FAILED");
 assert.equal(sqlCalls.length,0);
});
