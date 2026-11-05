import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash,createHmac} from "node:crypto";
import {RISK_GATE_HOT50,activeRiskTargets} from "../../workers/control-plane/src/risk-gate-hot50-scope.mjs";
import {scheduledUnifiedRisk,unifiedRiskGateEvaluate,runUnifiedRiskSevenDayRollup,syncUnifiedRiskSupabase,UNIFIED_SCHEMA} from "../../workers/control-plane/src/unified-risk-gate.mjs";
const secret="test-only-hot50-hmac-32-characters-secret",now=Date.parse("2026-11-05T12:00:00Z");
test("exact owner Hot50 list and three prices stay pinned",()=>{
 const manifest=JSON.parse(readFileSync(new URL("../../config/hot-50-three-domain-watch.v1.json",import.meta.url)));
 assert.deepEqual(RISK_GATE_HOT50,manifest.country_iso3);
 assert.equal(new Set(RISK_GATE_HOT50).size,50);
 assert.equal(activeRiskTargets({RISK_GATE_COUNTRY_SCOPE:"HOT50"},[]).length,50);
});
test("out of scope and corridor requests spend zero D1 operations",async()=>{
 const env={RISK_GATE_COUNTRY_SCOPE:"HOT50",RISK_GATE_TIERED_TOKEN:"a".repeat(64),DB:{prepare(){assert.fail("outside scope touched D1")}}};
 for(const [type,id] of [["COUNTRY","TWN"],["COUNTRY","FJI"],["CORRIDOR","hormuz"]]){
  const response=await unifiedRiskGateEvaluate(new Request("https://test.invalid",{method:"POST",headers:{Authorization:"Bearer "+env.RISK_GATE_TIERED_TOKEN},body:JSON.stringify({target_type:type,target_id:id,product_tier:"standard"})}),env);
  assert.equal(response.status,400);assert.equal((await response.json()).error,"RISK_GATE_OUTSIDE_HOT50_SCOPE");
 }
});
test("Hot50 recovery skips unused minute slots without a census query",async()=>{
 for(const stamp of ["2026-11-05T06:00:00Z","2026-11-05T08:20:00Z","2026-11-05T09:01:00Z"]){
  const r=await scheduledUnifiedRisk({RISK_GATE_COUNTRY_SCOPE:"HOT50",DB:{prepare(){assert.fail("idle slot queried D1")}}},Date.parse(stamp));
  assert.equal(r.not_due,true);
 }
});
function signedRow(id){
 const snapshot={schema:UNIFIED_SCHEMA,target_type:"COUNTRY",target_id:id,day_utc:"2026-11-05",generated_at:new Date(now).toISOString(),categories:{},basic_focused:{unified_risk_score:0.4,category_scores:{GEOPOLITICS:0.4,MACRO_FX:0.3,CRITICAL_MINERALS:0.2}}};
 const content_sha256=createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
 const proof={content_sha256,timestamp_utc:snapshot.generated_at,signature_scope:"SNAPSHOT_INTEGRITY_NOT_EVENT_VERIFICATION"};
 proof.signature="hmac_sha256:"+createHmac("sha256",secret).update(JSON.stringify({schema:UNIFIED_SCHEMA,content_sha256,timestamp_utc:proof.timestamp_utc})).digest("hex");
 return {entity_type:"COUNTRY",entity_id:id,day_utc:snapshot.day_utc,snapshot_json:JSON.stringify(snapshot),audit_proof_json:JSON.stringify(proof),content_sha256,generated_at:snapshot.generated_at};
}
test("150 category signals use one authenticated D1 history read and bounded exact remote chunks",async()=>{
 let reads=0,posts=[],last=[];
 const env={RISK_GATE_COUNTRY_SCOPE:"HOT50",RISK_GATE_OBSERVATION_HMAC_KEY:secret,RISK_GATE_SUPABASE_ACCEPTANCE:"ACCEPTED_PRIVATE_RISK_GATE_DAILY",RISK_GATE_SUPABASE_URL:"https://test.supabase.co",RISK_GATE_SUPABASE_SERVICE_ROLE_KEY:"test-only-service-role-32-character-secret",DB:{prepare(sql){reads++;assert.match(sql,/entity_id IN|country_iso3 IN/);return {bind(){return {all:async()=>({results:RISK_GATE_HOT50.map(signedRow)})}}}}}};
 const fetcher=async(url,options)=>{
  assert.ok(url.length<2400);
  assert.match(url,/geomacro_risk_signal_7d/);
  if(options.method==="POST"){last=JSON.parse(options.body);posts.push(last);return new Response(null,{status:201});}
  return Response.json(last);
 };
 const result=await runUnifiedRiskSevenDayRollup(env,{now,fetcher,mode:"BACKFILL"});
 assert.equal(result.ok,true,JSON.stringify(result));assert.equal(reads,2);
 assert.equal(result.risk_signal_rows,150);assert.equal(result.corridor_rows,0);
 assert.equal(posts.length,7);assert.ok(posts.every(x=>x.length<=24));
 assert.equal(result.assessment_status,"BLOCKED_NO_SIGNED_GRO");
});
test("corrupt history never reaches Supabase",async()=>{
 const row=signedRow("USA");row.content_sha256="f".repeat(64);
 const env={RISK_GATE_COUNTRY_SCOPE:"HOT50",RISK_GATE_OBSERVATION_HMAC_KEY:secret,RISK_GATE_SUPABASE_ACCEPTANCE:"ACCEPTED_PRIVATE_RISK_GATE_DAILY",RISK_GATE_SUPABASE_URL:"https://test.supabase.co",RISK_GATE_SUPABASE_SERVICE_ROLE_KEY:secret,DB:{prepare(){return {bind(){return {all:async()=>({results:[row]})}}}}}};
 const r=await runUnifiedRiskSevenDayRollup(env,{now,fetcher:()=>assert.fail("unverified history left runtime")});assert.equal(r.ok,false);
});
test("a corrupt historical row cannot block other verified countries or be forwarded",async()=>{
 const broken=signedRow("CHN");broken.audit_proof_json='{"signature":"forged"}';
 const valid=signedRow("USA");let posted=[];
 const env={RISK_GATE_COUNTRY_SCOPE:"HOT50",RISK_GATE_OBSERVATION_HMAC_KEY:secret,RISK_GATE_SUPABASE_ACCEPTANCE:"ACCEPTED_PRIVATE_RISK_GATE_DAILY",RISK_GATE_SUPABASE_URL:"https://test.supabase.co",RISK_GATE_SUPABASE_SERVICE_ROLE_KEY:secret,DB:{prepare(){return {bind(){return {all:async()=>({results:[broken,valid]})}}}}}};
 const r=await runUnifiedRiskSevenDayRollup(env,{now,mode:"BACKFILL",fetcher:async(url,options)=>{
  if(options.method==="POST"){posted=JSON.parse(options.body);return new Response(null,{status:201});}
  return Response.json(posted);
 }});
 assert.equal(r.ok,true);assert.equal(r.degraded,true);
 assert.equal(r.quarantined_snapshot_rows,1);assert.equal(r.snapshot_rows,1);
 assert.equal(r.risk_signal_rows,3);assert.ok(posted.every(x=>x.country_iso3==="USA"));
 assert.equal(r.assessment_rows,0);assert.equal(broken.audit_proof_json,'{"signature":"forged"}');
});

