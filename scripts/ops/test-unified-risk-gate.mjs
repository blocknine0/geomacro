import test from "node:test";
import assert from "node:assert/strict";
import {PHASE2H_COUNTRIES_195} from "../../scripts/lib/phase2h-country-originals-195.mjs";
import {DAILY_RG_CORRIDORS} from "../../workers/control-plane/src/daily-risk-gate-generator.mjs";
import {CATEGORIES,validatedSignedCategoryScores} from "../../workers/control-plane/src/unified-risk-categories.mjs";
import {calculateUnifiedRisk,generateCommercialTiers,categoryView} from "../../workers/control-plane/src/unified-risk-engine.mjs";
import {scheduledUnifiedRisk,unifiedRiskGateEvaluate,generateUnifiedSnapshot} from "../../workers/control-plane/src/unified-risk-gate.mjs";

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
 const env={};const output=await scheduledUnifiedRisk(env,Date.parse("2026-11-03T12:00:00Z"));
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