test("regular backlog sync advances valid rows without acknowledging a corrupt oldest row",async()=>{
 const broken=signedRow("CHN");broken.audit_proof_json="{}";
 const valid=signedRow("USA"),acked=[],posts=new Map();
 const env={RISK_GATE_COUNTRY_SCOPE:"HOT50",RISK_GATE_OBSERVATION_HMAC_KEY:secret,
  RISK_GATE_SUPABASE_ACCEPTANCE:"ACCEPTED_PRIVATE_RISK_GATE_DAILY",
  RISK_GATE_SUPABASE_URL:"https://test.supabase.co",RISK_GATE_SUPABASE_SERVICE_ROLE_KEY:secret,
  DB:{prepare(sql){const statement=(args=[])=>({bind(...v){return statement(v)},
   all:async()=>({results:[broken,valid]}),run:async()=>{assert.match(sql,/UPDATE unified_risk_snapshots/);acked.push(args[2]);return {success:true}}});return statement();}}};
 const r=await syncUnifiedRiskSupabase(env,{now,fetcher:async(url,options)=>{
  const table=url.includes("geomacro_unified_risk_daily")?"snapshots":"signals";
  if(options.method==="POST"){const body=JSON.parse(options.body);posts.set(table,body);return new Response(null,{status:201});}
  return Response.json(posts.get(table));
 }});
 assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.synced,1);
 assert.equal(r.degraded,true);assert.equal(r.quarantined_snapshot_rows,1);
 assert.deepEqual(acked,["USA"]);assert.equal(posts.get("snapshots")[0].entity_id,"USA");
 assert.ok(posts.get("signals").every(x=>x.country_iso3==="USA"));
});

test("Hot50 deployment never calls the incompatible 207-target reconciliation",()=>{
 const workflow=readFileSync(new URL("../../.github/workflows/deploy-d1-control-plane.yml",import.meta.url),"utf8");
 const deployment=workflow.slice(workflow.indexOf("  bootstrap-deploy-accept:"));
 assert.match(deployment,/RISK_GATE_COUNTRY_SCOPE: HOT50/);
 assert.match(deployment,/config.vars.RISK_GATE_COUNTRY_SCOPE !== process.env.RISK_GATE_COUNTRY_SCOPE/);
 const step=deployment.slice(deployment.indexOf("      - name: Reconcile current-day 207"));
 const gate=step.slice(0,step.indexOf("        shell:"));
 assert.match(gate,/if: env.RISK_GATE_COUNTRY_SCOPE != 'HOT50'/);
 const config=JSON.parse(readFileSync(new URL("../../workers/control-plane/wrangler.example.jsonc",import.meta.url)));
 assert.equal(config.vars.RISK_GATE_COUNTRY_SCOPE,"HOT50");
});
